import { collections, connectToDatabase } from '../src/db/mongoClient.js';
import * as logger from '../src/utils/logger.js';

async function clearUsers() {
  try {
    logger.info('מתחבר למסד הנתונים...');
    await connectToDatabase();
    
    logger.info('מוחק את כל המשתמשים...');
    const result = await collections.users.deleteMany({});
    
    logger.info(`נמחקו ${result.deletedCount} משתמשים בהצלחה`);
    
    process.exit(0);
  } catch (error) {
    logger.error('שגיאה במחיקת משתמשים:', error);
    process.exit(1);
  }
}

clearUsers();
