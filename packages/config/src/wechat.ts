import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { DEFAULT_WECHAT_QR_HMAC_SECRET, type WechatSecrets } from "./index";

type SecretFile = {
  AppID?: string;
  AppSecret?: string;
};

function parseSecretFile(content: string): SecretFile {
  const lines = content.split(/\r?\n/);
  const secret: SecretFile = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim();

    if (key === "AppID") secret.AppID = value;
    if (key === "AppSecret") secret.AppSecret = value;
  }

  return secret;
}

function readLocalSecretFile(): SecretFile {
  const localSecretPath = join(homedir(), "secret.md");
  const dotSecretPath = join(homedir(), ".secret.md");

  if (existsSync(dotSecretPath)) {
    return parseSecretFile(readFileSync(dotSecretPath, "utf8"));
  }

  if (existsSync(localSecretPath)) {
    return parseSecretFile(readFileSync(localSecretPath, "utf8"));
  }

  return {};
}

export function getWechatSecrets(): WechatSecrets {
  const fileSecret = readLocalSecretFile();

  return {
    appId: process.env.WECHAT_APP_ID ?? fileSecret.AppID ?? "",
    appSecret: process.env.WECHAT_APP_SECRET ?? fileSecret.AppSecret ?? "",
    qrHmacSecret: process.env.QR_HMAC_SECRET ?? DEFAULT_WECHAT_QR_HMAC_SECRET,
  };
}
