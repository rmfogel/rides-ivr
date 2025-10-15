# Rides IVR Server

Minimal Node/Express server to serve Twilio Voice webhooks for the closed-community ride matching IVR.

Requirements
- Node.js 18+
- Twilio account and a Voice phone number

Setup
1. Copy .env.example to .env and fill values.
2. Create a MongoDB Atlas cluster (free tier is fine):
	- Create database user with read/write.
	- Whitelist your IP (or 0.0.0.0/0 for development).
	- Copy the connection string (SRV) into `MONGODB_URI`.
	- Set `MONGODB_DB` (default: rides).
3. Install dependencies: run `npm install` in the `server` folder.
4. Start the server: `npm start` (or `npm run dev` with nodemon).

Environment
- PORT: server port (default 3000)
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN: Twilio credentials for placing ringback calls (and later webhook verification)
- TWILIO_NUMBER: Your Twilio caller ID for outbound ringback and Dial bridges
- PUBLIC_BASE_URL: Public HTTPS base URL where Twilio can reach your webhooks (use ngrok for local dev)
- ALLOW_ALL_CALLERS: 'true' to allow any caller during development; 'false' to restrict (default true)
- MONGODB_URI: Mongo Atlas connection string (SRV)
- MONGODB_DB: Database name (default rides)

Notes
- Webhook content-type is x-www-form-urlencoded by default. We enable both urlencoded and json.
- Voice is set to Polly.Carmel (Hebrew TTS) when available.
- For local development, expose the server with ngrok and set PUBLIC_BASE_URL accordingly so Twilio can invoke /voice/* and ringback-start.
- Postgres has been removed; persistence is now solely in MongoDB.