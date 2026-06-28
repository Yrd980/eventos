import type { AuthingPrincipal, AuthingVerifier, RequestActor } from "../auth/authing";
import { DomainError } from "../http/envelope";
import { createId } from "./ids";
import type { EventOsRepository } from "./repository";

export async function projectActor(repo: EventOsRepository, principal: AuthingPrincipal): Promise<RequestActor> {
  const existingUser = await repo.getUserByAuthingUserId(principal.authing_user_id);
  if (existingUser) {
    return { principal, user: existingUser };
  }

  const user = await repo.upsertUser({
    id: createId("usr"),
    authingUserId: principal.authing_user_id,
    displayName: principal.display_name,
    avatarUrl: principal.avatar_url,
  });

  return { principal, user };
}

export async function requireActor(input: {
  repo: EventOsRepository;
  verifier: AuthingVerifier;
  authorizationHeader: string | undefined;
}) {
  const principal = await input.verifier.verifyAuthorizationHeader(input.authorizationHeader);
  return projectActor(input.repo, principal);
}

export async function resolveTenantFromActor(repo: EventOsRepository, actor: RequestActor) {
  for (const orgId of actor.principal.org_ids) {
    const tenant = await repo.getTenantByAuthingOrgId(orgId);
    if (tenant) {
      return tenant;
    }
  }

  throw new DomainError("PERMISSION_DENIED", "Authing identity is not mapped to an Event OS tenant", { status: 403 });
}
