# Audio Generation Guide

This guide explains how to generate audio files for the IVR system using Google Cloud Text-to-Speech.

## Prerequisites

### 1. Install Required Package

```bash
cd server
npm install @google-cloud/text-to-speech
```

### 2. Set Up Google Cloud

#### A. Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one

#### B. Enable Text-to-Speech API
1. In the Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Cloud Text-to-Speech API"
3. Click **Enable**

#### C. Create Service Account
1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Name: `tts-audio-generator`
4. Grant role: **Cloud Text-to-Speech API User**
5. Click **Done**

#### D. Create and Download Key
1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** > **Create New Key**
4. Choose **JSON** format
5. Download the key file (e.g., `tts-key.json`)
6. **Important:** Keep this file secure and never commit it to Git!

#### E. Set Environment Variable

**Windows (PowerShell):**
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\tts-key.json"
```

**Windows (Command Prompt):**
```cmd
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\tts-key.json
```

**Linux/Mac:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/tts-key.json"
```

**Permanent (add to .env file):**
```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/tts-key.json
```

## Usage

### Test Connection

Before generating audio, test your connection:

```bash
node scripts/generate-audio.js --test
```

Expected output:
```
✅ Connection successful!
   Voice: he-IL-Wavenet-B
   Audio encoding: MP3
   Sample response size: XXXX bytes
```

### List Available Voices

To see all available Hebrew voices:

```bash
node scripts/generate-audio.js --list-voices
```

Available Hebrew voices:
- `he-IL-Wavenet-A` - Female (recommended for warm, friendly tone)
- `he-IL-Wavenet-B` - Male (default, clear and professional)
- `he-IL-Wavenet-C` - Male (deeper voice)
- `he-IL-Wavenet-D` - Female (higher pitch)

### Generate All Audio Files

Generate all missing audio files:

```bash
node scripts/generate-audio.js
```

This will:
- Read `public/audio/he/dictionary.json`
- Generate MP3 files for each entry
- Skip files that already exist
- Save to `public/audio/he/`

### Regenerate All Files

To regenerate all files (even if they exist):

```bash
node scripts/generate-audio.js --regenerate
```

### Use Different Voice

To use a specific voice:

```bash
node scripts/generate-audio.js --voice=he-IL-Wavenet-A
```

### Help

For all options:

```bash
node scripts/generate-audio.js --help
```

## Script Output

The script will show progress for each file:

```
🎙️  Starting audio generation...

Voice: he-IL-Wavenet-B (MALE)
Output directory: C:\...\server\public\audio\he
Regenerate existing: NO

📋 Processing 84 prompts...

✅ Generated 001.mp3 (12.34 KB)
✅ Generated 002.mp3 (15.67 KB)
⏭️  Skipping 003.mp3 (already exists)
...

============================================================
📊 GENERATION SUMMARY
============================================================
Total prompts:     84
✅ Generated:      50
⏭️  Skipped:        34
❌ Failed:         0
📦 Total size:     1.23 MB
============================================================

✅ Audio generation completed successfully!
```

## File Structure

After generation, your directory structure will be:

```
server/
  public/
    audio/
      he/
        001.mp3  ← "ברוכים הבאים לשירות הנסיעות"
        002.mp3  ← "לתפריט: לנהג הקש 1..."
        003.mp3
        ...
        3011.mp3 ← ":"
        dictionary.json  ← Reference mapping
```

## Troubleshooting

### Error: "PERMISSION_DENIED"

**Solution:** Make sure your service account has the "Cloud Text-to-Speech API User" role.

1. Go to Google Cloud Console
2. IAM & Admin > IAM
3. Find your service account
4. Click Edit (pencil icon)
5. Add Role: "Cloud Text-to-Speech API User"

### Error: "API_KEY_INVALID"

**Solution:** Check that GOOGLE_APPLICATION_CREDENTIALS points to the correct file.

```powershell
# Windows PowerShell - Check current value
$env:GOOGLE_APPLICATION_CREDENTIALS

# Windows PowerShell - Set correctly
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\full\path\to\tts-key.json"
```

### Error: "Cannot find module '@google-cloud/text-to-speech'"

**Solution:** Install the package:

```bash
cd server
npm install @google-cloud/text-to-speech
```

### Error: "Failed to load dictionary.json"

**Solution:** Make sure you're running the script from the server directory:

```bash
cd server
node scripts/generate-audio.js
```

### Files Sound Wrong or Garbled

**Solution:** Try a different voice:

```bash
node scripts/generate-audio.js --voice=he-IL-Wavenet-A --regenerate
```

Listen to samples and pick the one that sounds best for your application.

## Cost Estimation

Google Cloud Text-to-Speech pricing (as of 2025):

- **WaveNet voices:** $16 per 1 million characters
- **Standard voices:** $4 per 1 million characters

For this project:
- **84 prompts** × **~30 characters average** = **~2,520 characters**
- **Cost:** ~$0.04 (less than 5 cents!) for one-time generation

WaveNet voices are recommended for production quality.

## Voice Configuration

You can adjust voice settings in `scripts/generate-audio.js`:

```javascript
const CONFIG = {
  voice: {
    languageCode: 'he-IL',
    name: 'he-IL-Wavenet-B',
    ssmlGender: 'MALE'
  },
  audioConfig: {
    audioEncoding: 'MP3',
    speakingRate: 0.95,    // 0.25 to 4.0 (slower to faster)
    pitch: 0,              // -20.0 to 20.0 (lower to higher)
    volumeGainDb: 0,       // -96.0 to 16.0 (quieter to louder)
    sampleRateHertz: 24000 // Audio quality
  }
};
```

## Security Notes

⚠️ **IMPORTANT:**

1. **Never commit** the service account JSON key to Git
2. Add to `.gitignore`:
   ```
   tts-key.json
   *-key.json
   credentials.json
   ```
3. Store credentials securely (e.g., environment variables, secret manager)
4. Rotate keys periodically
5. Use minimal permissions (only Text-to-Speech API User role)

## Next Steps

After generating audio files:

1. ✅ Test a few files by opening them in a media player
2. ✅ Verify all 84 files were created successfully
3. ✅ Test with Twilio using ngrok:
   ```bash
   ngrok http 3000
   # Update Twilio webhook URL
   ```
4. ✅ Make a test call to verify audio plays correctly
5. ✅ Adjust voice/settings if needed and regenerate
6. ✅ Deploy to production server
7. ✅ Set PUBLIC_BASE_URL environment variable in production

## Additional Resources

- [Google Cloud TTS Documentation](https://cloud.google.com/text-to-speech/docs)
- [Pricing Calculator](https://cloud.google.com/products/calculator)
- [Voice Selection Guide](https://cloud.google.com/text-to-speech/docs/voices)
- [SSML Tutorial](https://cloud.google.com/text-to-speech/docs/ssml) (for advanced text formatting)
