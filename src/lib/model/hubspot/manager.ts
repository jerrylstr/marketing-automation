import * as assert from 'assert';
import { HubspotService, Progress } from '../../io/interfaces.js';
import { AttachableError } from '../../util/errors.js';
import { batchesOf } from '../../util/helpers.js';
import { Entity } from "./entity.js";
import { EntityKind, RelativeAssociation } from './interfaces.js';

export interface EntityDatabase {
  getEntity(kind: EntityKind, id: string): Entity<any>;
}

export type PropertyTransformers<T> = {
  [P in keyof T]: (prop: T[P]) => [string, string]
};

export abstract class EntityManager<
  P extends { [key: string]: any },
  E extends Entity<P>>
{

  protected static readonly noUpSync = (): [string, string] => ['', ''];

  protected static upSyncIfConfigured<T>(
    attributeKey: string | undefined,
    transformer: (localValue: T) => string
  ): (val: T) => [string, string] {
    return (attributeKey ?
      (value => [attributeKey, transformer(value)])
      : this.noUpSync);
  }

  constructor(
    private downloader: HubspotService,
    private uploader: HubspotService,
    private db: EntityDatabase
  ) { }

  public createdCount = 0;
  public updatedCount = 0;

  protected abstract Entity: new (id: string | null, kind: EntityKind, props: P) => E;
  protected abstract kind: EntityKind;
  protected abstract downAssociations: EntityKind[];
  protected abstract upAssociations: EntityKind[];

  protected abstract apiProperties: string[];
  protected abstract fromAPI(data: { [key: string]: string | null }): P | null;
  protected abstract toAPI: PropertyTransformers<P>;

  protected abstract identifiers: (keyof P)[];

  private entities: E[] = [];
  private indexes: Index<E>[] = [];
  public get = this.makeIndex(e => e.id ? [e.id] : []);

  private prelinkedAssociations = new Map<string, Set<RelativeAssociation>>();

  public async downloadAllEntities(progress: Progress) {
    const data = await this.downloader.downloadEntities(progress, this.kind, this.apiProperties, this.downAssociations);

    for (const raw of data) {
      const props = this.fromAPI(raw.properties);
      if (!props) continue;

      for (const item of raw.associations) {
        let set = this.prelinkedAssociations.get(raw.id);
        if (!set) this.prelinkedAssociations.set(raw.id, set = new Set());
        set.add(item);
      }

      const entity = new this.Entity(raw.id, this.kind, props);
      this.entities.push(entity);
    }

    for (const index of this.indexes) {
      index.clear();
      index.addIndexesFor(this.entities);
    }
  }

  public linkAssociations() {
    for (const [meId, rawAssocs] of this.prelinkedAssociations) {
      for (const rawAssoc of rawAssocs) {
        const me = this.get(meId);
        if (!me) throw new Error(`Couldn't find kind=${this.kind} id=${meId}`);

        const { toKind, youId } = this.getAssocInfo(rawAssoc);
        const you = this.db.getEntity(toKind, youId);
        if (!you) throw new Error(`Couldn't find kind=${toKind} id=${youId}`);

        me.addAssociation(you, { firstSide: true, initial: true });
      }
    }
    this.prelinkedAssociations.clear();
  }

  private getAssocInfo(a: RelativeAssociation) {
    const [kind, id] = a.split(':');
    return { toKind: kind as EntityKind, youId: id };
  }

  public create(props: P) {
    const e = new this.Entity(null, this.kind, props);
    this.entities.push(e);
    for (const index of this.indexes) {
      index.addIndexesFor([e]);
    }
    return e;
  }

  public removeLocally(entities: Iterable<E>) {
    for (const index of this.indexes) {
      index.removeIndexesFor(entities);
    }
    for (const e of entities) {
      const idx = this.entities.indexOf(e);
      this.entities.splice(idx, 1);
    }
  }

  public getAll(): Iterable<E> {
    return this.entities;
  }

  public getArray(): E[] {
    return this.entities;
  }

  public async syncUpAllEntities() {
    await this.syncUpAllEntitiesProperties();
    await this.syncUpAllEntitiesAssociations();
    for (const index of this.indexes) {
      index.clear();
      index.addIndexesFor(this.entities);
    }
  }

  private async syncUpAllEntitiesProperties() {
    const toSync = this.entities.filter(e => e.hasPropertyChanges());
    const toCreate = toSync.filter(e => e.id === undefined);
    const toUpdate = toSync.filter(e => e.id !== undefined);

    const batchSize = this.kind === 'contact' ? 10 : 100;

    if (toCreate.length > 0) {
      const groupsToCreate = batchesOf(toCreate, batchSize);
      for (const entitiesToCreate of groupsToCreate) {
        const results = await this.uploader.createEntities(
          this.kind,
          entitiesToCreate.map(e => ({
            properties: this.getChangedProperties(e),
          }))
        );

        for (const e of entitiesToCreate) {
          e.applyPropertyChanges();
        }

        for (const e of entitiesToCreate) {
          const found = results.find(result => {
            for (const localIdKey of this.identifiers) {
              const localVal = e.data[localIdKey];
              const [remoteIdKey, hsLocal] = this.toAPI[localIdKey](localVal);
              const hsRemote = result.properties[remoteIdKey] ?? '';
              if (hsLocal !== hsRemote) return false;
            }
            return true;
          });

          if (!found) {
            throw new AttachableError("Couldn't find ", JSON.stringify({
              local: e.data,
              remotes: results.map(r => ({
                id: r.id,
                properties: r.properties,
              })),
            }, null, 2));
          }

          assert.ok(found);
          e.id = found.id;
        }
      }
    }

    if (toUpdate.length > 0) {
      const groupsToUpdate = batchesOf(toUpdate, batchSize);
      for (const entitiesToUpdate of groupsToUpdate) {
        const results = await this.uploader.updateEntities(
          this.kind,
          entitiesToUpdate.map(e => ({
            id: e.guaranteedId(),
            properties: this.getChangedProperties(e),
          }))
        );

        for (const e of entitiesToUpdate) {
          e.applyPropertyChanges();
        }
      }
    }

    this.createdCount += toCreate.length;
    this.updatedCount += toUpdate.length;
  }

  private async syncUpAllEntitiesAssociations() {
    const toSync = (this.entities
      .filter(e => e.hasAssociationChanges())
      .flatMap(e => e.getAssociationChanges()
        .map(({ op, other }) => ({ op, from: e, to: other }))));

    for (const otherKind of this.upAssociations) {
      const toSyncInKind = (toSync
        .filter(changes => changes.to.kind === otherKind)
        .map(changes => ({
          ...changes,
          inputs: {
            fromId: changes.from.guaranteedId(),
            toId: changes.to.guaranteedId(),
            toType: otherKind,
          }
        })));

      const toAdd = toSyncInKind.filter(changes => changes.op === 'add');
      const toDel = toSyncInKind.filter(changes => changes.op === 'del');

      for (const toAddSubset of batchesOf(toAdd, 100)) {
        await this.uploader.createAssociations(
          this.kind,
          otherKind,
          toAddSubset.map(changes => changes.inputs),
        );
      }

      for (const toDelSubset of batchesOf(toDel, 100)) {
        await this.uploader.deleteAssociations(
          this.kind,
          otherKind,
          toDelSubset.map(changes => changes.inputs),
        );
      }
    }

    for (const changes of toSync) {
      changes.from.applyAssociationChanges();
    }
  }

  private getChangedProperties(e: E) {
    const properties: { [key: string]: string } = {};
    for (const [k, v] of Object.entries(e.getPropertyChanges())) {
      const fn = this.toAPI[k];
      const [newKey, newVal] = fn(v);
      if (newKey) properties[newKey] = newVal;
    }
    return properties;
  }

  protected makeIndex(keysFor: (e: E) => string[]): (key: string) => E | undefined {
    const index = new Index(keysFor);
    this.indexes.push(index);
    return index.get.bind(index);
  }

}

class Index<E> {

  private map = new Map<string, E>();
  constructor(private keysFor: (e: E) => string[]) { }

  clear() {
    this.map.clear();
  }

  addIndexesFor(entities: Iterable<E>) {
    for (const e of entities) {
      for (const key of this.keysFor(e)) {
        this.map.set(key, e);
      }
    }
  }

  removeIndexesFor(entities: Iterable<E>) {
    for (const e of entities) {
      for (const key of this.keysFor(e)) {
        this.map.delete(key);
      }
    }
  }

  get(key: string) {
    return this.map.get(key);
  }

}
