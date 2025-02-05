import 'source-map-support/register';
import { Progress } from '../lib/io/interfaces';
import { CachedMemoryRemote, IO } from "../lib/io/io";
import { RawLicense, RawTransaction } from '../lib/model/marketplace/raw';

main();
async function main() {

  const noOpProgress: Progress = {
    setCount() { },
    tick() { },
  };

  const io = new IO(new CachedMemoryRemote());

  const licensesWith = await io.in.marketplace.downloadLicensesWithDataInsights(noOpProgress);
  const licensesWithout = await io.in.marketplace.downloadLicensesWithoutDataInsights(noOpProgress);
  const transactions = await io.in.marketplace.downloadTransactions(noOpProgress);

  function checkMapping(k1: K, k2: K) {
    const map = new Map<string, string>();
    let alwaysMapsTheSame;
    try {
      check(k1, k2, map, licensesWith);
      check(k1, k2, map, licensesWithout);
      check(k1, k2, map, transactions);
      alwaysMapsTheSame = true;
    }
    catch (e) {
      alwaysMapsTheSame = false;
    }
    const maps = (alwaysMapsTheSame
      ? '   always points to  exactly 1'
      : 'sometimes points to        > 1')
    console.log(`${k1} \t ${maps} \t ${k2}`)
  }

  const keys: K[] = [
    'appEntitlementNumber',
    'appEntitlementId',
    'addonLicenseId',
    'licenseId',
    'transactionId',
  ];

  for (const k1 of keys) {
    for (const k2 of keys) {
      if (k1 === k2) continue;
      checkMapping(k1, k2);
    }
    console.log();
  }

}

function check(k1: K, k2: K, map: Map<string, string>, records: readonly (RawLicense | RawTransaction)[]) {

  for (const r of records) {
    if (!(k1 in r) || !(k2 in r)) continue;

    const key = (r as any)[k1] as string;
    const val = (r as any)[k2] as string;

    if (map.has(key) && map.get(key) !== val) {
      // console.log({ old: map.get(id), new: r })
      throw new Error('Mapped to another value');
    }
    map.set(key, val);
  }

}

type K = (keyof RawLicense | keyof RawTransaction);
