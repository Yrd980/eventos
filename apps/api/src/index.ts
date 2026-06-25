import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, service: "api" }));

app.get("/", (c) => c.json({ name: "Event OS API" }));

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
