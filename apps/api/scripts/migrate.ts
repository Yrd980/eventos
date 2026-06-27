import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, readDbConfig, readSqlFile, sha256 } from "./db";

const migrationsDir = resolve(fileURLToPath(new URL("../../../infra/sql/migrations", import.meta.url)));

function sqlInsideMigrationTransaction(sql: string) {
  const withoutBegin = sql.replace(/^\s*BEGIN;\s*/i, "");
  return withoutBegin.replace(/\s*COMMIT;\s*$/i, "");
}

async function main() {
  const pool = createPool(readDbConfig());
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        executed_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const name = basename(file);
      const sql = await readSqlFile(join(migrationsDir, file));
      const checksum = sha256(sql);
      const existing = await pool.query<{ checksum: string }>("SELECT checksum FROM schema_migrations WHERE name = $1", [name]);

      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Migration ${name} was already applied with a different checksum`);
        }
        console.log(`skip ${name}`);
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sqlInsideMigrationTransaction(sql));
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
        await client.query("COMMIT");
        console.log(`applied ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
