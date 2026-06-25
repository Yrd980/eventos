export const PORTS = {
  api: 3000,
  cms: 1337,
  realtime: 3001,
} as const;

export type WechatSecrets = {
  appId: string;
  appSecret: string;
  qrHmacSecret: string;
};

export const DEFAULT_WECHAT_QR_HMAC_SECRET = "yrd";

export * from "./wechat";
