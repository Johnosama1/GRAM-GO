import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const uploadsTable = pgTable("uploads", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  data: text("data").notNull(),
  size: integer("size").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUploadSchema = createInsertSchema(uploadsTable).omit({ id: true, createdAt: true });
export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type Upload = typeof uploadsTable.$inferSelect;
