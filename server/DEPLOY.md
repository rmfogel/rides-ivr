# 🚀 Deploy to Production - Render.com Guide

This guide will help you deploy the Rides IVR system to production using **Render.com** (free tier).

---

## ✅ Prerequisites

1. GitHub account (to connect your repository)
2. MongoDB Atlas account (free tier - 512MB)
3. Twilio account with phone number
4. Your code pushed to GitHub

---

## 📋 Step-by-Step Deployment

### 1️⃣ Set Up MongoDB Atlas (5 minutes)

**Why?** You need a database that's accessible from the cloud.

1. Go to https://www.mongodb.com/cloud/atlas/register
2. Create a free account
3. **Create a Cluster:**
   - Choose **M0 Sandbox** (FREE)
   - Region: Choose closest to your users (e.g., Europe/Middle East)
   - Cluster Name: `rides-cluster`
   - Click **Create**

4. **Create Database User:**
   - Security → Database Access → Add New Database User
   - Username: `ridesuser`
   - Password: Generate a strong password (save it!)
   - Database User Privileges: Read and write to any database
   - Click **Add User**

5. **Whitelist IP Addresses:**
   - Security → Network Access → Add IP Address
   - Click **Allow Access from Anywhere** (0.0.0.0/0)
   - This is safe because you have username/password protection
   - Click **Confirm**

6. **Get Connection String:**
   - Click **Connect** on your cluster
   - Choose **Connect your application**
   - Driver: Node.js, Version: 5.5 or later
   - Copy the connection string (looks like):
     ```
     mongodb+srv://ridesuser:<password>@rides-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
   - **Replace `<password>`** with your actual password
   - Save this for later!

---

### 2️⃣ Push to GitHub

Make sure all your code is committed and pushed:

```bash
git status
git add .
git commit -m "feat: prepare for production deployment"
git push origin master
```

---

### 3️⃣ Create Render Account (2 minutes)

1. Go to https://render.com
2. Click **Get Started for Free**
3. Sign up with GitHub
4. Authorize Render to access your repositories

---

### 4️⃣ Create Web Service on Render (5 minutes)

1. **Click "New +" → "Web Service"**

2. **Connect Repository:**
   - Find your `Rides` repository
   - Click **Connect**

3. **Configure Service:**
   
   **Basic Settings:**
   ```
   Name:               rides-ivr
   Region:             Frankfurt (EU Central) or closest to you
   Branch:             master
   Root Directory:     server
   Runtime:            Node
   ```

   **Build & Deploy:**
   ```
   Build Command:      npm install
   Start Command:      npm start
   ```

   **Instance Type:**
   ```
   Free
   ```
   ⚠️ Note: Free tier sleeps after 15 min of inactivity. Upgrade to $7/month for 24/7.

4. **Click "Create Web Service"**

---

### 5️⃣ Configure Environment Variables (5 minutes)

After the service is created, go to **Environment** tab:

**Click "Add Environment Variable"** for each of these:

```bash
# Required Variables
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://rides-ivr.onrender.com

# MongoDB (from Step 1)
MONGODB_URI=mongodb+srv://ridesuser:YOUR_PASSWORD@rides-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=rides

# Session Secret (generate random string)
SESSION_SECRET=your-super-secret-random-string-change-this

# Twilio (from your Twilio console)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_NUMBER=+972xxxxxxxxxx

# Language & Timezone
DEFAULT_LANG=he
TZ=Asia/Jerusalem

# Matching Configuration
MATCH_TTL_SECONDS=600

# Production Setting
ALLOW_ALL_CALLERS=false
```

**To generate a strong SESSION_SECRET:**
```bash
# In PowerShell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# Or use any random string generator
```

**Click "Save Changes"** - This will trigger a new deployment.

---

### 6️⃣ Wait for Deployment (3-5 minutes)

Watch the **Logs** tab to see deployment progress:

```
==> Building...
==> Installing dependencies...
==> Build successful!
==> Starting service...
==> Server listening on port 3000
```

When you see **"Live"** with a green indicator, your app is deployed! 🎉

Your URL will be: `https://rides-ivr.onrender.com`

---

### 7️⃣ Initialize Database (One-time)

Run migrations to set up the database:

1. Go to **Shell** tab in Render dashboard
2. Run:
   ```bash
   npm run migrate
   ```

Optional - Add sample data:
```bash
npm run seed
```

---

### 8️⃣ Configure Twilio Webhooks

Update your Twilio phone number to point to Render:

1. Go to https://console.twilio.com/
2. Phone Numbers → Manage → Active Numbers
3. Click your phone number
4. **Voice Configuration:**
   ```
   A Call Comes In: Webhook
   URL: https://rides-ivr.onrender.com/voice/incoming
   HTTP: POST
   ```
5. **Save**

---

### 9️⃣ Test Your Deployment

**Call your Twilio number!** 📞

You should hear:
- Hebrew greeting: "ברוכים הבאים לשירות הנסיעות"
- Menu options
- All audio files playing correctly

**Check logs:**
- Go to Render → Logs tab
- Watch for incoming call logs
- Verify no errors

---

## 🔧 Post-Deployment Configuration

### Update PUBLIC_BASE_URL in Code (Optional)

If you want to set it in code instead of env var:

```javascript
// server/src/config/environment.js
export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://rides-ivr.onrender.com';
```

### Set Up Custom Domain (Optional)

Render allows free custom domains:

1. Render Dashboard → Settings → Custom Domain
2. Add your domain (e.g., `ivr.yourdomain.com`)
3. Update DNS records as instructed
4. SSL is automatic!

---

## 📊 Monitoring & Maintenance

### Check Application Health

Visit: `https://rides-ivr.onrender.com/health`

Should return:
```json
{
  "status": "ok",
  "timestamp": "2025-10-18T12:00:00.000Z"
}
```

### View Logs

Render Dashboard → Logs tab
- See all console.log output
- Monitor errors and warnings
- Track incoming calls

### MongoDB Monitoring

MongoDB Atlas → Clusters → Metrics
- Database size
- Operations per second
- Connection count

---

## ⚡ Dealing with "Cold Start" (Free Tier)

Free tier sleeps after 15 minutes of inactivity. First call takes ~30 seconds to wake up.

**Solutions:**

### Option 1: Upgrade to Paid ($7/month)
- Always awake
- Faster response
- Better for production

### Option 2: Keep-Alive Service (Free)
Use **UptimeRobot** to ping your app every 5 minutes:

1. Go to https://uptimerobot.com (free account)
2. Add New Monitor:
   ```
   Monitor Type: HTTP(s)
   Friendly Name: Rides IVR Keep-Alive
   URL: https://rides-ivr.onrender.com/health
   Monitoring Interval: 5 minutes
   ```
3. This keeps your app awake during business hours

**Note:** UptimeRobot free tier allows 50 monitors with 5-minute intervals.

---

## 🐛 Troubleshooting

### App Won't Start

**Check Build Logs:**
- Render → Logs → Deploy Logs
- Look for `npm install` errors

**Common Issues:**
- Missing environment variables → Add them in Environment tab
- Wrong Node version → We require Node 18+
- Build timeout → Usually fixes on retry

### Database Connection Errors

**Check:**
```bash
# In Render Shell
echo $MONGODB_URI
```

**Common Issues:**
- Password contains special characters → URL encode them
- IP not whitelisted → Allow 0.0.0.0/0 in MongoDB Atlas
- Wrong database name → Check MONGODB_DB variable

### Twilio Webhooks Failing

**Check:**
1. PUBLIC_BASE_URL is set correctly
2. Twilio webhook URL matches exactly
3. App is deployed and "Live"

**Test manually:**
```bash
curl https://rides-ivr.onrender.com/health
```

### Audio Files Not Playing

**Check:**
1. All MP3 files are committed to Git
2. PUBLIC_BASE_URL is correct
3. Check Render logs for 404 errors

**Verify files exist:**
```bash
# In Render Shell
ls -la public/audio/he/*.mp3
```

---

## 💰 Cost Breakdown

| Service | Free Tier | Paid Option |
|---------|-----------|-------------|
| **Render** | 750 hours/month | $7/month (always on) |
| **MongoDB Atlas** | 512MB storage | $9/month (2GB) |
| **Twilio** | Pay per use | ~$1/month (1 number) |
| **Total** | ~$1-2/month | ~$17/month |

**Recommended for small projects:** Start with free, upgrade Render to paid ($7) when needed.

---

## 🎯 Production Checklist

Before going live:

- [ ] Environment variables set correctly
- [ ] MongoDB Atlas configured and whitelisted
- [ ] Database migrated (`npm run migrate`)
- [ ] Twilio webhooks point to Render URL
- [ ] Test call completed successfully
- [ ] All audio files playing correctly
- [ ] Logs show no errors
- [ ] Health endpoint responding
- [ ] Custom domain configured (optional)
- [ ] Keep-alive monitor set up (if using free tier)
- [ ] Backup strategy planned for MongoDB
- [ ] Session secret is strong and unique

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [MongoDB Atlas Docs](https://docs.atlas.mongodb.com/)
- [Twilio Console](https://console.twilio.com/)
- [Node.js Deployment Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)

---

## 🆘 Need Help?

1. Check Render logs for errors
2. Test locally with ngrok first
3. Verify all environment variables
4. Check MongoDB Atlas metrics
5. Review Twilio webhook logs

**Your app URL:** `https://rides-ivr.onrender.com`

🎉 **You're live!** Happy deploying!
