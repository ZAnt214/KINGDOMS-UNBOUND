import pg from 'pg';

// numeric → string por padrão; bigint (int8) como número é seguro na escala da Fase A.
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(connectionString: string): Db {
  const ssl = /sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined;
  return new pg.Pool({ connectionString, max: 10, ssl });
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
