import { describe, expect, it, vi } from "vitest";

import type { NotificationResultView } from "../../../../lib/leash/notification-view";
import {
  loadAndCommitNotificationFilters,
  markNotificationsRead,
  type NotificationFilters,
} from "./notification-center-actions";

const agentId = "11111111-1111-4111-8111-111111111111";
const notificationId = "33333333-3333-4333-8333-333333333333";
const filters: NotificationFilters = { read: "all", resolution: "all", tier: "all" };
const refreshedResult: NotificationResultView = {
  nextCursor: null,
  notifications: [],
  unreadCount: 0,
};

function jsonResponse(body: unknown, ok = true) {
  return {
    json: vi.fn().mockResolvedValue(body),
    ok,
  };
}

describe("notification-center actions", () => {
  it.each([
    ["one notification", notificationId, "read_one"],
    ["all notifications", undefined, "read_all"],
  ])("refreshes the server-backed shell count after marking %s read", async (_, id, action) => {
    const events: string[] = [];
    const request = vi.fn(async (_input: string, init?: RequestInit) => {
      events.push(init?.method ?? "GET");
      return init?.method === "PATCH" ? jsonResponse({ ok: true }) : jsonResponse(refreshedResult);
    });

    const result = await markNotificationsRead({
      agentId,
      filters,
      notificationId: id,
      onServerStateChanged: () => events.push("shell-refresh"),
      request,
    });

    expect(result).toEqual(refreshedResult);
    expect(events).toEqual(["PATCH", "shell-refresh", "GET"]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual(
      id ? { action, agentId, notificationId: id } : { action, agentId },
    );
  });

  it("does not commit selected filters when their notification request fails", async () => {
    const commit = vi.fn();
    const next: NotificationFilters = { read: "unread", resolution: "active", tier: "3" };

    await expect(
      loadAndCommitNotificationFilters({
        commit,
        filters: next,
        load: vi.fn().mockRejectedValue(new Error("request failed")),
      }),
    ).rejects.toThrow("request failed");

    expect(commit).not.toHaveBeenCalled();
  });

  it("commits selected filters and matching rows together after a successful request", async () => {
    const commit = vi.fn();
    const next: NotificationFilters = { read: "read", resolution: "resolved", tier: "2" };

    await loadAndCommitNotificationFilters({
      commit,
      filters: next,
      load: vi.fn().mockResolvedValue(refreshedResult),
    });

    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(next, refreshedResult);
  });
});
