import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { ApiEnv } from "../env";
import * as schema from "./schema";

export type DrizzleDb = ReturnType<typeof createDb>;
export type DbSession =
  | NodePgDatabase<typeof schema>
  | PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export function createDb(env: ApiEnv) {
  const pool = new Pool({
    host: env.postgres.host,
    port: env.postgres.port,
    database: env.postgres.database,
    user: env.postgres.user,
    password: env.postgres.password,
    ssl: env.postgres.ssl ? { rejectUnauthorized: false } : undefined,
  });

  const db = drizzle(pool, { schema });

  return {
    db,
    async transaction<T>(callback: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) {
      return db.transaction(callback);
    },
  };
}
