import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dateResponses = sqliteTable("date_responses", {
  invitationId: text("invitation_id").notNull(),
  userId: text("user_id").notNull(),
  respondentEmail: text("respondent_email").notNull(),
  cuisinesJson: text("cuisines_json").notNull(),
  wishes: text("wishes").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.invitationId, table.userId] })]);
