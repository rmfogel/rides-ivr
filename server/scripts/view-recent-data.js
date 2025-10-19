// Script to view recent ride offers and requests from MongoDB
import { collections } from '../src/db/mongoClient.js';
import { DateTime } from 'luxon';

async function viewRecentData() {
  try {
    console.log('\n=== Recent Ride Data ===\n');
    
    const { offers, requests, users } = await collections();
    
    // Get recent ride offers
    console.log('📋 RECENT RIDE OFFERS (Last 10):');
    console.log('─'.repeat(80));
    const recentOffers = await offers
      .find({})
      .sort({ created_at: -1 })
      .limit(10)
      .toArray();
    
    if (recentOffers.length === 0) {
      console.log('No ride offers found.');
    } else {
      for (const offer of recentOffers) {
        const driver = await users.findOne({ phone: offer.driver_phone });
        const driverName = driver?.name || 'Unknown';
        const departureTime = DateTime.fromJSDate(offer.departure_time).toFormat('yyyy-MM-dd HH:mm');
        
        console.log(`\nOffer ID: ${offer._id}`);
        console.log(`  Driver: ${driverName} (${offer.driver_phone})`);
        console.log(`  Direction: ${offer.direction}`);
        console.log(`  Departure: ${departureTime}`);
        console.log(`  Seats: ${offer.seats_male_only} male, ${offer.seats_female_only} female, ${offer.seats_unisex} unisex`);
        console.log(`  Status: ${offer.status}`);
        console.log(`  Created: ${DateTime.fromJSDate(offer.created_at).toFormat('yyyy-MM-dd HH:mm:ss')}`);
      }
    }
    
    // Get recent ride requests
    console.log('\n\n📋 RECENT RIDE REQUESTS (Last 10):');
    console.log('─'.repeat(80));
    const recentRequests = await requests
      .find({})
      .sort({ created_at: -1 })
      .limit(10)
      .toArray();
    
    if (recentRequests.length === 0) {
      console.log('No ride requests found.');
    } else {
      for (const request of recentRequests) {
        const rider = await users.findOne({ phone: request.rider_phone });
        const riderName = rider?.name || 'Unknown';
        const earliestTime = DateTime.fromJSDate(request.earliest_time).toFormat('yyyy-MM-dd HH:mm');
        const latestTime = DateTime.fromJSDate(request.latest_time).toFormat('HH:mm');
        const preferredTime = request.preferred_time 
          ? DateTime.fromJSDate(request.preferred_time).toFormat('HH:mm')
          : 'None';
        
        console.log(`\nRequest ID: ${request._id}`);
        console.log(`  Rider: ${riderName} (${request.rider_phone})`);
        console.log(`  Direction: ${request.direction}`);
        console.log(`  Time Window: ${earliestTime} - ${latestTime}`);
        console.log(`  Preferred Time: ${preferredTime}`);
        console.log(`  Passengers: ${request.passengers_total} total (${request.passengers_male} male, ${request.passengers_female} female)`);
        console.log(`  Couples: ${request.couples_count}`);
        console.log(`  Must Travel Together: ${request.together ? 'Yes' : 'No'}`);
        console.log(`  Status: ${request.status}`);
        console.log(`  Created: ${DateTime.fromJSDate(request.created_at).toFormat('yyyy-MM-dd HH:mm:ss')}`);
      }
    }
    
    // Get statistics
    console.log('\n\n📊 STATISTICS:');
    console.log('─'.repeat(80));
    const totalOffers = await offers.countDocuments({});
    const activeOffers = await offers.countDocuments({ status: 'active' });
    const totalRequests = await requests.countDocuments({});
    const openRequests = await requests.countDocuments({ status: 'open' });
    const totalUsers = await users.countDocuments({});
    
    console.log(`Total Offers: ${totalOffers} (${activeOffers} active)`);
    console.log(`Total Requests: ${totalRequests} (${openRequests} open)`);
    console.log(`Total Users: ${totalUsers}`);
    
    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('Error fetching data:', error);
    process.exit(1);
  }
}

viewRecentData();
