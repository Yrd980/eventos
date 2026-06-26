import { DomainError } from "../http/envelope";
import type { EventOsRepository } from "./repository";

export async function getVisibleActivity(repo: EventOsRepository, activityId: string) {
  const activity = await repo.getActivity(activityId);
  if (!activity) {
    throw new DomainError("ACTIVITY_NOT_FOUND", "Activity was not found", { status: 404 });
  }

  if (activity.status === "draft") {
    throw new DomainError("ACTIVITY_NOT_PUBLISHED", "Activity is not published", { status: 404 });
  }

  return activity;
}

export async function getMutableParticipantActivity(repo: EventOsRepository, activityId: string) {
  const activity = await getVisibleActivity(repo, activityId);
  if (activity.status === "archived") {
    throw new DomainError("ACTIVITY_ARCHIVED", "Archived Activity is read-only", { status: 400 });
  }

  return activity;
}

export async function getPublishedSnapshot(repo: EventOsRepository, activityId: string) {
  const publication = await repo.getCurrentPublication(activityId);
  if (!publication) {
    throw new DomainError("ACTIVITY_NOT_PUBLISHED", "Activity has no published snapshot", { status: 404 });
  }

  return publication;
}
