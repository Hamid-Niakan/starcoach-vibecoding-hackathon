import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { AnalyticsModule } from "./analytics/analytics.module";
import { ChatModule } from "./chat/chat.module";
import { HealthModule } from "./health/health.module";
import { LiaraModule } from "./liara/liara.module";
import { ObservabilityModule } from "./observability/observability.module";
import { RequestLogMiddleware } from "./observability/request-log.middleware";
import { SessionThrottlerGuard } from "./observability/session-throttler.guard";
import { PersistenceModule } from "./persistence/persistence.module";
import { ZarinpalModule } from "./zarinpal/zarinpal.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.CHAT_RATE_WINDOW_MS ?? 60_000),
        limit: Number(process.env.CHAT_RATE_LIMIT ?? 30),
      },
    ]),
    PersistenceModule,
    AnalyticsModule,
    ChatModule,
    LiaraModule,
    ZarinpalModule,
    HealthModule,
    ObservabilityModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: SessionThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLogMiddleware).forRoutes("*");
  }
}
