// Utilities for working with recorded audio prompts
import fs from 'fs';
import path from 'path';
import url from 'url';

export function audioUrl(relPath) {
  return `/static/${relPath}`.replace(/\\/g, '/');
}

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', '..', 'public');

function fileExists(rel) {
  try {
    return fs.existsSync(path.join(publicDir, rel));
  } catch {
    return false;
  }
}

export function getPromptUrl(key, lang = 'he') {
  const candidates = [
    `audio/${lang}/${key}.mp3`,
    `audio/${lang}/${key}.wav`,
    `audio/${lang}/${key}.ulaw.wav`
  ];
  const found = candidates.find(fileExists);
  return found ? audioUrl(found) : null;
}

export const HE_PROMPTS = {
  welcome: 'audio/he/welcome.mp3',
  mainMenu: 'audio/he/main_menu.mp3',
  invalid: 'audio/he/invalid.mp3',
  // add more as you record them
};

export default { audioUrl, HE_PROMPTS, getPromptUrl };