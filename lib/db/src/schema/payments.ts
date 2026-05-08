import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentsTable = pgTable("payments", {
  id:        uuid("id").defaultRandom().primaryKey(),
  user_id:   uuid("user_id").notNull(),
  reference: text("reference").unique().notNull(),
  plan:      text("plan").notNull(),
  amount:    integer("amount").notNull(),
  status:    text("status").notNull().default("success"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
