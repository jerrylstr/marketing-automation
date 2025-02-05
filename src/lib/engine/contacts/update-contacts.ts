import { domainFor } from "../../model/contact";
import { Database } from "../../model/database";
import { License } from "../../model/license";
import { Transaction } from "../../model/transaction";
import { KnownError } from "../../util/errors";
import { isPresent } from "../../util/helpers";
import { RelatedLicenseSet } from "../license-matching/license-grouper";
import { flagPartnersViaCoworkers } from "./contact-types";

export function updateContactsBasedOnMatchResults(db: Database, allMatches: RelatedLicenseSet[]) {
  for (const license of allMatches) {
    const contacts = new Set(license.map(license => db.contactManager.getByEmail(license.data.technicalContact.email)!));

    flagPartnersViaCoworkers([...contacts]);

    for (const contact of contacts) {
      const items = [
        ...license,
        ...license.flatMap(l => l.transactions)
      ];

      for (const tier of items.map(item => item.tier)) {
        if (contact.data.licenseTier !== null && tier > contact.data.licenseTier) {
          contact.data.licenseTier = tier;
        }
      }

      for (const item of items) {
        if (!contact.data.lastMpacEvent || contact.data.lastMpacEvent < item.data.maintenanceStartDate) {
          contact.data.lastMpacEvent = item.data.maintenanceStartDate;
        }
      }

      const addonKey = license[0].data.addonKey;
      const product = db.appToPlatform[addonKey];
      if (!product) {
        throw new KnownError(`Add "${addonKey}" to ADDONKEY_PLATFORMS`);
      }
      if (!db.archivedApps.has(addonKey)) {
        contact.data.relatedProducts.add(product);
      }

      const hosting = license[0].data.hosting;
      if (!contact.data.deployment) {
        contact.data.deployment = hosting;
      }
      else if (contact.data.deployment !== hosting) {
        contact.data.deployment = 'Multiple';
      }
    }
  }

  setPartnerDomainFor(db.partnerDomains, db.licenses);
  setPartnerDomainFor(db.partnerDomains, db.transactions);

  /**
   * If the contact's most recent record has a partner,
   * set that partner's domain as last associated partner.
   * Otherwise set it to blank, ignoring previous records.
   */
  for (const contact of db.contactManager.getAll()) {
    const lastRecord = contact.records[0];
    contact.data.lastAssociatedPartner = lastRecord?.partnerDomain ?? null;
  }
}

function setPartnerDomainFor(partnerDomains: Set<string>, records: (License | Transaction)[]) {
  for (const record of records) {
    const contactsToCheck = [
      record.partnerContact,
      record.billingContact,
      record.techContact
    ].filter(isPresent);

    record.partnerDomain = (contactsToCheck
      .flatMap(c => c.allEmails)
      .map(domainFor)
      .find(domain => partnerDomains.has(domain))
      ?? null);
  }
}
