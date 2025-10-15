import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { closeMongo } from '../src/db/mongoClient.js';
import {
  upsertUser,
  addOffer,
  addRequest,
  addMatch,
  listActiveOffersForRequest,
  listOpenRequestsForOffer,
} from '../src/db/repo.js';

dotenv.config();

async function main() {
  console.log('Seeding mock data...');

  // Users
  const driverPhone = '+15550001111';
  const riderPhone = '+15550002222';
  await upsertUser({ phone: driverPhone, name: 'Alex Driver', declared_gender: 'male' });
  await upsertUser({ phone: riderPhone, name: 'Riley Rider' });

  // An offer today in ~1 hour
  const tz = process.env.TZ || 'UTC';
  const nowLocal = DateTime.now().setZone(tz);
  const dep = nowLocal.plus({ hours: 1 }).startOf('minute');
  const offer = await addOffer({
    driver_phone: driverPhone,
    direction: 'FROM',
    departure_time: dep.toUTC().toISO(),
    seats_male_only: 1,
    seats_female_only: 1,
    seats_unisex: 2,
  });

  // A request overlapping the offer
  const reqEarliest = dep.minus({ minutes: 15 }).toUTC().toISO();
  const reqLatest = dep.plus({ minutes: 30 }).toUTC().toISO();
  const request = await addRequest({
    rider_phone: riderPhone,
    direction: 'FROM',
    earliest_time: reqEarliest,
    latest_time: reqLatest,
    passengers_total: 2,
    couples_count: 0,
    passengers_male: 1,
    passengers_female: 1,
    together: true,
  });

  // Optional: create a pending match
  await addMatch({
    offer_id: offer.id,
    request_id: request.id,
    allocated_couples: 0,
    allocated_male: 1,
    allocated_female: 1,
    allocated_unisex: 0,
    status: 'pending',
  });

  // Sanity: list relations (not printed, but ensures read path works)
  await listActiveOffersForRequest(request);
  await listOpenRequestsForOffer(offer);

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongo().catch(() => {});
  });
