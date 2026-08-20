import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { Product } from "@hackathon/contracts";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey(),
    product: varchar("product", { length: 32 }).$type<Product>().notNull(),
    accessTokenHash: varchar("access_token_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("conversations_product_token_idx").on(
      table.product,
      table.accessTokenHash,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 16 })
      .$type<"user" | "assistant">()
      .notNull(),
    content: text("content").notNull(),
    status: varchar("status", { length: 16 })
      .$type<"streaming" | "completed" | "failed">()
      .notNull(),
    requestId: uuid("request_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);
