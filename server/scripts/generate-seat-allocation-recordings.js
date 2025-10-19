#!/usr/bin/env node
import textToSpeech from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new textToSpeech.TextToSpeechClient({
  keyFilename: path.join(__dirname, '..', 'tts-key.json')
});

const newRecordings = [
  {
    id: '099',
    name: 'driver_total_seats_question',
    text: 'כמה מקומות פנויים יש לך בסך הכל?'
  },
  {
    id: '110',
    name: 'driver_male_only_from_total',
    text: 'כמה מתוכם לגברים בלבד?'
  },
  {
    id: '111',
    name: 'driver_female_only_from_total',
    text: 'כמה מתוכם לנשים בלבד?'
  }
];

console.log('🎙️  Generating driver seat allocation recordings...\n');
console.log(`Using voice: he-IL-Wavenet-B (Male, Professional)\n`);

async function generateRecording(recording) {
  console.log(`Generating ${recording.id} (${recording.name})...`);
  console.log(`Text: "${recording.text}"`);

  const request = {
    input: { text: recording.text },
    voice: {
      languageCode: 'he-IL',
      name: 'he-IL-Wavenet-B'
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.95,
      pitch: 0.0
    }
  };

  try {
    const [response] = await client.synthesizeSpeech(request);
    const outputPath = path.join(__dirname, '..', 'public', 'audio', 'he', `${recording.id}.mp3`);
    
    await fs.promises.writeFile(outputPath, response.audioContent, 'binary');
    console.log(`✅ Successfully generated ${recording.id}.mp3\n`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to generate ${recording.id}:`, error.message);
    return false;
  }
}

async function main() {
  let successCount = 0;
  let failCount = 0;

  for (const recording of newRecordings) {
    const success = await generateRecording(recording);
    if (success) successCount++;
    else failCount++;
  }
  
  console.log('\n📊 Summary:');
  console.log(`✅ Success: ${successCount}/${newRecordings.length}`);
  console.log(`❌ Failed: ${failCount}/${newRecordings.length}`);
  
  if (failCount === 0) {
    console.log('\n🎉 All seat allocation recordings generated successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update recordings.js with the new prompt IDs');
    console.log('2. Update voice.js driver flow logic');
  } else {
    console.log('\n⚠️  Some recordings failed. Please check errors above.');
    process.exit(1);
  }
}

main();
