/**
 * Google Cloud Text-to-Speech Audio Generator
 * 
 * This script reads the dictionary.json file and generates MP3 audio files
 * for each prompt using Google Cloud Text-to-Speech API.
 * 
 * Prerequisites:
 * 1. Install: npm install @google-cloud/text-to-speech
 * 2. Set up Google Cloud credentials:
 *    - Create a service account in Google Cloud Console
 *    - Download JSON key file
 *    - Set environment variable: GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json
 * 3. Enable Text-to-Speech API in your Google Cloud project
 * 
 * Usage:
 *   node scripts/generate-audio.js
 *   node scripts/generate-audio.js --voice=he-IL-Wavenet-A
 *   node scripts/generate-audio.js --regenerate  (regenerate all files)
 */

import textToSpeech from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const dictionaryPath = path.join(__dirname, '..', 'public', 'audio', 'he', 'dictionary.json');
const audioOutputDir = path.join(__dirname, '..', 'public', 'audio', 'he');

// Parse command line arguments
const args = process.argv.slice(2);
const regenerate = args.includes('--regenerate');
const voiceArg = args.find(arg => arg.startsWith('--voice='));
const selectedVoice = voiceArg ? voiceArg.split('=')[1] : 'he-IL-Wavenet-B';

// Configuration
const CONFIG = {
  voice: {
    languageCode: 'he-IL',
    name: selectedVoice, // Options: he-IL-Wavenet-A (female), he-IL-Wavenet-B (male), he-IL-Wavenet-C (male), he-IL-Wavenet-D (female)
    ssmlGender: selectedVoice.endsWith('A') || selectedVoice.endsWith('D') ? 'FEMALE' : 'MALE'
  },
  audioConfig: {
    audioEncoding: 'MP3',
    speakingRate: 0.95, // Slightly slower for clarity
    pitch: 0,
    volumeGainDb: 0,
    sampleRateHertz: 24000
  }
};

// Initialize the Text-to-Speech client
let client;
try {
  client = new textToSpeech.TextToSpeechClient();
  console.log('✅ Google Cloud Text-to-Speech client initialized');
} catch (error) {
  console.error('❌ Failed to initialize Google Cloud TTS client');
  console.error('   Make sure GOOGLE_APPLICATION_CREDENTIALS is set');
  console.error('   Error:', error.message);
  process.exit(1);
}

/**
 * Load the dictionary.json file
 */
function loadDictionary() {
  try {
    const content = fs.readFileSync(dictionaryPath, 'utf8');
    const dictionary = JSON.parse(content);
    console.log(`✅ Loaded dictionary with ${Object.keys(dictionary).length} entries`);
    return dictionary;
  } catch (error) {
    console.error('❌ Failed to load dictionary.json:', error.message);
    process.exit(1);
  }
}

/**
 * Generate audio file for a single prompt
 */
async function generateAudioFile(id, text) {
  const outputPath = path.join(audioOutputDir, `${id}.mp3`);
  
  // Check if file already exists
  if (!regenerate && fs.existsSync(outputPath)) {
    console.log(`⏭️  Skipping ${id}.mp3 (already exists)`);
    return { id, status: 'skipped', path: outputPath };
  }

  try {
    // Construct the request
    const request = {
      input: { text },
      voice: CONFIG.voice,
      audioConfig: CONFIG.audioConfig
    };

    // Call Google Cloud TTS API
    const [response] = await client.synthesizeSpeech(request);

    // Write the audio file
    await fs.promises.writeFile(outputPath, response.audioContent, 'binary');
    
    // Get file size
    const stats = fs.statSync(outputPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    
    console.log(`✅ Generated ${id}.mp3 (${sizeKB} KB)`);
    return { id, status: 'generated', path: outputPath, size: stats.size };
    
  } catch (error) {
    console.error(`❌ Failed to generate ${id}.mp3:`, error.message);
    return { id, status: 'failed', error: error.message };
  }
}

/**
 * Generate all audio files
 */
async function generateAllAudio() {
  console.log('\n🎙️  Starting audio generation...\n');
  console.log(`Voice: ${CONFIG.voice.name} (${CONFIG.voice.ssmlGender})`);
  console.log(`Output directory: ${audioOutputDir}`);
  console.log(`Regenerate existing: ${regenerate ? 'YES' : 'NO'}\n`);
  
  // Ensure output directory exists
  if (!fs.existsSync(audioOutputDir)) {
    fs.mkdirSync(audioOutputDir, { recursive: true });
    console.log(`✅ Created output directory: ${audioOutputDir}\n`);
  }

  // Load dictionary
  const dictionary = loadDictionary();
  
  // Filter out meta object
  const entries = Object.entries(dictionary).filter(([key]) => key !== 'meta');
  
  console.log(`📋 Processing ${entries.length} prompts...\n`);

  // Statistics
  const stats = {
    total: entries.length,
    generated: 0,
    skipped: 0,
    failed: 0,
    totalSize: 0
  };

  // Process each entry
  for (const [id, text] of entries) {
    const result = await generateAudioFile(id, text);
    
    if (result.status === 'generated') {
      stats.generated++;
      stats.totalSize += result.size || 0;
    } else if (result.status === 'skipped') {
      stats.skipped++;
    } else if (result.status === 'failed') {
      stats.failed++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 GENERATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total prompts:     ${stats.total}`);
  console.log(`✅ Generated:      ${stats.generated}`);
  console.log(`⏭️  Skipped:        ${stats.skipped}`);
  console.log(`❌ Failed:         ${stats.failed}`);
  console.log(`📦 Total size:     ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log('='.repeat(60));

  if (stats.failed > 0) {
    console.log('\n⚠️  Some files failed to generate. Check errors above.');
    process.exit(1);
  } else if (stats.generated === 0 && stats.skipped > 0) {
    console.log('\n✅ All files already exist. Use --regenerate to recreate them.');
  } else {
    console.log('\n✅ Audio generation completed successfully!');
  }
}

/**
 * Test Google Cloud TTS connection
 */
async function testConnection() {
  console.log('\n🔍 Testing Google Cloud TTS connection...\n');
  
  try {
    const request = {
      input: { text: 'בדיקה' },
      voice: CONFIG.voice,
      audioConfig: { audioEncoding: 'MP3' }
    };
    
    const [response] = await client.synthesizeSpeech(request);
    
    if (response.audioContent) {
      console.log('✅ Connection successful!');
      console.log(`   Voice: ${CONFIG.voice.name}`);
      console.log(`   Audio encoding: MP3`);
      console.log(`   Sample response size: ${response.audioContent.length} bytes\n`);
      return true;
    }
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    
    if (error.message.includes('PERMISSION_DENIED')) {
      console.error('\n💡 Tip: Check your service account permissions');
      console.error('   Required: Cloud Text-to-Speech API User role');
    } else if (error.message.includes('API_KEY_INVALID')) {
      console.error('\n💡 Tip: Check your GOOGLE_APPLICATION_CREDENTIALS path');
    }
    
    return false;
  }
}

/**
 * List available Hebrew voices
 */
async function listAvailableVoices() {
  console.log('\n🎤 Available Hebrew Voices:\n');
  
  try {
    const [result] = await client.listVoices({ languageCode: 'he-IL' });
    const voices = result.voices;
    
    voices.forEach(voice => {
      console.log(`   ${voice.name}`);
      console.log(`      Gender: ${voice.ssmlGender}`);
      console.log(`      Natural sample rate: ${voice.naturalSampleRateHertz} Hz`);
      console.log();
    });
    
    console.log('💡 Use --voice=<name> to select a voice');
    console.log('   Example: node scripts/generate-audio.js --voice=he-IL-Wavenet-A\n');
  } catch (error) {
    console.error('❌ Failed to list voices:', error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🎙️  GOOGLE CLOUD TTS AUDIO GENERATOR');
  console.log('='.repeat(60));

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log('\nUsage:');
    console.log('  node scripts/generate-audio.js [options]');
    console.log('\nOptions:');
    console.log('  --regenerate        Regenerate all files even if they exist');
    console.log('  --voice=<name>      Use specific voice (default: he-IL-Wavenet-B)');
    console.log('  --list-voices       List all available Hebrew voices');
    console.log('  --test              Test connection to Google Cloud TTS');
    console.log('  --help, -h          Show this help message');
    console.log('\nExamples:');
    console.log('  node scripts/generate-audio.js');
    console.log('  node scripts/generate-audio.js --voice=he-IL-Wavenet-A');
    console.log('  node scripts/generate-audio.js --regenerate');
    console.log();
    process.exit(0);
  }

  // Check for list voices flag
  if (args.includes('--list-voices')) {
    await listAvailableVoices();
    process.exit(0);
  }

  // Check for test flag
  if (args.includes('--test')) {
    const success = await testConnection();
    process.exit(success ? 0 : 1);
  }

  // Test connection first
  const connectionOk = await testConnection();
  if (!connectionOk) {
    console.error('\n❌ Aborting: Cannot connect to Google Cloud TTS');
    console.error('   Run with --test flag to diagnose connection issues\n');
    process.exit(1);
  }

  // Generate all audio files
  await generateAllAudio();
}

// Run the script
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
