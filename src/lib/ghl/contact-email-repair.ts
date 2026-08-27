export type GhlDuplicateContact = {
  contactId: string;
  contactName: string | null;
};

type GhlDuplicateErrorBody = {
  message?: unknown;
  meta?: {
    contactId?: unknown;
    contactName?: unknown;
    matchingField?: unknown;
  };
};

/**
 * GHL rejects an email update when another contact in the same location
 * already owns that email. Extract only that exact, email-based conflict so
 * callers can safely relink instead of treating unrelated 400s as duplicates.
 */
export function extractGhlDuplicateEmailContact(
  errorMessage: string,
): GhlDuplicateContact | null {
  const jsonStart = errorMessage.indexOf("{");
  if (jsonStart < 0) return null;

  let body: GhlDuplicateErrorBody;
  try {
    body = JSON.parse(errorMessage.slice(jsonStart)) as GhlDuplicateErrorBody;
  } catch {
    return null;
  }

  if (
    typeof body.message !== "string" ||
    !/does not allow duplicated contacts/i.test(body.message) ||
    body.meta?.matchingField !== "email" ||
    typeof body.meta.contactId !== "string" ||
    body.meta.contactId.trim().length === 0
  ) {
    return null;
  }

  return {
    contactId: body.meta.contactId,
    contactName:
      typeof body.meta.contactName === "string"
        ? body.meta.contactName
        : null,
  };
}

export type GhlEmailSyncEvent = {
  entityId: string | null;
  eventType: string;
  status: string;
  payload: unknown;
};

/**
 * Events must be newest-first. Only an unresolved latest failure for a
 * user/location remains a candidate; a later update or relink closes it.
 */
export function findPendingDuplicateEmailUsers(
  events: GhlEmailSyncEvent[],
): string[] {
  const latestLocationEvents = new Set<string>();
  const candidateUserIds = new Set<string>();

  for (const event of events) {
    if (!event.entityId) continue;
    const payload = event.payload as {
      error?: unknown;
      locationId?: unknown;
    } | null;
    const locationId =
      payload && typeof payload.locationId === "string"
        ? payload.locationId
        : "unknown";
    const locationKey = `${event.entityId}:${locationId}`;
    if (latestLocationEvents.has(locationKey)) continue;
    latestLocationEvents.add(locationKey);

    if (
      event.eventType === "contact.email_updated" &&
      event.status === "failed" &&
      payload &&
      typeof payload.error === "string" &&
      extractGhlDuplicateEmailContact(payload.error)
    ) {
      candidateUserIds.add(event.entityId);
    }
  }

  return [...candidateUserIds];
}
