import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const doctorsTable = pgTable("doctors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Doctor = typeof doctorsTable.$inferSelect;
