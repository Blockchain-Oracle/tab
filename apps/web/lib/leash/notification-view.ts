import type { listOwnerNotifications } from "./notification-store";

type NotificationResult = Awaited<ReturnType<typeof listOwnerNotifications>>;
type NotificationItem = NotificationResult["notifications"][number];

export type NotificationItemView = Omit<NotificationItem, "createdAt" | "readAt" | "resolvedAt"> & {
  createdAt: string;
  readAt: string | null;
  resolvedAt: string | null;
};

export type NotificationResultView = {
  nextCursor: string | null;
  notifications: NotificationItemView[];
  unreadCount: number;
};

export function notificationResultView(result: NotificationResult): NotificationResultView {
  return {
    nextCursor: result.nextCursor,
    notifications: result.notifications.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      readAt: item.readAt?.toISOString() ?? null,
      resolvedAt: item.resolvedAt?.toISOString() ?? null,
    })),
    unreadCount: result.unreadCount,
  };
}
