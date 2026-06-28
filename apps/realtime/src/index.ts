import type { RealtimeEvent } from "@eventos/contracts";
import Redis from "ioredis";

type RealtimeEnv = {
  port: number;
  redis: {
    host: string;
    port: number;
    password?: string;
    channel: string;
  };
};

type SocketData = {
  subscriptions: Set<string>;
};

type RealtimeControlMessage = {
  subscribe?: string[];
  unsubscribe?: string[];
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

function readEnv(): RealtimeEnv {
  return {
    port: readNumber("PORT", readNumber("REALTIME_PORT", 3001)),
    redis: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: readNumber("REDIS_PORT", 6379),
      password: process.env.REDIS_PASSWORD,
      channel: process.env.REALTIME_REDIS_CHANNEL ?? "eventos:realtime",
    },
  };
}

function topicsFor(event: RealtimeEvent) {
  const topics = [`activity:${event.activity_id}`];
  if (event.name === "session.checkin_count_updated") {
    topics.push(`session:${event.session_id}`);
  }
  return topics;
}

function parseSubscriptions(raw: string | undefined) {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(isAllowedTopic);
}

function isAllowedTopic(topic: unknown): topic is string {
  return typeof topic === "string" && (topic.startsWith("activity:") || topic.startsWith("session:"));
}

function parseControlMessage(message: string | Buffer) {
  const raw = typeof message === "string" ? message : message.toString("utf8");
  const parsed = JSON.parse(raw) as RealtimeControlMessage;
  return {
    subscribe: (parsed.subscribe ?? []).filter(isAllowedTopic),
    unsubscribe: (parsed.unsubscribe ?? []).filter(isAllowedTopic),
  };
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
}

const env = readEnv();
const redis = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

let redisReady = false;
let server: Bun.Server<SocketData> | undefined;
const sockets = new Set<Bun.ServerWebSocket<SocketData>>();

await redis.connect();
await redis.subscribe(env.redis.channel);
redisReady = true;

function publishEvent(event: RealtimeEvent) {
  const payload = JSON.stringify(event);
  const topics = topicsFor(event);
  for (const websocket of sockets) {
    if (topics.some((topic) => websocket.data.subscriptions.has(topic))) {
      websocket.send(payload);
    }
  }
}

redis.on("message", (_channel, message) => publishEvent(JSON.parse(message) as RealtimeEvent));

server = Bun.serve<SocketData>({
  port: env.port,
  fetch(req, currentServer) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return json({ data: { ok: true, service: "realtime", redis: redisReady } });
    }

    if (url.pathname === "/realtime") {
      const subscriptions = new Set(parseSubscriptions(url.searchParams.get("topics") ?? undefined));
      if (currentServer.upgrade(req, { data: { subscriptions } })) {
        return;
      }
      return json({ error: { code: "VALIDATION_FAILED", message: "WebSocket upgrade failed" } }, { status: 400 });
    }

    return json({ error: { code: "VALIDATION_FAILED", message: "Route was not found" } }, { status: 404 });
  },
  websocket: {
    open(ws) {
      sockets.add(ws);
      for (const topic of ws.data.subscriptions) {
        ws.subscribe(topic);
      }
      ws.send(JSON.stringify({ name: "realtime.ready", topics: [...ws.data.subscriptions] }));
    },
    close(ws) {
      sockets.delete(ws);
    },
    message(ws, message) {
      const payload = parseControlMessage(message);
      for (const topic of payload.unsubscribe) {
        ws.unsubscribe(topic);
        ws.data.subscriptions.delete(topic);
      }
      for (const topic of payload.subscribe) {
        ws.subscribe(topic);
        ws.data.subscriptions.add(topic);
      }
      ws.send(JSON.stringify({ name: "realtime.subscriptions_updated", topics: [...ws.data.subscriptions] }));
    },
  },
});

console.log(`realtime service listening on ${env.port}`);
