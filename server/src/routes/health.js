import { Router } from 'express';
import { getDb } from '../db/mongoClient.js';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

healthRouter.get('/db', async (req, res) => {
  try {
    const db = await getDb();
    // Run a lightweight ping using the admin command
    await db.command({ ping: 1 });
    res.json({ ok: true, ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
