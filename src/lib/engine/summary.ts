import log from "../log/logger.js";
import { Table } from "../log/table.js";
import { Database } from "../model/database.js";
import { formatMoney, formatNumber } from "../util/formatters.js";
import { isPresent } from "../util/helpers.js";

export function printSummary(db: Database) {

  if (db.dealManager.duplicatesToDelete.size > 0) {
    log.warn('Deal Generator',
      'Found duplicate deals; delete them manually',
      [...db.dealManager.duplicatesToDelete].map(([dup, dupOf]) => ({
        "Primary": dupOf.size > 1
          ? [...dupOf].map(d => d.link())
          : dupOf.size === 0
            ? 'Unknown???'
            : [...dupOf][0].link(),
        "Duplicate": dup.link(),
      })));
  }

  const deals = db.dealManager.getArray();
  const dealSum = (deals
    .map(d => d.data.amount)
    .filter(isPresent)
    .reduce((a, b) => a + b));

  log.info('Summary', 'Results of this run:');

  const table = new Table(2);

  table.addRow([['Total Deal Count'], [formatNumber(deals.length), 'right']]);
  table.addRow([['Total Deal Sum'], [formatMoney(dealSum), 'right']]);

  table.addRow([['Deals Created'], [formatNumber(db.dealManager.createdCount), 'right']]);
  table.addRow([['Deals Updated'], [formatNumber(db.dealManager.updatedCount), 'right']]);
  table.addRow([['Deals Associated'], [formatNumber(db.dealManager.associatedCount), 'right']]);
  table.addRow([['Deals DisAssociated'], [formatNumber(db.dealManager.disassociatedCount), 'right']]);

  table.addRow([['Contacts Created'], [formatNumber(db.contactManager.createdCount), 'right']]);
  table.addRow([['Contacts Updated'], [formatNumber(db.contactManager.updatedCount), 'right']]);
  table.addRow([['Contacts Associated'], [formatNumber(db.contactManager.associatedCount), 'right']]);
  table.addRow([['Contacts Disassociated'], [formatNumber(db.contactManager.disassociatedCount), 'right']]);

  table.addRow([['Companies Updated'], [formatNumber(db.companyManager.updatedCount), 'right']]);

  for (const row of table.eachRow()) {
    log.info('Summary', '  ' + row);
  }

  db.tallier.less('Deal sum', dealSum);

  db.tallier.printTable();
}
