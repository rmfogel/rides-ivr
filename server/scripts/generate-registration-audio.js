/**
 * Generate audio recordings for IVR registration feature
 * Run: node scripts/generate-registration-audio.js
 */

import fs from 'fs-extra';
import path from 'path';
import url from 'url';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// New recordings for IVR registration
const REGISTRATION_RECORDINGS = {
  '250': 'שָׁלוֹם! מִסְפַּר זֶה אֵינוֹ רָשׁוּם בַּמַּעֲרֶכֶת.',
  '251': 'אָנָּא הַקְלֵט אֶת שִׁמְךָ הַמָּלֵא לְאַחַר הַצִּפְצוּף.',
  '252': 'תּוֹדָה! הַשֵּׁם נִקְלַט בְּהַצְלָחָה.',
  '253': 'כָּעֵת בְּחַר סִיסְמָה בַּת 4 סְפָרוֹת לְמַמְשַׁק הָאִינְטֶרְנֶט.',
  '254': 'אָנָּא הַזֵּן שׁוּב אֶת הַסִּיסְמָה לְאִישּׁוּר.',
  '255': 'הַסִּיסְמָאוֹת אֵינָן תּוֹאֲמוֹת. נְנַסֶּה שׁוּב.',
  '256': 'סִיסְמָה לֹא תְקִינָה. יֵשׁ לְהַזִּין 4 סְפָרוֹת בִּלְבָד.',
  '257': 'הָרִשּׁוּם הֻשְׁלַם בְּהַצְלָחָה! כָּעֵת תֻּעֲבַר לַתַּפְרִיט הָרָאשִׁי.',
  '258': 'אִיפּוּס סִיסְמָה. הַזֵּן סִיסְמָה חֲדָשָׁה בַּת 4 סְפָרוֹת.',
  '259': 'הַסִּיסְמָה אוּפְּסָה בְּהַצְלָחָה.',
  '260': 'אָנָּא הַאֲזֵן לְהַקְלָטָה שֶׁלְּךָ.',
  '261': 'לְשׁמִירַת הַהַקְלָטָה הַקֵּשׁ 1. לְהַקְלָטָה מֵחָדָשׁ הַקֵּשׁ 2.'
};

// Updated main menu (002)
const UPDATED_MAIN_MENU = 'לְנֶהָג הַקֵּשׁ 1. לְנוֹסֵעַ הַקֵּשׁ 2. לְעִדְכּוּן נְסִיעוֹת שֶׁנִּשְׁמְרוּ הַקֵּשׁ 3. לְאִיפּוּס סִיסְמָה הַקֵּשׁ 4.';

const VOICE_NAME = 'he-IL-Wavenet-B'; // Same as main audio files (male voice)
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'audio', 'he');
const DICTIONARY_PATH = path.join(OUTPUT_DIR, 'dictionary.json');

async function generateAudio(id, text) {
  try {
    const client = new TextToSpeechClient({
      keyFilename: path.join(__dirname, '..', 'tts-key.json')
    });

    const request = {
      input: { text },
      voice: {
        languageCode: 'he-IL',
        name: VOICE_NAME
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.9
      }
    };

    const [response] = await client.synthesizeSpeech(request);
    const outputPath = path.join(OUTPUT_DIR, `${id}.mp3`);
    await fs.writeFile(outputPath, response.audioContent, 'binary');
    
    console.log(`✓ Generated ${id}.mp3`);
    return true;
  } catch (err) {
    console.error(`✗ Failed to generate ${id}.mp3:`, err.message);
    return false;
  }
}

async function updateDictionary() {
  try {
    const dict = await fs.readJSON(DICTIONARY_PATH);
    
    // Add new recordings
    Object.assign(dict, REGISTRATION_RECORDINGS);
    
    // Update main menu (002)
    dict['002'] = UPDATED_MAIN_MENU;
    
    await fs.writeJSON(DICTIONARY_PATH, dict, { spaces: 2 });
    console.log('✓ Updated dictionary.json');
    return true;
  } catch (err) {
    console.error('✗ Failed to update dictionary.json:', err.message);
    return false;
  }
}

async function main() {
  console.log('🎙️  Generating IVR Registration Audio Files\n');
  
  // Update dictionary first
  const dictUpdated = await updateDictionary();
  if (!dictUpdated) {
    console.error('\n❌ Failed to update dictionary');
    process.exit(1);
  }
  
  console.log('\nGenerating new audio files...\n');
  
  // Generate new recordings
  let successCount = 0;
  const recordings = { ...REGISTRATION_RECORDINGS, '002': UPDATED_MAIN_MENU };
  
  for (const [id, text] of Object.entries(recordings)) {
    const success = await generateAudio(id, text);
    if (success) successCount++;
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n✅ Generated ${successCount}/${Object.keys(recordings).length} audio files`);
  
  if (successCount < Object.keys(recordings).length) {
    console.log('\n⚠️  Some files failed to generate. Check errors above.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
