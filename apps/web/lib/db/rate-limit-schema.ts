import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Generic windowed rate-limit attempts. `scope` names the guarded action
 * (e.g. "faucet:address"), `subject` is the throttled key (owner id, agent
 * address, client IP). Rows are pruned in-transaction by the consumer; no FK
 * because subjects are not always database entities.
 */
export const rateLimitAttempts = pgTable(
  "rate_limit_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scope: text("scope").notNull(),
    subject: text("subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("rate_limit_attempts_scope_subject_created_idx").on(
      table.scope,
      table.subject,
      table.createdAt.desc(),
    ),
  ],
);
