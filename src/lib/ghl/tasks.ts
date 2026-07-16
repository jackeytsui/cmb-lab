// src/lib/ghl/tasks.ts
// GHL contact task creation -- used by the Lab Assistant handover flow.
// Goes through the rate-limited per-location GHL client like all other calls.

import { getLocationForContact } from "@/lib/ghl/contacts";
import { getGhlClientForLocation } from "@/lib/ghl/client";
import { logSyncEvent } from "@/lib/ghl/sync-logger";

export interface CreateContactTaskParams {
  title: string;
  body: string;
  dueDate: Date;
}

interface GhlTaskResponse {
  task?: { id: string };
}

/**
 * Create a task on a GHL contact.
 * Returns the GHL task id. Throws if the contact's location is not
 * configured or the API call fails (callers decide the fallback UX).
 */
export async function createContactTask(
  ghlContactId: string,
  params: CreateContactTaskParams
): Promise<string | null> {
  const ghlLocationId = await getLocationForContact(ghlContactId);
  const client = ghlLocationId
    ? await getGhlClientForLocation(ghlLocationId)
    : null;

  if (!client) {
    throw new Error(
      `No active GHL location configured for contact ${ghlContactId}`
    );
  }

  try {
    const response = await client.post<GhlTaskResponse>(
      `/contacts/${ghlContactId}/tasks`,
      {
        title: params.title,
        body: params.body,
        dueDate: params.dueDate.toISOString(),
        completed: false,
      }
    );

    const taskId = response.data.task?.id ?? null;

    await logSyncEvent({
      eventType: "task.created",
      direction: "outbound",
      entityType: "task",
      entityId: taskId ?? undefined,
      ghlContactId,
      payload: { title: params.title, dueDate: params.dueDate.toISOString() },
    });

    return taskId;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await logSyncEvent({
      eventType: "task.created",
      direction: "outbound",
      entityType: "task",
      ghlContactId,
      payload: { title: params.title, error: errorMessage },
      status: "failed",
    }).catch(() => {
      console.error("[GHL Tasks] Failed to log task creation failure");
    });

    throw error;
  }
}
