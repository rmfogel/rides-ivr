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

const newRecording = {
  id: '099',
  name: 'driver_unisex_seats_question',
  text: 'כמה מקומות מעורבים יש לך?'
};

console.log('🎙️  Generating unisex seats recording...\n');
console.log(`Using voice: he-IL-Wavenet-B (Male, Professional)\n`);

async function generateRecording(recording) {
  console.log(`Generating ${recording.id} (${recording.name})...`);
  console.log(`Text: "${recording.text}"`);

  const request = {
    input: { text: recording.text },
    voice: {
      languageCode: 'he-IL',
      name: 'he-IL-Wavenet-B' // Male professional voice
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
  const success = await generateRecording(newRecording);
  
  console.log('\n📊 Summary:');
  console.log(`✅ Success: ${success ? '1/1' : '0/1'}`);
  console.log(`❌ Failed: ${success ? '0/1' : '1/1'}`);
  
  if (success) {
    console.log('\n🎉 Unisex seats recording generated successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Listen to the recording to verify quality');
    console.log('2. Update recordings.js with: driver_unisex_seats_question: \'099\'');
    console.log('3. Update voice.js to use this recording');
  } else {
    console.log('\n⚠️  Recording generation failed. Please check the error above.');
    process.exit(1);
  }
}

main();
