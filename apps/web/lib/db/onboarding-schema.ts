import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { quickstartSource, users } from "./identity-schema";

/**
 * Owner-scoped onboarding progress for the agent-owner wizard (provision →
 * cap → test funds → connect → first paid call). Mirrors the merchant-scoped
 * `quickstart_progress` semantics: `auto` steps complete only via real
 * integration events; `manual` steps may be acknowledged by the owner.
 */
export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }).notNull(),
    source: quickstartSource("source").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.stepKey] })],
);
