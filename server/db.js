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

    CREATE TABLE IF NOT EXISTS funnels (
      id                   SERIAL PRIMARY KEY,
      name                 TEXT NOT NULL,
      redtrack_campaign_id TEXT UNIQUE,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS domains (
      id                 SERIAL PRIMARY KEY,
      domain             TEXT NOT NULL UNIQUE,
      status             TEXT NOT NULL DEFAULT 'standby' CHECK (status IN ('active', 'standby', 'banned')),
      doc_root           TEXT NOT NULL,
      lander_id          INTEGER REFERENCES landers(id) ON DELETE SET NULL,
      funnel_id          INTEGER REFERENCES funnels(id) ON DELETE SET NULL,
      role               TEXT NOT NULL DEFAULT 'backup' CHECK (role IN ('primary', 'backup')),
      redtrack_lander_id TEXT,
      priority           INTEGER NOT NULL DEFAULT 0,
      added_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      banned_at          TIMESTAMPTZ,
      notes              TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);

    CREATE TABLE IF NOT EXISTS funnel_offers (
      id                SERIAL PRIMARY KEY,
      funnel_id         INTEGER NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
      redtrack_offer_id TEXT NOT NULL,
      offer_title       TEXT NOT NULL,
      weight            INTEGER NOT NULL DEFAULT 100,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rotation_history (
      id             SERIAL PRIMARY KEY,
      funnel_id      INTEGER REFERENCES funnels(id) ON DELETE SET NULL,
      from_domain    TEXT,
      to_domain      TEXT NOT NULL,
      lander_name    TEXT,
      trigger_source TEXT NOT NULL DEFAULT 'api',
      status         TEXT NOT NULL CHECK (status IN ('success', 'failed')),
      error          TEXT,
      rotated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Migrate existing tables — idempotent
  await pool.query(`
    ALTER TABLE domains ADD COLUMN IF NOT EXISTS funnel_id          INTEGER REFERENCES funnels(id) ON DELETE SET NULL;
    ALTER TABLE domains ADD COLUMN IF NOT EXISTS role               TEXT NOT NULL DEFAULT 'backup';
    ALTER TABLE domains ADD COLUMN IF NOT EXISTS redtrack_lander_id TEXT;
    ALTER TABLE rotation_history ADD COLUMN IF NOT EXISTS funnel_id INTEGER REFERENCES funnels(id) ON DELETE SET NULL;
  `).catch(() => {});

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_domains_funnel ON domains(funnel_id);
  `).catch(() => {});

  // Rename campaign column to stream (funnel templates are /streams in RedTrack API)
  await pool.query(`
    ALTER TABLE funnels RENAME COLUMN redtrack_campaign_id TO redtrack_stream_id;
  `).catch(() => {});
}

module.exports = { pool, init };
