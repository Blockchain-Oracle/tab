import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { environment } from "./identity-schema";
import { payments } from "./payment-schema";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id").notNull(),
    env: environment("env").notNull(),
    orderNumber: text("order_number").notNull(),
    paymentRef: text("payment_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.paymentRef, table.merchantId, table.env],
      foreignColumns: [payments.refCode, payments.merchantId, payments.env],
      name: "orders_payment_merchant_env_fk",
    }),
    uniqueIndex("orders_payment_ref_unique").on(table.paymentRef),
    uniqueIndex("orders_merchant_env_number_unique").on(
      table.merchantId,
      table.env,
      table.orderNumber,
    ),
    check("orders_order_number_check", sql`${table.orderNumber} ~ '[^[:space:]]'`),
    check("orders_payment_ref_check", sql`${table.paymentRef} ~ '^TAB-[A-Z0-9]+$'`),
  ],
);
