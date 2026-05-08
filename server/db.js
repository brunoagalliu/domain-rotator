const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS landers (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      folder     TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS domains (
      id         SERIAL PRIMARY KEY,
      domain     TEXT NOT NULL UNIQUE,
      status     TEXT NOT NULL DEFAULT 'standby' CHECK (status IN ('active', 'standby', 'banned')),
      doc_root   TEXT NOT NULL,
      lander_id  INTEGER REFERENCES landers(id) ON DELETE SET NULL,
      priority   INTEGER NOT NULL DEFAULT 0,
      added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      banned_at  TIMESTAMPTZ,
      notes      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);

    CREATE TABLE IF NOT EXISTS rotation_history (
      id             SERIAL PRIMARY KEY,
      from_domain    TEXT,
      to_domain      TEXT NOT NULL,
      lander_name    TEXT,
      trigger_source TEXT NOT NULL DEFAULT 'api',
      status         TEXT NOT NULL CHECK (status IN ('success', 'failed')),
      error          TEXT,
      rotated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

module.exports = { pool, init };
