/**
 * Generate new audio recordings for improved error handling
 * Uses Google Cloud Text-to-Speech API
 * 
 * Prerequisites:
 * - Google Cloud TTS credentials configured (tts-key.json)
 * - @google-cloud/text-to-speech package installed
 * 
 * Run with: node scripts/generate-new-error-recordings.js
 */

import textToSpeech from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Google Cloud TTS client
const client = new textToSpeech.TextToSpeechClient({
  keyFilename: path.join(__dirname, '..', 'tts-key.json')
});

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
      speakingRate: 0.95, // Slightly slower for clarity
      pitch: 0
    }
  };

  const [response] = await client.synthesizeSpeech(request);
  return response.audioContent;
}

const NEW_RECORDINGS = [
  {
    id: '090',
    key: 'invalid_direction_retry',
    text: 'הקשה שגויה. אנא הקישו 1 ליוצא מהיישוב, או 2 לכיוון היישוב.'
  },
  {
    id: '091',
    key: 'invalid_date_option_retry',
    text: 'אפשרות לא חוקית. אנא הקישו 1 להיום, 2 למחר, או 3 לתאריך אחר.'
  },
  {
    id: '092',
    key: 'invalid_time_format',
    text: 'פורמט שעה שגוי. אנא הזינו ארבע ספרות בפורמט שעות ודקות. לדוגמה, אחת ארבע שלושים אפס, עבור השעה שתיים וחצי אחר הצהריים.'
  },
  {
    id: '093',
    key: 'time_must_be_later',
    text: 'השעה המאוחרת חייבת להיות אחרי השעה המוקדמת. אנא הזינו שעה מאוחרת יותר.'
  },
  {
    id: '094',
    key: 'time_outside_range',
    text: 'השעה המועדפת צריכה להיות בטווח שהזנתם. נסו שוב, או הקישו כוכבית לדילוג.'
  },
  {
    id: '095',
    key: 'invalid_passenger_count',
    text: 'הקשה שגויה. אנא הקישו ספרה אחת, בין אפס לתשע.'
  },
  {
    id: '096',
    key: 'session_expired_restart',
    text: 'מצטערים, הפגישה פגה. אנחנו מתחילים מחדש. אנא המתינו.'
  }
];

async function generateNewRecordings() {
  console.log('🎙️  Starting generation of new error handling recordings...\n');
  console.log(`Using voice: he-IL-Wavenet-B (Male, Professional)\n`);
  
  const outputDir = path.join(__dirname, '..', 'public', 'audio', 'he');
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const recording of NEW_RECORDINGS) {
    try {
      console.log(`Generating ${recording.id} (${recording.key})...`);
      
      const audioContent = await synthesize(recording.text);
      const outputPath = path.join(outputDir, `${recording.id}.mp3`);
      
      // Write the binary audio content to file
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
  console.log(`✅ Success: ${successCount}/${NEW_RECORDINGS.length}`);
  console.log(`❌ Failed: ${errorCount}/${NEW_RECORDINGS.length}`);
  
  if (successCount === NEW_RECORDINGS.length) {
    console.log('\n🎉 All recordings generated successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Listen to each recording to verify quality');
    console.log('2. Update server/public/audio/he/dictionary.json if needed');
    console.log('3. Test the updated flows in the IVR system');
  } else {
    console.log('\n⚠️  Some recordings failed. Please check the errors above.');
  }
}

// Run the generator
generateNewRecordings().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
