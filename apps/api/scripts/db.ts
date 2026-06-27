import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

export type DbConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

function readNumber(name: string, defaultValue: number) {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }

  return parsed;
}

export function readDbConfig(): DbConfig {
  return {
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: readNumber("POSTGRES_PORT", 5432),
    database: process.env.POSTGRES_DB ?? "eventos",
    user: process.env.POSTGRES_USER ?? "eventos",
    password: process.env.POSTGRES_PASSWORD ?? "eventos",
    ssl: process.env.POSTGRES_SSL === "true",
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

export async function readSqlFile(path: string) {
  return readFile(path, "utf8");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
