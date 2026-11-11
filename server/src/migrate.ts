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
  {
    id: 2,
    name: 'world_command',
    sql: `
CREATE TABLE world_blocs (
  id SERIAL PRIMARY KEY,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  position INT NOT NULL DEFAULT 0,
  UNIQUE (kingdom_id, key)
);

CREATE TABLE world_territories (
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  country_code TEXT NOT NULL,
  bloc_id INT REFERENCES world_blocs(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kingdom_id, country_code)
);
CREATE INDEX world_territories_bloc ON world_territories (bloc_id);

CREATE TABLE world_wars (
  id BIGSERIAL PRIMARY KEY,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  attacker_bloc_id INT NOT NULL REFERENCES world_blocs(id) ON DELETE CASCADE,
  defender_bloc_id INT NOT NULL REFERENCES world_blocs(id) ON DELETE CASCADE,
  theater TEXT NOT NULL,
  country_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  CHECK (attacker_bloc_id <> defender_bloc_id)
);
CREATE INDEX world_wars_active ON world_wars (kingdom_id) WHERE ended_at IS NULL;

ALTER TABLE governors ADD COLUMN bloc_id INT REFERENCES world_blocs(id) ON DELETE SET NULL;
CREATE INDEX governors_bloc ON governors (bloc_id);
`,
  },
  {
    id: 3,
    name: 'nations_territory',
    sql: `
-- Cada linha de kingdoms é um mundo de jogo; o modo define ritmo e condição de vitória.
ALTER TABLE kingdoms ADD COLUMN mode TEXT NOT NULL DEFAULT 'campaign' CHECK (mode IN ('campaign','quick','team'));

CREATE TABLE nations (
  governor_id BIGINT PRIMARY KEY REFERENCES governors(id) ON DELETE CASCADE,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color ~ '^#[0-9a-f]{6}$'),
  flag JSONB NOT NULL,
  flag_image BYTEA,
  flag_image_type TEXT,
  flag_image_version INT NOT NULL DEFAULT 0,
  capital_point TEXT NOT NULL,
  founded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((flag_image IS NULL) = (flag_image_type IS NULL))
);
CREATE UNIQUE INDEX nations_name_unique ON nations (kingdom_id, lower(name));
CREATE UNIQUE INDEX nations_capital_unique ON nations (kingdom_id, capital_point);

-- Quem controla cada região de cada mundo. Região sem linha é neutra.
CREATE TABLE region_control (
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  region_id TEXT NOT NULL,
  governor_id BIGINT NOT NULL REFERENCES nations(governor_id) ON DELETE CASCADE,
  since TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kingdom_id, region_id)
);
CREATE INDEX region_control_owner ON region_control (governor_id);

-- Ocupações em andamento e concluídas. Os índices parciais garantem, no banco, uma ocupação
-- ativa por nação e uma por região: dois pedidos simultâneos não passam os dois.
CREATE TABLE occupations (
  id BIGSERIAL PRIMARY KEY,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  governor_id BIGINT NOT NULL REFERENCES nations(governor_id) ON DELETE CASCADE,
  region_id TEXT NOT NULL,
  from_region_id TEXT NOT NULL,
  rules_version INT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','failed')),
  completed_at TIMESTAMPTZ,
  CHECK (ends_at > started_at)
);
CREATE UNIQUE INDEX occupations_one_per_nation ON occupations (governor_id) WHERE status = 'active';
CREATE UNIQUE INDEX occupations_one_per_region ON occupations (kingdom_id, region_id) WHERE status = 'active';
CREATE INDEX occupations_due ON occupations (ends_at) WHERE status = 'active';
`,
  },
  {
    id: 4,
    name: 'economy_quick_match',
    sql: `
-- Mundos: os da campanha (fixos) e as partidas rápidas, criadas sob demanda.
-- As tabelas do jogo medieval (cities, building_queues, world_blocs…) ficam no banco sem uso:
-- apagá-las é irreversível e fica para uma migração própria, depois que nenhum deploy antigo as ler.
CREATE SEQUENCE kingdoms_id_seq START 1000 OWNED BY kingdoms.id;
ALTER TABLE kingdoms ALTER COLUMN id SET DEFAULT nextval('kingdoms_id_seq');
ALTER TABLE kingdoms
  ADD COLUMN theater TEXT,
  ADD COLUMN arena JSONB,
  ADD COLUMN ends_at TIMESTAMPTZ,
  ADD COLUMN finished_at TIMESTAMPTZ,
  ADD COLUMN outcome TEXT,
  ADD COLUMN winner_governor_id BIGINT REFERENCES governors(id) ON DELETE SET NULL,
  ADD COLUMN owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX kingdoms_quick_active ON kingdoms (id) WHERE mode = 'quick' AND finished_at IS NULL;
UPDATE kingdoms SET name = 'Campanha · Mundo ' || id WHERE mode = 'campaign';

-- Um usuário pode estar em vários mundos (campanha e partidas rápidas). Bots não têm usuário.
ALTER TABLE governors DROP CONSTRAINT governors_user_id_key;
ALTER TABLE governors ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE governors ALTER COLUMN civilization SET DEFAULT 'none';
ALTER TABLE governors ADD COLUMN is_bot BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE governors ADD CONSTRAINT governors_owner CHECK (is_bot OR user_id IS NOT NULL);
CREATE UNIQUE INDEX governors_user_world ON governors (user_id, kingdom_id) WHERE user_id IS NOT NULL;
CREATE INDEX governors_user ON governors (user_id);

-- Saldo de cada recurso da nação, válido no instante settled_at; entre acertos o valor é projetado
-- pela produção (calculada das regiões e construções).
CREATE TABLE nation_resources (
  governor_id BIGINT NOT NULL REFERENCES nations(governor_id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  amount NUMERIC(20,4) NOT NULL CHECK (amount >= 0),
  settled_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (governor_id, resource)
);

-- Construções no mapa. Uma de cada tipo por região; obra em andamento quando target_level não é nulo.
CREATE TABLE structures (
  id BIGSERIAL PRIMARY KEY,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  governor_id BIGINT NOT NULL REFERENCES nations(governor_id) ON DELETE CASCADE,
  region_id TEXT NOT NULL,
  type TEXT NOT NULL,
  level INT NOT NULL DEFAULT 0 CHECK (level >= 0),
  target_level INT,
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  rules_version INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kingdom_id, region_id, type),
  CHECK ((target_level IS NULL) = (ends_at IS NULL)),
  CHECK (target_level IS NULL OR target_level = level + 1)
);
CREATE INDEX structures_owner ON structures (governor_id);
CREATE INDEX structures_due ON structures (ends_at) WHERE target_level IS NOT NULL;

-- Resultado final de cada nação numa partida encerrada.
CREATE TABLE match_results (
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  governor_id BIGINT NOT NULL REFERENCES governors(id) ON DELETE CASCADE,
  rank INT NOT NULL,
  regions INT NOT NULL,
  area BIGINT NOT NULL,
  PRIMARY KEY (kingdom_id, governor_id)
);
`,
  },
  {
    id: 5,
    name: 'structure_position',
    sql: `
-- Construções ficam no ponto exato escolhido pelo jogador. Construções antigas, sem posição,
-- continuam aparecendo no ponto de rótulo da região. Vários do mesmo tipo podem dividir a região;
-- o limite passa a ser o número de espaços (área da região) e a distância entre construções.
ALTER TABLE structures ADD COLUMN lon DOUBLE PRECISION, ADD COLUMN lat DOUBLE PRECISION;
ALTER TABLE structures ADD CONSTRAINT structures_position CHECK ((lon IS NULL) = (lat IS NULL) AND (lon IS NULL OR (lon BETWEEN -180 AND 180 AND lat BETWEEN -90 AND 90)));
ALTER TABLE structures DROP CONSTRAINT structures_kingdom_id_region_id_type_key;
CREATE INDEX structures_region ON structures (kingdom_id, region_id);
`,
  },
  {
    id: 6,
    name: 'military',
    sql: `
-- Fase D: recrutas, exército, fila de treinamento e pesquisa. Regras em shared/play/military.ts.
-- Recrutas crescem com o tempo (como os recursos): valor no instante settled_at.
CREATE TABLE military (
  governor_id BIGINT PRIMARY KEY REFERENCES nations(governor_id) ON DELETE CASCADE,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  recruits NUMERIC(14,4) NOT NULL CHECK (recruits >= 0),
  settled_at TIMESTAMPTZ NOT NULL,
  power INT NOT NULL DEFAULT 0
);
INSERT INTO military (governor_id, kingdom_id, recruits, settled_at)
SELECT governor_id, kingdom_id, 40, now() FROM nations;

CREATE TABLE army (
  governor_id BIGINT NOT NULL REFERENCES nations(governor_id) ON DELETE CASCADE,
  unit TEXT NOT NULL,
  amount INT NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (governor_id, unit)
);

-- Lotes de treinamento, em sequência: cada lote começa quando o anterior termina.
CREATE TABLE training (
  id BIGSERIAL PRIMARY KEY,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  governor_id BIGINT NOT NULL REFERENCES nations(governor_id) ON DELETE CASCADE,
  unit TEXT NOT NULL,
  amount INT NOT NULL CHECK (amount > 0),
  started_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > started_at),
  rules_version INT NOT NULL
);
CREATE INDEX training_due ON training (ends_at);
CREATE INDEX training_owner ON training (governor_id, ends_at);

-- Uma linha por tecnologia pesquisada; pesquisa em andamento quando target_level não é nulo.
CREATE TABLE research (
  governor_id BIGINT NOT NULL REFERENCES nations(governor_id) ON DELETE CASCADE,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  tech TEXT NOT NULL,
  level INT NOT NULL DEFAULT 0 CHECK (level >= 0),
  target_level INT,
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  PRIMARY KEY (governor_id, tech),
  CHECK ((target_level IS NULL) = (ends_at IS NULL)),
  CHECK (target_level IS NULL OR target_level = level + 1)
);
CREATE INDEX research_due ON research (ends_at) WHERE target_level IS NOT NULL;
CREATE UNIQUE INDEX research_one_active ON research (governor_id) WHERE target_level IS NOT NULL;
`,
  },
  {
    id: 7,
    name: 'war',
    sql: `
-- Fase E: operações militares (ataques terrestres e navais) e mísseis. Regras em shared/play/war.ts.
-- A batalha é determinística: guarda-se o início (setup) e os acontecimentos (events); o estado em
-- qualquer instante é simulado de novo. ends_at é a previsão do fim com os acontecimentos conhecidos.
CREATE TABLE operations (
  id BIGSERIAL PRIMARY KEY,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  attacker_id BIGINT NOT NULL REFERENCES nations(governor_id) ON DELETE CASCADE,
  defender_id BIGINT NOT NULL REFERENCES nations(governor_id) ON DELETE CASCADE,
  region_id TEXT NOT NULL,
  from_region TEXT NOT NULL,
  naval BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  setup JSONB NOT NULL,
  events JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'failed')),
  finished_at TIMESTAMPTZ,
  result JSONB,
  rules_version INT NOT NULL,
  CHECK (attacker_id <> defender_id)
);
CREATE UNIQUE INDEX operations_one_per_region ON operations (kingdom_id, region_id) WHERE status = 'active';
CREATE INDEX operations_due ON operations (ends_at) WHERE status = 'active';
CREATE INDEX operations_attacker ON operations (attacker_id) WHERE status = 'active';
CREATE INDEX operations_defender ON operations (defender_id) WHERE status = 'active';

-- Mísseis: a interceptação é decidida no lançamento (sorteio reproduzível pelo id) e só aparece no
-- instante da interceptação; o impacto é aplicado em impact_at.
CREATE TABLE strikes (
  id BIGSERIAL PRIMARY KEY,
  kingdom_id INT NOT NULL REFERENCES kingdoms(id),
  attacker_id BIGINT NOT NULL REFERENCES nations(governor_id) ON DELETE CASCADE,
  defender_id BIGINT NOT NULL REFERENCES nations(governor_id) ON DELETE CASCADE,
  silo_id BIGINT NOT NULL,
  from_lon DOUBLE PRECISION NOT NULL,
  from_lat DOUBLE PRECISION NOT NULL,
  region_id TEXT NOT NULL,
  launched_at TIMESTAMPTZ NOT NULL,
  flight_at TIMESTAMPTZ NOT NULL,
  intercept_at TIMESTAMPTZ NOT NULL,
  impact_at TIMESTAMPTZ NOT NULL,
  chance REAL NOT NULL,
  intercepted BOOLEAN NOT NULL,
  status TEXT NOT NULL DEFAULT 'flying' CHECK (status IN ('flying', 'intercepted', 'impact')),
  result JSONB,
  rules_version INT NOT NULL
);
CREATE UNIQUE INDEX strikes_one_per_silo ON strikes (silo_id) WHERE status = 'flying';
CREATE INDEX strikes_due ON strikes (impact_at) WHERE status = 'flying';

-- Tropas estimadas, públicas como o poder (inteligência).
ALTER TABLE military ADD COLUMN troops INT NOT NULL DEFAULT 0;
`,
  },
  {
    id: 8,
    name: 'unlimited_accounts',
    sql: `
-- Conta de teste com recursos infinitos (gastos, recrutas). Só se liga direto no banco, pelo dono
-- do jogo: não há rota da API que mude esta coluna.
ALTER TABLE users ADD COLUMN unlimited BOOLEAN NOT NULL DEFAULT false;
`,
  },
  {
    id: 9,
    name: 'conquest_and_weapons',
    sql: `
-- Partida rápida sem relógio de fim: vence quem conquistar 100% da arena. started_at marca o início
-- (fundação do jogador); ends_at deixa de ser usado como prazo.
ALTER TABLE kingdoms ADD COLUMN started_at TIMESTAMPTZ;
UPDATE kingdoms SET started_at = ends_at - interval '15 minutes', ends_at = NULL WHERE mode = 'quick' AND ends_at IS NOT NULL;
-- Silo lança direto (sem pesquisa nem estoque): míssil ou bomba pesada.
ALTER TABLE strikes ADD COLUMN weapon TEXT NOT NULL DEFAULT 'missile' CHECK (weapon IN ('missile', 'bomb'));
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
      (1, 'Campanha · Mundo 1', 1013, 120, 120),
      (2, 'Campanha · Mundo 2', 2027, 120, 120)
    ON CONFLICT (id) DO NOTHING`);
  await db.query(`INSERT INTO chat_channels (type) VALUES ('global') ON CONFLICT DO NOTHING`);
  await db.query(`
    INSERT INTO chat_channels (type, kingdom_id)
    SELECT 'kingdom', id FROM kingdoms WHERE mode = 'campaign'
    ON CONFLICT DO NOTHING`);
}
