import type { Db } from './db.js';

// Migrações versionadas e aplicadas em ordem, sob advisory lock, na inicialização.
// Nunca editar uma migração já publicada: criar a próxima.
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'fase_a_core',
    sql: `
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_lower ON users (lower(username));

CREATE TABLE sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE kingdoms (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  seed INT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE governors (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  name TEXT NOT NULL,
  civilization TEXT NOT NULL,
  power INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX governors_name_lower ON governors (lower(name));
CREATE INDEX governors_kingdom ON governors (kingdom_id);

CREATE TABLE cities (
  id BIGSERIAL PRIMARY KEY,
  governor_id BIGINT NOT NULL UNIQUE REFERENCES governors(id) ON DELETE CASCADE,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  x INT NOT NULL,
  y INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kingdom_id, x, y)
);
CREATE INDEX cities_kingdom_xy ON cities (kingdom_id, x, y);

CREATE TABLE city_buildings (
  city_id BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  building_type TEXT NOT NULL,
  level INT NOT NULL CHECK (level >= 0),
  PRIMARY KEY (city_id, building_type)
);

CREATE TABLE building_queues (
  id BIGSERIAL PRIMARY KEY,
  city_id BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  building_type TEXT NOT NULL,
  from_level INT NOT NULL,
  to_level INT NOT NULL,
  cost JSONB NOT NULL,
  rules_version INT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','cancelled')),
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX building_queues_one_active ON building_queues (city_id) WHERE status = 'active';
CREATE INDEX building_queues_due ON building_queues (ends_at) WHERE status = 'active';

CREATE TABLE resource_balances (
  city_id BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  amount NUMERIC(20,4) NOT NULL CHECK (amount >= 0),
  settled_at TIMESTAMPTZ NOT NULL,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY (city_id, resource)
);

CREATE TABLE resource_ledger (
  id BIGSERIAL PRIMARY KEY,
  city_id BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  delta NUMERIC(20,4) NOT NULL,
  balance_after NUMERIC(20,4) NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX resource_ledger_city ON resource_ledger (city_id, id);

CREATE TABLE alliances (
  id BIGSERIAL PRIMARY KEY,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disbanded')),
  created_by BIGINT NOT NULL REFERENCES governors(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX alliances_name_unique ON alliances (kingdom_id, lower(name)) WHERE status = 'active';
CREATE UNIQUE INDEX alliances_tag_unique ON alliances (kingdom_id, lower(tag)) WHERE status = 'active';

CREATE TABLE alliance_members (
  governor_id BIGINT PRIMARY KEY REFERENCES governors(id) ON DELETE CASCADE,
  alliance_id BIGINT NOT NULL REFERENCES alliances(id),
  rank SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 5),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX alliance_members_alliance ON alliance_members (alliance_id);

CREATE TABLE alliance_applications (
  id BIGSERIAL PRIMARY KEY,
  alliance_id BIGINT NOT NULL REFERENCES alliances(id),
  governor_id BIGINT NOT NULL REFERENCES governors(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by BIGINT REFERENCES governors(id)
);
CREATE UNIQUE INDEX alliance_applications_pending ON alliance_applications (alliance_id, governor_id) WHERE status = 'pending';

CREATE TABLE chat_channels (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('global','kingdom','alliance')),
  kingdom_id INT REFERENCES kingdoms(id),
  alliance_id BIGINT REFERENCES alliances(id),
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX chat_channels_global ON chat_channels (type) WHERE type = 'global';
CREATE UNIQUE INDEX chat_channels_kingdom ON chat_channels (kingdom_id) WHERE type = 'kingdom';
CREATE UNIQUE INDEX chat_channels_alliance ON chat_channels (alliance_id) WHERE type = 'alliance';

CREATE TABLE chat_messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES chat_channels(id),
  governor_id BIGINT NOT NULL REFERENCES governors(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_channel ON chat_messages (channel_id, id DESC);

CREATE TABLE channel_reads (
  governor_id BIGINT NOT NULL REFERENCES governors(id) ON DELETE CASCADE,
  channel_id BIGINT NOT NULL REFERENCES chat_channels(id),
  last_read_message_id BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (governor_id, channel_id)
);

CREATE TABLE command_idempotency (
  governor_id BIGINT NOT NULL REFERENCES governors(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  command TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (governor_id, key)
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_governor_id BIGINT REFERENCES governors(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`,
  },
];

export async function migrate(db: Db, log: (msg: string) => void = () => {}) {
  const client = await db.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (id INT PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query<{ id: number }>('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (applied.has(m.id)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [m.id, m.name]);
        await client.query('COMMIT');
        log(`migração ${m.id} (${m.name}) aplicada`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}

/** Dados de mundo (não jogadores): reinos iniciais e canais de chat estruturais. */
export async function seedWorld(db: Db) {
  await db.query(`
    INSERT INTO kingdoms (id, name, seed, width, height) VALUES
      (1, 'Reino 1 · Valdoria', 1013, 120, 120),
      (2, 'Reino 2 · Ostmark', 2027, 120, 120)
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`INSERT INTO chat_channels (type) VALUES ('global') ON CONFLICT DO NOTHING`);
  await db.query(`
    INSERT INTO chat_channels (type, kingdom_id)
    SELECT 'kingdom', id FROM kingdoms
    ON CONFLICT DO NOTHING`);
}
