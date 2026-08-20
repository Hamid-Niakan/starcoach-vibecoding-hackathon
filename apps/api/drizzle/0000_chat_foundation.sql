CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY,
  "product" varchar(32) NOT NULL,
  "access_token_hash" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_product_token_idx" ON "conversations" ("product", "access_token_hash");

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" varchar(16) NOT NULL,
  "content" text NOT NULL,
  "status" varchar(16) NOT NULL,
  "request_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx" ON "messages" ("conversation_id", "created_at");
