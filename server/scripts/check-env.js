import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server root directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('Environment Variables Check:');
console.log('============================');
console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID);
console.log('TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN);
console.log('');
console.log('Length checks:');
console.log('SID length:', process.env.TWILIO_ACCOUNT_SID?.length);
console.log('Token length:', process.env.TWILIO_AUTH_TOKEN?.length);
console.log('');
console.log('SID format valid:', /^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID || ''));
console.log('Token format valid:', /^[a-f0-9]{32}$/i.test(process.env.TWILIO_AUTH_TOKEN || ''));
