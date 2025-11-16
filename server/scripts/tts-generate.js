#!/usr/bin/env node
/**
 * Simple TTS generator using AWS Polly to create Hebrew (or English) prompts
 * Output files are saved under public/audio/<lang>/
 *
 * Usage:
 *   node scripts/tts-generate.js --lang he
 *   node scripts/tts-generate.js --lang he --dry-run
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
const opts = Object.fromEntries(args.map((a, i) => a.startsWith('--') ? [a.replace(/^--/, ''), args[i+1] && !args[i+1].startsWith('--') ? args[i+1] : true] : []));
const lang = (opts.lang || 'he').toLowerCase();
const dryRun = opts['dry-run'] === true;

const VOICES = {
  he: { voiceId: 'Carmit', engine: 'standard' },
  en: { voiceId: 'Joanna', engine: 'neural' }
};

const PROMPTS = {
  he: {
    welcome: 'ברוכים הבאים לשירות הנסיעות.',
    main_menu: 'לנהג הקש 1. לנוסע הקש 2. לעדכון נסיעות שנשמרו הקש 3.',
    invalid: 'קלט לא תקין.',
    manage_menu: 'כעת יוקראו כל הנסיעות הפעילות. בחר איזו נסיעה ברצונך למחוק.',
    no_active_rides: 'אין לך נסיעות פעילות.',
    choose_driver_or_rider_rides: 'לניהול נסיעות כנהג הקש 1. לניהול נסיעות כנוסע הקש 2.',
    ride_details_intro: 'פרטי הנסיעה:',
    press_1_delete_2_next_9_exit: 'למחיקת הנסיעה הקש 1. לנסיעה הבאה הקש 2. לחזרה הקש 9.',
    confirm_delete_ride: 'האם אתה בטוח שברצונך למחוק את הנסיעה? הקש 1 לאישור או 2 לביטול.',
    ride_deleted_successfully: 'הנסיעה נמחקה בהצלחה.'
  },
  en: {
    welcome: 'Welcome to the ride service.',
    main_menu: 'For driver press 1. For rider press 2. For management press 3.',
    invalid: 'Invalid input.'
  }
};

async function ensureDir(p) { await fs.mkdirp(p); }

async function synthesize(polly, text, voiceId, engine) {
  const params = {
    OutputFormat: 'mp3',
    Text: text,
    VoiceId: voiceId,
    Engine: engine,
    TextType: 'text'
  };
  const res = await polly.synthesizeSpeech(params);
  return Buffer.from(await res.AudioStream.transformToByteArray());
}

async function main() {
  if (!VOICES[lang]) {
    console.error(`Unsupported lang: ${lang}`);
    process.exit(1);
  }
  const { voiceId, engine } = VOICES[lang];
  const polly = new Polly({ region: process.env.AWS_REGION || 'us-east-1' });

  const destDir = path.join(__dirname, '..', 'public', 'audio', lang);
  await ensureDir(destDir);

  const prompts = PROMPTS[lang];
  for (const [key, text] of Object.entries(prompts)) {
    const outPath = path.join(destDir, `${key}.mp3`);
    if (dryRun) {
      console.log(`[dry-run] Would synthesize ${lang}/${key}.mp3: ${text}`);
      continue;
    }
    try {
      console.log(`Synthesizing ${lang}/${key}.mp3 with ${voiceId} (${engine})...`);
      const audio = await synthesize(polly, text, voiceId, engine);
      await fs.writeFile(outPath, audio);
      console.log(`Saved: ${outPath}`);
    } catch (e) {
      console.error(`Failed to synthesize ${key}:`, e.message);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
