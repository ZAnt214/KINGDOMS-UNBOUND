export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? 'postgres://ku:ku@localhost:5432/ku',
  /** Conexão direta (sem pooler) para LISTEN/NOTIFY e migrações; Neon/Vercel expõem estas variáveis. */
  directDatabaseUrl:
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    'postgres://ku:ku@localhost:5432/ku',
  production: process.env.NODE_ENV === 'production',
  /** Railway e outros proxies terminam TLS antes do processo. */
  trustProxy: process.env.TRUST_PROXY !== 'false',
  sessionDays: 30,
  workerIntervalMs: 1000,
  kingdomCapacity: Number(process.env.KINGDOM_CAPACITY ?? 500),
  /** Tentativas de login/cadastro por minuto e por IP. */
  authRatePerMinute: Number(process.env.AUTH_RATE_PER_MINUTE ?? 10),
};
