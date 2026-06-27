import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import * as schema from "../src/db/schema";

export type DbConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

const booleanString = z.preprocess((value) => (value === undefined || value === "" ? "false" : value), z.enum(["true", "false"]).transform((value) => value === "true"));
const dbEnvSchema = z
  .object({
    POSTGRES_HOST: z.string().min(1).default("localhost"),
    POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
    POSTGRES_DB: z.string().min(1).default("eventos"),
    POSTGRES_USER: z.string().min(1).default("eventos"),
    POSTGRES_PASSWORD: z.string().default("eventos"),
    POSTGRES_SSL: booleanString,
  })
  .passthrough();

export function readDbConfig(): DbConfig {
  const env = dbEnvSchema.parse(process.env);
  return {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    ssl: env.POSTGRES_SSL,
  };
}

export function createPool(config: DbConfig) {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  });
}

export function createScriptDb(config: DbConfig) {
  const pool = createPool(config);
  return {
    db: drizzle(pool, { schema }),
    async close() {
      await pool.end();
    },
  };
}

export async function readSqlFile(path: string) {
  return readFile(path, "utf8");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
