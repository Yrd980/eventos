import { z } from "zod";

export type ApiEnv = {
  nodeEnv: string;
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
  devAuth: {
    enabled: boolean;
    token: string;
    authingUserId: string;
    authingOrgId: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    realtimeChannel: string;
  };
  qrHmacSecret: string;
};

const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());
const booleanString = z.preprocess((value) => (value === undefined || value === "" ? "false" : value), z.enum(["true", "false"]).transform((value) => value === "true"));

const envSchema = z
  .object({
    NODE_ENV: z.string().min(1).default("production"),
    PORT: z.coerce.number().int().positive().optional(),
    API_PORT: z.coerce.number().int().positive().default(3000),
    POSTGRES_HOST: z.string().min(1).default("localhost"),
    POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
    POSTGRES_DB: z.string().min(1).default("eventos"),
    POSTGRES_USER: z.string().min(1).default("eventos"),
    POSTGRES_PASSWORD: z.string().default("eventos"),
    POSTGRES_SSL: booleanString,
    AUTHING_DOMAIN: optionalString,
    AUTHING_APP_ID: optionalString,
    AUTHING_AUDIENCE: optionalString,
    EVENTOS_DEV_AUTH_ENABLED: booleanString,
    EVENTOS_DEV_AUTH_TOKEN: z.string().min(1).default("dev-operator-token"),
    EVENTOS_DEV_AUTH_USER_ID: z.string().min(1).default("authing-dev-operator"),
    EVENTOS_DEV_AUTH_ORG_ID: z.string().min(1).default("authing-dev-org"),
    REDIS_HOST: z.string().min(1).default("localhost"),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    REDIS_PASSWORD: optionalString,
    REALTIME_REDIS_CHANNEL: z.string().min(1).default("eventos:realtime"),
    QR_HMAC_SECRET: z.string().min(1).default("yrd"),
  })
  .passthrough();

export function readEnv(): ApiEnv {
  const env = envSchema.parse(process.env);
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT ?? env.API_PORT,
    postgres: {
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      ssl: env.POSTGRES_SSL,
    },
    authing: {
      domain: env.AUTHING_DOMAIN,
      appId: env.AUTHING_APP_ID,
      audience: env.AUTHING_AUDIENCE,
    },
    devAuth: {
      enabled: env.EVENTOS_DEV_AUTH_ENABLED,
      token: env.EVENTOS_DEV_AUTH_TOKEN,
      authingUserId: env.EVENTOS_DEV_AUTH_USER_ID,
      authingOrgId: env.EVENTOS_DEV_AUTH_ORG_ID,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      realtimeChannel: env.REALTIME_REDIS_CHANNEL,
    },
    qrHmacSecret: env.QR_HMAC_SECRET,
  };
}
