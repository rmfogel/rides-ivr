# 🚗 Rides IVR Server

A complete Hebrew-language Twilio IVR system for closed-community ride matching with pre-recorded audio.

## ✨ Features

- 🎙️ **68 Pre-recorded Hebrew audio files** (Google Cloud TTS - WaveNet quality)
- 📞 **Complete IVR flow** for riders and drivers
- 🤝 **Intelligent matching algorithm** for ride requests/offers
- 📊 **MongoDB persistence** for requests, offers, and matches
- 🔄 **Real-time matching** with ringback notifications
- 🌍 **Multi-language support** (Hebrew primary)
- 🎯 **Production-ready** with Render.com deployment guide

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- **MongoDB Atlas account** (free tier)
- **Twilio account** with phone number
- **Google Cloud account** (optional, for audio regeneration)

### Local Development

1. **Clone and install:**
   ```bash
   cd server
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Set up MongoDB:**
   - Create free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
   - Get connection string and add to `.env`

4. **Run migrations:**
   ```bash
   npm run migrate
   ```

5. **Start server:**
   ```bash
   npm run dev
   ```

6. **Expose with ngrok:**
   ```bash
   ngrok http 3000
   # Copy HTTPS URL to .env as PUBLIC_BASE_URL
   ```

7. **Configure Twilio:**
   - Point your Twilio number webhook to: `https://YOUR-NGROK-URL/voice/incoming`

---

## 📋 Environment Variables

See `.env.example` for full list. Key variables:

```bash
# Server
NODE_ENV=development
PORT=3000
PUBLIC_BASE_URL=https://your-app.onrender.com

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
MONGODB_DB=rides

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_NUMBER=+972xxxxxxxx

# Language
DEFAULT_LANG=he
TZ=Asia/Jerusalem
```

---

## 📁 Project Structure

```
server/
├── src/
│   ├── app.js              # Main Express app
│   ├── routes/             # Voice routes
│   │   ├── voice.js        # Main IVR flow
│   │   ├── manage.js       # Management menu
│   │   └── duplicate.js    # Ride duplication
│   ├── utils/
│   │   └── recordings.js   # Audio playback helpers
│   ├── db/                 # Database clients & repos
│   ├── engine/             # Matching algorithm
│   └── config/             # Configuration
├── public/
│   └── audio/
│       └── he/             # 68 Hebrew MP3 files
│           ├── 001.mp3 - 082.mp3  # General prompts
│           ├── 100.mp3 - 124.mp3  # Match prompts
│           ├── 200.mp3 - 209.mp3  # Building blocks
│           ├── 3000.mp3 - 3011.mp3 # Digits/symbols
│           └── dictionary.json     # ID→Text mapping
├── scripts/
│   ├── generate-audio.js   # Google Cloud TTS generator
│   ├── migrate.js          # Database migrations
│   └── seed.js             # Sample data
├── docs/
│   ├── DEPLOY.md          # Production deployment guide
│   ├── audio-generation-guide.md
│   └── recordings-audit.md
└── start.js               # Production entry point
```

---

## 🎙️ Audio Files

All audio files are pre-generated using Google Cloud Text-to-Speech (WaveNet):

- **Voice:** he-IL-Wavenet-B (male, professional)
- **Total files:** 68 MP3s (~1.2 MB)
- **Quality:** 24kHz sample rate

### Regenerate Audio

```bash
npm run audio:generate     # Generate missing files
npm run audio:regenerate   # Regenerate all files
npm run audio:test         # Test Google Cloud xxxxxction
npm run audio:voices       # List available voices
```

See [AUDIO-QUICKSTART.md](./AUDIO-QUICKSTART.md) for setup guide.

---

## 🚀 Production Deployment

### Deploy to Render.com (Recommended - Free!)

See [DEPLOY.md](./DEPLOY.md) for complete step-by-step guide.

**Quick summary:**
1. Push to GitHub
2. Create Render.com account (free)
3. Create Web Service from repo
4. Add environment variables
5. Configure Twilio webhooks
6. You're live! 🎉

**Cost:** Free tier (with cold start) or $7/month for always-on.

---

## 🛠️ Available Scripts

```bash
npm start              # Start production server
npm run dev            # Development mode with nodemon
npm run migrate        # Run database migrations
npm run seed           # Seed sample data

# Audio generation
npm run audio:generate    # Generate audio files
npm run audio:test        # Texxxxxxxxxxxxction

# Legacy (not used with recordings)
npm run tts:he           # Old TTS script
```

---

## 📞 IVR Flow

### Main Menu
1. **Driver** - Create ride offer
2. **Rider** - Create ride request  
3. **Manage** - Cancel or duplicate rides

### Rider Flow
1. Direction (from/to settlement)
2. Date selection
3. Time window (earliest/latest)
4. Passenger details (male/female/couples)
5. Together or separate travel
6. Confirmation
7. Immediate matching if driver available

### Driver Flow
1. Direction (from/to settlement)
2. Date selection
3. Departure time
4. Seat availability (male/female/anygender)
5. Confirmation
6. Immediate matching if rider available

---

## 🤝 Matching Algorithm

Located in `src/engine/matching.js`:

- **Time overlap:** Checks departure time within request window
- **Direction match:** Same FROM/TO direction
- **Passenger/seat compatibility:** Gender-specific seating
- **Couples handling:** Ensures couples stay together
- **Together/separate:** Respects passenger preferences

---

## 🗄️ Database Schema

### Collections

**`requests`** - Rider requests
- rider_phone, direction, earliest_time, latest_time
- passengers (male/female/couples), together
- status: open/matched/cancelled

**`offers`** - Driver offers
- driver_phone, direction, departure_time
- seats (male_only/female_only/anygender)
- status: open/matched/cancelled

**`matches`** - Potential matches
- request_id, offer_id
- status: pending/accepted/declined
- created_at

**`users`** - User profiles (optional)
- phone, name, preferred_lang

---

## 🔒 Security

- ✅ Session secrets in environment variables
- ✅ MongoDB credentials not in code
- ✅ Twilio credentials secured
- ✅ Google Cloud credentials in .gitignore
- ✅ Input validation on all phone input
- ⚠️ Consider adding Twilio webhook signature validation

---

## 🐛 Troubleshooting

### Audio files not playing
- Check `PUBLIC_BASE_URL` is set correctly
- Verify MP3 files exist in `public/audio/he/`
- Check Twilio debugger for 404 errors

### Database connection fails
- Verify MongoDB URI format
- Check IP whitelist in MongoDB Atlas
- Ensure database user has correct permissions

### Cold start delays (Render free tier)
- Use UptimeRobot for keep-alive pings
- Or upgrade to $7/month paid plan

See [DEPLOY.md](./DEPLOY.md#-troubleshooting) for more.

---

## 📚 Documentation

- [DEPLOY.md](./DEPLOY.md) - Production deployment guide
- [AUDIO-QUICKSTART.md](./AUDIO-QUICKSTART.md) - Audio generation quick start
- [docs/audio-generation-guide.md](./docs/audio-generation-guide.md) - Complete audio guide
- [docs/recordings-audit.md](./docs/recordings-audit.md) - Code audit report
- [docs/AUDIO-SYSTEM-SUMMARY-HE.md](./docs/AUDIO-SYSTEM-SUMMARY-HE.md) - Hebrew summary

---

## 🤝 Contributing

This is a closed-community project. For bugs or suggestions, please open an issue.

---

## 📄 License

Private project - All rights reserved.

---

## 🎯 Roadmap

- [ ] Twilio webhook signature validation
- [ ] Admin dashboard for managing rides
- [ ] SMS notifications
- [ ] Multiple settlements support
- [ ] Recurring rides
- [ ] Driver ratings
- [ ] Analytics dashboard

---

**Made with ❤️ for the community**