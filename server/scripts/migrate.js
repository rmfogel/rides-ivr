import fs from 'fs';
import path from 'path';
import url from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const { DATABASE_URL, PGSSL } = process.env;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set. Aborting migration.');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: PGSSL === 'true' ? { rejectUnauthorized: false } : false });
  const client = await pool.connect();
  try {
    const sqlPath = path.join(__dirname, '..', 'db', 'migrations', '001_init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied successfully');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
