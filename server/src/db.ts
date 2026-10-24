import pg from 'pg';

// numeric → string por padrão; bigint (int8) como número é seguro na escala da Fase A.
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function clientConfig(connectionString: string): pg.ClientConfig {
  const ssl = /sslmode=(require|verify)/.test(connectionString) ? { rejectUnauthorized: false } : undefined;
  // O driver trataria sslmode da URL de forma estrita; o TLS é configurado acima.
  return { connectionString: connectionString.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, ''), ssl };
}

export function createPool(connectionString: string, max = 10): Db {
  return new pg.Pool({ ...clientConfig(connectionString), max });
}

export async function tx<T>(db: Db, fn: (client: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
