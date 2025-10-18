# 🚀 DEPLOYMENT QUICK REFERENCE

## ✅ What's Ready

- ✅ All 68 Hebrew audio files (1.2 MB)
- ✅ Production entry point (`start.js`)
- ✅ Complete deployment guide (`DEPLOY.md`)
- ✅ Environment configuration (`.env.example`)
- ✅ Updated README with full docs
- ✅ All code committed to Git

---

## 🎯 Deploy to Render.com (10 minutes)

### 1. MongoDB Atlas (5 min)
```
1. Sign up: https://www.mongodb.com/cloud/atlas/register
2. Create M0 FREE cluster
3. Create database user
4. Whitelist 0.0.0.0/0
5. Copy connection string
```

### 2. Render.com (5 min)
```
1. Sign up: https://render.com (with GitHub)
2. New → Web Service
3. Connect your GitHub repo
4. Settings:
   - Name: rides-ivr
   - Root: server
   - Build: npm install
   - Start: npm start
   - Instance: Free
```

### 3. Environment Variables
```
Add in Render dashboard:

NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://rides-ivr.onrender.com
MONGODB_URI=<from MongoDB Atlas>
MONGODB_DB=rides
SESSION_SECRET=<generate random string>
TWILIO_ACCOUNT_SID=<from Twilio>
TWILIO_AUTH_TOKEN=<from Twilio>
TWILIO_NUMBER=+972xxxxxxx
DEFAULT_LANG=he
TZ=Asia/Jerusalem
MATCH_TTL_SECONDS=600
ALLOW_ALL_CALLERS=false
```

### 4. Twilio Webhook
```
Point your Twilio number to:
https://rides-ivr.onrender.com/voice/incoming
```

### 5. Test
```
Call your Twilio number and verify:
- Hebrew greeting plays
- Menu works
- All audio files play
```

---

## 💰 Cost

### Free Option (Recommended to start)
```
Render:         FREE (sleeps after 15 min)
MongoDB Atlas:  FREE (512 MB)
Twilio:         ~$1-2/month
Total:          ~$1-2/month
```

### Production Option (No cold start)
```
Render:         $7/month (always on)
MongoDB Atlas:  FREE (512 MB)
Twilio:         ~$1-2/month
Total:          ~$8-9/month
```

---

## 📚 Full Guides

- **DEPLOY.md** - Complete deployment guide
- **README.md** - Project documentation
- **AUDIO-QUICKSTART.md** - Audio regeneration guide

---

## 🐛 Quick Troubleshooting

### App won't start
→ Check Render logs for errors
→ Verify environment variables

### Audio not playing
→ Check PUBLIC_BASE_URL is correct
→ Verify MP3 files are in Git

### Database errors
→ Check MONGODB_URI format
→ Verify IP whitelist (0.0.0.0/0)

### Webhook fails
→ Verify Twilio webhook URL
→ Check app is "Live" in Render

---

## ✨ You're All Set!

Your app is production-ready. Just follow DEPLOY.md for step-by-step instructions.

**Next step:** Push to GitHub and deploy to Render! 🎉
