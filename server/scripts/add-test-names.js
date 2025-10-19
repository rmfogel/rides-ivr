// Script to add fictional names to existing users for testing
import { collections } from '../src/db/mongoClient.js';

const testNames = [
  'David Cohen',
  'Sarah Levy',
  'Michael Goldstein',
  'Rachel Friedman',
  'Jonathan Schwartz',
  'Miriam Klein',
  'Benjamin Rosen',
  'Tamar Shapiro',
  'Aaron Miller',
  'Rivka Green'
];

async function addTestNames() {
  try {
    console.log('\n=== Adding Test Names to Users ===\n');
    
    const { users } = await collections();
    
    // Get all users without names
    const usersWithoutNames = await users.find({ 
      $or: [
        { name: { $exists: false } },
        { name: null },
        { name: '' }
      ]
    }).toArray();
    
    console.log(`Found ${usersWithoutNames.length} users without names\n`);
    
    for (let i = 0; i < usersWithoutNames.length; i++) {
      const user = usersWithoutNames[i];
      const name = testNames[i % testNames.length]; // Cycle through names
      
      await users.updateOne(
        { _id: user._id },
        { $set: { name: name } }
      );
      
      console.log(`✓ Updated user ${user.phone} with name: ${name}`);
    }
    
    console.log('\n=== Summary ===');
    console.log(`Updated ${usersWithoutNames.length} users with test names`);
    
    // Show all users with their names
    console.log('\n=== All Users ===');
    const allUsers = await users.find({}).toArray();
    for (const user of allUsers) {
      console.log(`${user.phone}: ${user.name || 'NO NAME'}`);
    }
    
    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('Error adding names:', error);
    process.exit(1);
  }
}

addTestNames();
