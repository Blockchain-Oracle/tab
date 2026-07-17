import type { NotificationResultView } from "../../../../lib/leash/notification-view";

export type NotificationFilters = {
  read: "all" | "read" | "unread";
  resolution: "active" | "all" | "resolved";
  tier: "2" | "3" | "all";
};

type NotificationRequest = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "json" | "ok">>;

type NotificationResponse = NotificationResultView & {
  error?: { message?: string };
};

export async function loadNotificationResult({
  agentId,
  cursor,
  filters,
  request = fetch,
}: {
  agentId: string;
  cursor?: string;
  filters: NotificationFilters;
  request?: NotificationRequest;
}) {
  const query = new URLSearchParams({
    agentId,
    read: filters.read,
    resolution: filters.resolution,
  });
  if (filters.tier !== "all") query.set("tier", filters.tier);
  if (cursor) query.set("cursor", cursor);

  const response = await request(`/api/leash/notifications?${query}`);
  const body = (await response.json()) as NotificationResponse;
  if (!response.ok) {
    throw new Error(body.error?.message ?? "Notifications could not be loaded.");
  }
  return body;
}

export async function markNotificationsRead({
  agentId,
  filters,
  notificationId,
  onServerStateChanged,
  request = fetch,
}: {
  agentId: string;
  filters: NotificationFilters;
  notificationId: string | undefined;
  onServerStateChanged: () => void;
  request?: NotificationRequest;
}) {
  const response = await request("/api/leash/notifications", {
    body: JSON.stringify(
      notificationId
        ? { action: "read_one", agentId, notificationId }
        : { action: "read_all", agentId },
    ),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  if (!response.ok) {
    const body = (await response.json()) as NotificationResponse;
    throw new Error(body.error?.message ?? "The notification state was not saved.");
  }

  onServerStateChanged();
  return loadNotificationResult({ agentId, filters, request });
}

export async function loadAndCommitNotificationFilters({
  commit,
  filters,
  load,
}: {
  commit: (filters: NotificationFilters, result: NotificationResultView) => void;
  filters: NotificationFilters;
  load: (filters: NotificationFilters) => Promise<NotificationResultView>;
}) {
  const result = await load(filters);
  commit(filters, result);
}
