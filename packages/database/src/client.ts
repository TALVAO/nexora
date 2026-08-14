import pg from "pg";
const { Pool } = pg;

export interface DatabaseConfig {
  connectionString?: string;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

let globalPool: pg.Pool | null = null;

export function getDatabasePool(config?: DatabaseConfig): pg.Pool {
  if (!globalPool) {
    const connectionString =
      config?.connectionString ||
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgrespassword@localhost:5432/nexora_dev";

    globalPool = new Pool({
      connectionString,
      max: config?.maxConnections || 10,
      idleTimeoutMillis: config?.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config?.connectionTimeoutMillis || 5000,
    });
  }

  return globalPool;
}

export async function closeDatabasePool(): Promise<void> {
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
  }
}

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number | null;
}

export async function query<T = unknown>(
  text: string,
  params?: unknown[],
  pool?: pg.Pool,
): Promise<QueryResult<T>> {
  const p = pool || getDatabasePool();
  const start = Date.now();
  try {
    const res = await p.query(text, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount,
    };
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`[DB Error] Query failed after ${duration}ms:`, { text, err });
    throw err;
  }
}

export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
  pool?: pg.Pool,
): Promise<T> {
  const p = pool || getDatabasePool();
  const client = await p.connect();
  try {
    await client.query("BEGIN;");
    const result = await callback(client);
    await client.query("COMMIT;");
    return result;
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}
