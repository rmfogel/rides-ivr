# Quick Start: Generate Audio Files

## Step 1: Install Package

```bash
cd server
npm install @google-cloud/text-to-speech
```

## Step 2: Get Google Cloud Credentials

### Option A: Use Existing Key (if you have one)
Place your `tts-key.json` file in the `server/` directory.

### Option B: Create New Key
1. Go to https://console.cloud.google.com/
2. Create project or select existing
3. Enable "Cloud Text-to-Speech API"
4. Create service account with "Cloud Text-to-Speech API User" role
5. Download JSON key as `tts-key.json`

## Step 3: Set Environment Variable

**Windows PowerShell:**
```powershell
cd server
$env:GOOGLE_APPLICATION_CREDENTIALS="$PWD\tts-key.json"
```

**Linux/Mac:**
```bash
cd server
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/tts-key.json"
```

## Step 4: Txxxxxxxxxction

```bash
npm run audio:test
```

You should see:
```
✅ Connection successful!
```

## Step 5: Generate All Audio Files

```bash
npm run audio:generate
```

This will create 84 MP3 files in `public/audio/he/`

## Step 6: Verify

Check that files were created:
```bash
ls public/audio/he/*.mp3
```

You should see:
```
001.mp3  002.mp3  003.mp3  ...  3011.mp3
```

## Optional: Try Different Voices

List available voices:
```bash
npm run audio:voices
```

Generate with specific voice:
```bash
node scripts/generate-audio.js --voice=he-IL-Wavenet-A
```

## Troubleshooting

### Error: Cannot find module '@google-cloud/text-to-speech'
```bash
npm install @google-cloud/text-to-speech
```

### Error: GOOGLE_APPLICATION_CREDENTIALS not set
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\full\path\to\server\tts-key.json"
```

### Want to regenerate all files?
```bash
npm run audio:regenerate
```

## Full Documentation

See [docs/audio-generation-guide.md](./docs/audio-generation-guide.md) for complete guide.
