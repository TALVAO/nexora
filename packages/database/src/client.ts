import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
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

/**
 * Sessão de tenant ativa na requisição corrente.
 *
 * Toda consulta feita dentro dela roda na MESMA conexão, dentro da mesma
 * transação, com `app.current_tenant_id` definido e privilégio rebaixado para
 * a role de aplicação. É isso que faz o RLS valer: sem a mesma conexão, o
 * `SET LOCAL` não alcança a query.
 */
export interface TenantSession {
  client: pg.PoolClient;
  tenantId: string;
  /**
   * Executados DEPOIS do COMMIT. Invalidar cache antes do commit abre janela
   * para um leitor concorrente repovoá-lo com o estado antigo.
   */
  afterCommit: Array<() => void>;
}

const tenantSessionStorage = new AsyncLocalStorage<TenantSession>();

export function getTenantSession(): TenantSession | undefined {
  return tenantSessionStorage.getStore();
}

export function runInTenantSession<T>(session: TenantSession, fn: () => Promise<T>): Promise<T> {
  return tenantSessionStorage.run(session, fn);
}

export async function query<T = unknown>(
  text: string,
  params?: unknown[],
  pool?: pg.Pool,
): Promise<QueryResult<T>> {
  // Preferência: pool explícito > conexão da sessão de tenant > pool global.
  // Repositórios não precisam saber que estão dentro de uma transação.
  const p = pool || tenantSessionStorage.getStore()?.client || getDatabasePool();
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
