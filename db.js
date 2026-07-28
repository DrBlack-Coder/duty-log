// Thin data-access layer. The whole app's data (settings + duties) is stored
// as one JSON document per install, in a single Postgres table. This keeps
// the server tiny while still giving you a real, durable database — and it's
// a straightforward migration path to proper relational tables later if you
// ever need to query across duties on the server side.
const { Pool } = require("pg");

const useSSL = process.env.PGSSL !== "false";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getState(id) {
  const { rows } = await pool.query("SELECT data FROM app_data WHERE id = $1", [id]);
  return rows.length ? rows[0].data : null;
}

async function setState(id, data) {
  await pool.query(
    `INSERT INTO app_data (id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [id, data]
  );
}

module.exports = { pool, initDb, getState, setState };
