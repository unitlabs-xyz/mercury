import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Only the two tables identity needs. Lots, positions, orders and activity
 * arrive with subsystem 2 — see docs/05-data-model.md for the whole shape.
 *
 * We store no email. Privy holds it, and docs/05 says we do not copy it.
 */
export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Privy's DID for this user, e.g. "did:privy:clxxxx". Our join key to them. */
    privyUserId: text("privy_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    displayCurrency: text("display_currency").notNull().default("USD"),
  },
  (t) => [uniqueIndex("user_privy_user_id_idx").on(t.privyUserId)],
);

export const wallets = pgTable(
  "wallet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    kind: text("kind", { enum: ["privy_embedded", "external"] }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("wallet_address_idx").on(t.address)],
);

export type User = typeof users.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
