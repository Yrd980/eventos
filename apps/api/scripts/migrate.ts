import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { createScriptDb, readDbConfig, readSqlFile, sha256 } from "./db";
import { schemaMigrations } from "../src/db/schema";

const migrationsDir = resolve(fileURLToPath(new URL("../../../infra/sql/migrations", import.meta.url)));

function sqlInsideMigrationTransaction(value: string) {
  const withoutBegin = value.replace(/^\s*BEGIN;\s*/i, "");
  return withoutBegin.replace(/\s*COMMIT;\s*$/i, "");
}

async function main() {
  const database = createScriptDb(readDbConfig());
  try {
    await database.db.execute(sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        executed_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const name = basename(file);
      const migrationSql = await readSqlFile(join(migrationsDir, file));
      const checksum = sha256(migrationSql);
      const existing = await database.db.select().from(schemaMigrations).where(eq(schemaMigrations.name, name)).limit(1);

      if (existing[0]) {
        if (existing[0].checksum !== checksum) {
          throw new Error(`Migration ${name} was already applied with a different checksum`);
        }
        console.log(`skip ${name}`);
        continue;
      }

      await database.db.transaction(async (tx) => {
        await tx.execute(sql.raw(sqlInsideMigrationTransaction(migrationSql)));
        await tx.insert(schemaMigrations).values({ name, checksum });
      });
      console.log(`applied ${name}`);
    }
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
