import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");
  use(request: Request, response: Response, next: NextFunction) {
    const started = performance.now();
    response.on("finish", () =>
      this.logger.log(
        JSON.stringify({
          requestId: request.requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - started),
        }),
      ),
    );
    next();
  }
}
