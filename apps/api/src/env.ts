export type ApiEnv = {
  port: number;
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
  };
  authing: {
    domain?: string;
    appId?: string;
    audience?: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    realtimeChannel: string;
  };
  qrHmacSecret: string;
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

export function readEnv(): ApiEnv {
  return {
    port: readNumber("PORT", readNumber("API_PORT", 3000)),
    postgres: {
      host: process.env.POSTGRES_HOST ?? "localhost",
      port: readNumber("POSTGRES_PORT", 5432),
      database: process.env.POSTGRES_DB ?? "eventos",
      user: process.env.POSTGRES_USER ?? "eventos",
      password: process.env.POSTGRES_PASSWORD ?? "eventos",
      ssl: process.env.POSTGRES_SSL === "true",
    },
    authing: {
      domain: process.env.AUTHING_DOMAIN,
      appId: process.env.AUTHING_APP_ID,
      audience: process.env.AUTHING_AUDIENCE,
    },
    redis: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: readNumber("REDIS_PORT", 6379),
      password: process.env.REDIS_PASSWORD,
      realtimeChannel: process.env.REALTIME_REDIS_CHANNEL ?? "eventos:realtime",
    },
    qrHmacSecret: process.env.QR_HMAC_SECRET ?? "yrd",
  };
}
