import { DateTime } from 'luxon';
import { TZ } from '../utils/time.js';

export function formatRideDetails(ride, isOffer) {
  try {
    const dt = DateTime.fromISO(ride.departure_time || ride.earliest_time).setZone(TZ);
    const date = dt.toFormat('dd/MM/yyyy');
    
    let timeStr;
    if (isOffer) {
      timeStr = dt.toFormat('HH:mm');
    } else {
      const latest = DateTime.fromISO(ride.latest_time).setZone(TZ);
      timeStr = `${dt.toFormat('HH:mm')} to ${latest.toFormat('HH:mm')}`;
    }
    
    const direction = ride.direction === 'FROM' ? 'leaving the town' : 'towards the town';
    
    let seatsInfo;
    if (isOffer) {
      seatsInfo = `with ${ride.seats_male_only || 0} male-only, ${ride.seats_female_only || 0} female-only, and ${ride.seats_unisex || 0} unisex seats`;
    } else {
      seatsInfo = `for ${ride.passengers_total} passengers (${ride.couples_count || 0} couples, ${ride.passengers_male || 0} men, ${ride.passengers_female || 0} women)`;
    }
    
    return `${date} at ${timeStr}, ${direction}, ${seatsInfo}`;
  } catch (e) {
    console.error('Error formatting ride details:', e);
    return 'Ride details unavailable';
  }
}

export function formatTimeOnly(timeStr) {
  try {
    const dt = DateTime.fromISO(timeStr).setZone(TZ);
    return dt.toFormat('HH:mm');
  } catch (e) {
    return 'unknown time';
  }
}