import type { User } from "@eventos/contracts";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { ApiEnv } from "../env";
import { DomainError } from "../http/envelope";

export type AuthingPrincipal = {
  authing_user_id: string;
  display_name?: string;
  avatar_url?: string;
  org_ids: string[];
  raw_claims: JWTPayload;
};

export type RequestActor = {
  principal: AuthingPrincipal;
  user: User;
};

export type AuthingVerifier = {
  verifyAuthorizationHeader(header: string | undefined): Promise<AuthingPrincipal>;
};

function stringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    return [value];
  }

  return [];
}

function readOrgIds(payload: JWTPayload) {
  const claims = payload as JWTPayload & {
    org_id?: unknown;
    org_ids?: unknown;
    organization_id?: unknown;
    organization_ids?: unknown;
  };

  return [
    ...stringArray(claims.org_id),
    ...stringArray(claims.org_ids),
    ...stringArray(claims.organization_id),
    ...stringArray(claims.organization_ids),
  ];
}

function normalizeDomain(domain: string) {
  return domain.startsWith("https://") || domain.startsWith("http://") ? domain : `https://${domain}`;
}

export function createAuthingVerifier(env: ApiEnv): AuthingVerifier {
  if (env.nodeEnv === "development" && env.devAuth.enabled) {
    return {
      async verifyAuthorizationHeader(header) {
        if (!header?.startsWith("Bearer ")) {
          throw new DomainError("AUTHENTICATION_REQUIRED", "Authing bearer token is required", { status: 401 });
        }

        const token = header.slice("Bearer ".length);
        if (token !== env.devAuth.token) {
          throw new DomainError("AUTHENTICATION_REQUIRED", "Authing bearer token is invalid for local development", { status: 401 });
        }

        return {
          authing_user_id: env.devAuth.authingUserId,
          display_name: "Development Operator",
          org_ids: [env.devAuth.authingOrgId],
          raw_claims: {
            sub: env.devAuth.authingUserId,
            org_id: env.devAuth.authingOrgId,
            eventos_dev_auth: true,
          },
        };
      },
    };
  }

  if (!env.authing.domain) {
    return {
      async verifyAuthorizationHeader(header) {
        if (!header?.startsWith("Bearer ")) {
          throw new DomainError("AUTHENTICATION_REQUIRED", "Authing bearer token is required", { status: 401 });
        }

        throw new DomainError("AUTHENTICATION_REQUIRED", "AUTHING_DOMAIN is not configured", { status: 401 });
      },
    };
  }

  const issuer = normalizeDomain(env.authing.domain);
  const jwks = createRemoteJWKSet(new URL(`${issuer}/oidc/.well-known/jwks.json`));

  return {
    async verifyAuthorizationHeader(header) {
      if (!header?.startsWith("Bearer ")) {
        throw new DomainError("AUTHENTICATION_REQUIRED", "Authing bearer token is required", { status: 401 });
      }

      const token = header.slice("Bearer ".length);
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: env.authing.audience ?? env.authing.appId,
      });

      if (!payload.sub) {
        throw new DomainError("AUTHENTICATION_REQUIRED", "Authing token subject is missing", { status: 401 });
      }

      return {
        authing_user_id: payload.sub,
        display_name:
          typeof payload.name === "string"
            ? payload.name
            : typeof payload.nickname === "string"
              ? payload.nickname
              : undefined,
        avatar_url: typeof payload.picture === "string" ? payload.picture : undefined,
        org_ids: readOrgIds(payload),
        raw_claims: payload,
      };
    },
  };
}
