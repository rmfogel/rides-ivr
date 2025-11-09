import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server root directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const recordingSid = 'REad5d7f48496172342893f97bc46e7c2f';

async function downloadRecording() {
  try {
    // Build authenticated URL for downloading
    const downloadUrl = `https://${accountSid}:${authToken}@api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
    
    console.log('Downloading recording from Twilio...');
    
    // Create recordings directory if it doesn't exist
    const recordingsDir = path.join(__dirname, '..', 'public', 'recordings');
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
      console.log('Created directory:', recordingsDir);
    }
    
    const outputPath = path.join(recordingsDir, `${recordingSid}.mp3`);
    const file = fs.createWriteStream(outputPath);
    
    https.get(downloadUrl, (response) => {
      console.log('Response status:', response.statusCode);
      
      if (response.statusCode !== 200) {
        console.error('Download failed:', response.statusCode, response.statusMessage);
        file.close();
        fs.unlinkSync(outputPath);
        return;
      }
      
      let downloadedBytes = 0;
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(outputPath);
        console.log('\n✅ Recording downloaded successfully!');
        console.log('File size:', stats.size, 'bytes');
        console.log('Saved to:', outputPath);
        console.log('\nPublic URL:');
        console.log(`${process.env.PUBLIC_BASE_URL}/recordings/${recordingSid}.mp3`);
      });
    }).on('error', (err) => {
      console.error('Download error:', err.message);
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

downloadRecording();
