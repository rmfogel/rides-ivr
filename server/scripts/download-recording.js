import twilio from 'twilio';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const recordingSid = 'REad5d7f48496172342893f97bc46e7c2f';

async function downloadRecording() {
  try {
    console.log('Fetching recording details...');
    const recording = await client.recordings(recordingSid).fetch();
    
    console.log('Recording found:', {
      sid: recording.sid,
      duration: recording.duration,
      status: recording.status
    });
    
    // Create the authenticated download URL
    const downloadUrl = `https://${accountSid}:${authToken}@api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
    
    console.log('\nDownloading recording...');
    
    // Create recordings directory if it doesn't exist
    const recordingsDir = path.join(__dirname, '..', 'public', 'recordings');
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }
    
    const outputPath = path.join(recordingsDir, `${recordingSid}.mp3`);
    const file = fs.createWriteStream(outputPath);
    
    https.get(downloadUrl, (response) => {
      if (response.statusCode !== 200) {
        console.error('Download failed:', response.statusCode, response.statusMessage);
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\n✅ Recording downloaded successfully!');
        console.log('Saved to:', outputPath);
        console.log('\nPublic URL will be:');
        console.log(`${process.env.PUBLIC_BASE_URL}/recordings/${recordingSid}.mp3`);
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      console.error('Download error:', err.message);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

downloadRecording();
