/**
 * Generate driver-specific audio recordings
 * Uses Google Cloud Text-to-Speech API
 * 
 * Run with: node scripts/generate-driver-recordings.js
 */

import textToSpeech from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Google Cloud TTS client
const client = new textToSpeech.TextToSpeechClient({
  keyFilename: path.join(__dirname, '..', 'tts-key.json')
});

const NEW_DRIVER_RECORDINGS = [
  {
    id: '097',
    key: 'driver_male_seats_question',
    text: 'כמה מקומות לגברים יש לך?'
  },
  {
    id: '098',
    key: 'driver_female_seats_question',
    text: 'כמה מקומות לנשים יש לך?'
  }
];

async function synthesize(text) {
  const request = {
    input: { text },
    voice: {
      languageCode: 'he-IL',
      name: 'he-IL-Wavenet-B', // Male voice, clear and professional
      ssmlGender: 'MALE'
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.95,
      pitch: 0
    }
  };

  const [response] = await client.synthesizeSpeech(request);
  return response.audioContent;
}

async function generateDriverRecordings() {
  console.log('🎙️  Generating driver-specific seat recordings...\n');
  console.log(`Using voice: he-IL-Wavenet-B (Male, Professional)\n`);
  
  const outputDir = path.join(__dirname, '..', 'public', 'audio', 'he');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const recording of NEW_DRIVER_RECORDINGS) {
    try {
      console.log(`Generating ${recording.id} (${recording.key})...`);
      console.log(`Text: "${recording.text}"`);
      
      const audioContent = await synthesize(recording.text);
      const outputPath = path.join(outputDir, `${recording.id}.mp3`);
      
      fs.writeFileSync(outputPath, audioContent, 'binary');
      
      console.log(`✅ Successfully generated ${recording.id}.mp3\n`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to generate ${recording.id}:`, error.message);
      console.error(`   ${error.stack}\n`);
      errorCount++;
    }
  }
  
  console.log('\n📊 Summary:');
  console.log(`✅ Success: ${successCount}/${NEW_DRIVER_RECORDINGS.length}`);
  console.log(`❌ Failed: ${errorCount}/${NEW_DRIVER_RECORDINGS.length}`);
  
  if (successCount === NEW_DRIVER_RECORDINGS.length) {
    console.log('\n🎉 All driver recordings generated successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Listen to each recording to verify quality');
    console.log('2. Update voice.js to use these recordings');
    console.log('3. Test the driver flow in the IVR system');
  } else {
    console.log('\n⚠️  Some recordings failed. Please check the errors above.');
  }
}

generateDriverRecordings().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
