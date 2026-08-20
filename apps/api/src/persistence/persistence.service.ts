import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ChatMessage, Conversation, Product } from "@hackathon/contracts";
import { and, asc, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

@Injectable()
export class PersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PersistenceService.name);
  private client?: Sql;
  private db?: PostgresJsDatabase<typeof schema>;
  ready = false;

  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      this.logger.warn(
        "DATABASE_URL is absent; persistent chat is unavailable",
      );
      return;
    }
    try {
      this.client = postgres(process.env.DATABASE_URL, {
        max: 5,
        idle_timeout: 20,
        connect_timeout: 5,
      });
      this.db = drizzle(this.client, { schema });
      await migrate(this.db, {
        migrationsFolder: resolve(
          process.env.DRIZZLE_MIGRATIONS_DIR ?? "drizzle",
        ),
      });
      await this.client`select 1`;
      this.ready = true;
    } catch (error) {
      this.logger.error(
        `PostgreSQL initialization failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.client?.end({ timeout: 3 });
  }

  async createConversation(product: Product) {
    const db = this.requireDb();
    const id = randomUUID();
    const accessToken = randomBytes(32).toString("base64url");
    const [created] = await db
      .insert(schema.conversations)
      .values({ id, product, accessTokenHash: this.hash(accessToken) })
      .returning();
    if (!created)
      throw new ServiceUnavailableException("Could not create conversation");
    return {
      conversationId: created.id,
      accessToken,
      product: created.product,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async getConversation(
    product: Product,
    id: string,
    accessToken: string,
  ): Promise<Conversation | null> {
    const db = this.requireDb();
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, id),
          eq(schema.conversations.product, product),
          eq(schema.conversations.accessTokenHash, this.hash(accessToken)),
        ),
      )
      .limit(1);
    if (!conversation) return null;
    const stored = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, id))
      .orderBy(asc(schema.messages.createdAt));
    return {
      id: conversation.id,
      product: conversation.product,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages: stored.map(
        (message): ChatMessage => ({
          id: message.id,
          role: message.role,
          content: message.content,
          status: message.status,
          createdAt: message.createdAt.toISOString(),
        }),
      ),
    };
  }

  async addMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    requestId: string,
    metadata: Record<string, unknown> = {},
  ) {
    const db = this.requireDb();
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(schema.messages).values({
        id,
        conversationId,
        role,
        content,
        status: "completed",
        requestId,
        metadata,
      });
      await tx
        .update(schema.conversations)
        .set({ updatedAt: new Date() })
        .where(eq(schema.conversations.id, conversationId));
    });
    return id;
  }

  private requireDb() {
    if (!this.db || !this.ready)
      throw new ServiceUnavailableException("PostgreSQL is not ready");
    return this.db;
  }
  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
}
