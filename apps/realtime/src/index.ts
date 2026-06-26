import type { RealtimeEvent } from "@eventos/contracts";
import Redis from "ioredis";
import uWS from "uWebSockets.js";

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
    .filter(Boolean)
    .filter((item) => item.startsWith("activity:") || item.startsWith("session:"));
}

const env = readEnv();
const app = uWS.App();
const redis = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

let redisReady = false;

app.get("/health", (res) => {
  res
    .writeHeader("content-type", "application/json")
    .end(JSON.stringify({ data: { ok: true, service: "realtime", redis: redisReady } }));
});

app.ws<SocketData>("/realtime", {
  idleTimeout: 120,
  maxPayloadLength: 16 * 1024,
  upgrade(res, req, context) {
    const subscriptions = new Set(parseSubscriptions(req.getQuery("topics")));
    res.upgrade(
      { subscriptions },
      req.getHeader("sec-websocket-key"),
      req.getHeader("sec-websocket-protocol"),
      req.getHeader("sec-websocket-extensions"),
      context,
    );
  },
  open(ws) {
    for (const topic of ws.getUserData().subscriptions) {
      ws.subscribe(topic);
    }
    ws.send(JSON.stringify({ name: "realtime.ready", topics: [...ws.getUserData().subscriptions] }));
  },
  message(ws, message) {
    const raw = Buffer.from(message).toString("utf8");
    const payload = JSON.parse(raw) as { subscribe?: string[]; unsubscribe?: string[] };
    for (const topic of payload.unsubscribe ?? []) {
      if (topic.startsWith("activity:") || topic.startsWith("session:")) {
        ws.unsubscribe(topic);
        ws.getUserData().subscriptions.delete(topic);
      }
    }
    for (const topic of payload.subscribe ?? []) {
      if (topic.startsWith("activity:") || topic.startsWith("session:")) {
        ws.subscribe(topic);
        ws.getUserData().subscriptions.add(topic);
      }
    }
    ws.send(JSON.stringify({ name: "realtime.subscriptions_updated", topics: [...ws.getUserData().subscriptions] }));
  },
});

await redis.connect();
await redis.subscribe(env.redis.channel);
redisReady = true;

redis.on("message", (_channel, message) => {
  const event = JSON.parse(message) as RealtimeEvent;
  const payload = JSON.stringify(event);
  for (const topic of topicsFor(event)) {
    app.publish(topic, payload);
  }
});

app.listen(env.port, (token) => {
  if (!token) {
    throw new Error(`realtime service failed to listen on ${env.port}`);
  }
  console.log(`realtime service listening on ${env.port}`);
});
