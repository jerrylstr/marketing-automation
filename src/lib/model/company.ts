import { Contact } from "./contact";
import { Entity } from "./hubspot/entity";
import { EntityKind } from "./hubspot/interfaces";
import { EntityAdapter, EntityManager } from "./hubspot/manager";

type CompanyData = {
  name: string;
  type: 'Partner' | null;
};

export class Company extends Entity<CompanyData, {}> {

  public contacts = this.makeDynamicAssociation<Contact>('contact');

}

const CompanyAdapter: EntityAdapter<CompanyData, {}> = {

  associations: [
    ['contact', 'down']
  ],

  data: {
    name: {
      property: 'name',
      down: name => name ?? '',
      up: name => name,
    },
    type: {
      property: 'type',
      down: type => type === 'PARTNER' ? 'Partner' : null,
      up: type => type === 'Partner' ? 'PARTNER' : '',
    },
  },

  computed: {},

};

export class CompanyManager extends EntityManager<CompanyData, {}, Company> {

  protected override Entity = Company;
  protected override kind: EntityKind = 'company';
  protected override entityAdapter = CompanyAdapter;

}
