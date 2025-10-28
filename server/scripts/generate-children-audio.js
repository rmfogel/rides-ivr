#!/usr/bin/env node
/**
 * Generate Hebrew TTS for children-related prompts
 * 
 * Usage:
 *   node scripts/generate-children-audio.js
 *   node scripts/generate-children-audio.js --dry-run
 * 
 * Required env vars:
 *   AWS_REGION (e.g., us-east-1)
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 */

import { Polly } from '@aws-sdk/client-polly';
import fs from 'fs-extra';
import path from 'path';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Hebrew voice settings
const VOICE_ID = 'Carmit';
const ENGINE = 'standard';

// Audio prompts for children feature
const PROMPTS = {
  how_many_children: 'כמה ילדים מצטרפים?',
  including: 'כולל',
  children: 'ילדים'
};

async function ensureDir(p) { 
  await fs.mkdirp(p); 
}

async function synthesize(polly, text) {
  const params = {
    OutputFormat: 'mp3',
    Text: text,
    VoiceId: VOICE_ID,
    Engine: ENGINE,
    TextType: 'text'
  };
  const res = await polly.synthesizeSpeech(params);
  return Buffer.from(await res.AudioStream.transformToByteArray());
}

async function main() {
  console.log('Generating Hebrew audio for children feature...\n');
  
  const polly = new Polly({ 
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  const destDir = path.join(__dirname, '..', 'public', 'audio', 'he');
  await ensureDir(destDir);

  for (const [key, text] of Object.entries(PROMPTS)) {
    const outPath = path.join(destDir, `${key}.mp3`);
    
    if (dryRun) {
      console.log(`[DRY RUN] Would create ${key}.mp3: "${text}"`);
      continue;
    }
    
    try {
      console.log(`Creating ${key}.mp3...`);
      console.log(`  Text: "${text}"`);
      console.log(`  Voice: ${VOICE_ID} (${ENGINE})`);
      
      const audio = await synthesize(polly, text);
      await fs.writeFile(outPath, audio);
      
      console.log(`  ✓ Saved: ${outPath}\n`);
    } catch (e) {
      console.error(`  ✗ Failed to create ${key}.mp3:`, e.message, '\n');
      process.exitCode = 1;
    }
  }
  
  if (dryRun) {
    console.log('\n[DRY RUN] No files were created.');
  } else {
    console.log('✓ All audio files generated successfully!');
    console.log('\nGenerated files:');
    Object.keys(PROMPTS).forEach(key => {
      console.log(`  - public/audio/he/${key}.mp3`);
    });
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
