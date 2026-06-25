import { Hono } from "hono";
import { getWechatConfig } from "./wechat";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, service: "api" }));

app.get("/", (c) => c.json({ name: "Event OS API" }));

app.get("/config/wechat", (c) => {
  const wechat = getWechatConfig();

  return c.json({
    hasAppId: Boolean(wechat.appId),
    hasAppSecret: Boolean(wechat.appSecret),
    qrHmacSecret: wechat.qrHmacSecret,
  });
});

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
