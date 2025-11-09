import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const recordingSid = 'REad5d7f48496172342893f97bc46e7c2f'; // From the logs

async function checkRecording() {
  try {
    console.log('Checking recording:', recordingSid);
    
    const recording = await client.recordings(recordingSid).fetch();
    
    console.log('\n=== Recording Details ===');
    console.log('SID:', recording.sid);
    console.log('Duration:', recording.duration, 'seconds');
    console.log('Status:', recording.status);
    console.log('Date Created:', recording.dateCreated);
    console.log('Media URL:', recording.uri);
    
    // Try to get the actual media URL
    const mediaUrl = `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
    console.log('Full Media URL:', mediaUrl);
    
  } catch (error) {
    console.error('\n=== Error ===');
    console.error('Code:', error.code);
    console.error('Message:', error.message);
    console.error('Status:', error.status);
    
    if (error.code === 20404) {
      console.error('\n⚠️  Recording not found! It may have been deleted or expired.');
      console.error('Twilio recordings are deleted after a certain period unless you save them.');
    }
  }
}

checkRecording();
