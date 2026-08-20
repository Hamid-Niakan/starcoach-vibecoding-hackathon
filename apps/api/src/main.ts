import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { json, type NextFunction, type Request, type Response } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: "16kb" }));
  app.enableShutdownHooks();
  app.enableCors({
    origin: (
      process.env.CORS_ORIGINS ?? "http://localhost:3001,http://localhost:3002"
    ).split(","),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId =
      typeof request.headers["x-request-id"] === "string"
        ? request.headers["x-request-id"]
        : randomUUID();
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    next();
  });
  await app.listen(Number(process.env.API_PORT ?? 3000), "0.0.0.0");
}

void bootstrap();
