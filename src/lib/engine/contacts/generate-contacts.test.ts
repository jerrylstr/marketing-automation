import { ContactType } from "../../model/contact.js";
import { GeneratedContact, mergeContactInfo } from "./generate-contacts.js";

describe('updating latest contact properties', () => {

  it('gathers name, phone, and address separately', () => {
    const a = fakeContact({
      lastUpdated: '2021-04-02',
      country: 'country2',
      region: 'region2',
      deployment: 'Cloud',
      email: 'email2',
    });

    mergeContactInfo(a, [
      fakeContact({
        firstName: 'firstName',
        lastName: 'lastName',
      }),
      fakeContact({
        phone: 'phone',
      }),
      fakeContact({
        city: 'city',
        state: 'state',
      }),
      a,
    ]);

    expect(a).toEqual(fakeContact({
      lastUpdated: '2021-04-02',
      country: 'country2',
      region: 'region2',
      deployment: 'Cloud',
      email: 'email2',
      firstName: 'firstName',
      lastName: 'lastName',
      phone: 'phone',
      city: 'city',
      state: 'state',
    }));
  });

  it('gets the newest full firstName/lastName pair if present', () => {
    const a = fakeContact({});

    mergeContactInfo(a, [
      fakeContact({
        lastUpdated: '2021-03-05',
        firstName: 'firstName1',
      }),
      fakeContact({
        lastUpdated: '2021-03-05',
        lastName: 'lastName1',
      }),
      fakeContact({
        lastUpdated: '2021-03-01',
        firstName: 'firstName2',
        lastName: 'lastName2',
      }),
      a,
    ]);

    expect(a).toEqual(fakeContact({
      firstName: 'firstName2',
      lastName: 'lastName2',
    }));
  });

  it('uses first found firstName and lastName if no pair present', () => {
    const a = fakeContact({});

    mergeContactInfo(a, [
      fakeContact({
        firstName: 'firstName1',
      }),
      fakeContact({
        lastName: 'lastName2',
      }),
      a,
    ]);

    expect(a).toEqual(fakeContact({
      firstName: 'firstName1',
      lastName: 'lastName2',
    }));
  });

  it('uses neither city nor state if no pair present', () => {
    const a = fakeContact({});

    mergeContactInfo(a, [
      fakeContact({
        city: 'city1',
      }),
      fakeContact({
        state: 'state2',
      }),
      a,
    ]);

    expect(a).toEqual(fakeContact({
      city: 'city1',
      state: 'state2',
    }));
  });

  it('updates canonical to Partner if any are Partner', () => {
    const a = fakeContact({});

    mergeContactInfo(a, [
      fakeContact({
        city: 'city1',
        contactType: 'Partner',
      }),
      fakeContact({
        state: 'state2',
      }),
      a,
    ]);

    expect(a).toEqual(fakeContact({
      city: 'city1',
      state: 'state2',
      contactType: 'Partner',
    }));
  });

  it('makes the last as canonical when "updated" is tied', () => {
    const a = fakeContact({
      email: 'email1',
      firstName: 'firstName2',
      lastName: 'lastName2',
      phone: null,
      city: null,
      state: null,
    });

    mergeContactInfo(a, [
      a,
      fakeContact({
        email: 'email2',
        firstName: 'firstName1',
        lastName: 'lastName1',
        phone: 'phone',
        city: 'city',
        state: 'state',
      }),
    ]);

    expect(a).toEqual(fakeContact({
      email: 'email1',
      firstName: 'firstName2',
      lastName: 'lastName2',
      phone: 'phone',
      city: 'city',
      state: 'state',
    }));
  });

});

function fakeContact(props: Partial<GeneratedContact>): GeneratedContact {
  return {
    lastUpdated: props.lastUpdated || '2021-04-01',
    contactType: props.contactType as ContactType || 'Customer',
    country: props.country || 'country1',
    region: props.region || 'region1',
    deployment: props.deployment || 'Server',
    email: props.email || 'email1',
    firstName: props.firstName || null,
    lastName: props.lastName || null,
    phone: props.phone || null,
    city: props.city || null,
    state: props.state || null,

    lastMpacEvent: null,
    licenseTier: null,
    otherEmails: [],
    relatedProducts: new Set(),
  };
}
