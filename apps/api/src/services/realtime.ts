import type { RealtimeEvent } from "@eventos/contracts";
import Redis from "ioredis";
import type { ApiEnv } from "../env";

export type RealtimePublisher = {
  publish(event: RealtimeEvent): Promise<void>;
};

export function createNoopRealtimePublisher(): RealtimePublisher {
  return {
    async publish() {
      return;
    },
  };
}

export function createRedisRealtimePublisher(env: ApiEnv): RealtimePublisher {
  const redis = new Redis({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });

  async function ensureConnected() {
    if (redis.status === "wait" || redis.status === "end") {
      await redis.connect();
    }
  }

  return {
    async publish(event) {
      await ensureConnected();
      await redis.publish(env.redis.realtimeChannel, JSON.stringify(event));
    },
  };
}
