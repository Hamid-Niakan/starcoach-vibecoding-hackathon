import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

@Injectable()
export class SessionThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: Record<string, unknown>) {
    const headers = request.headers as
      | Record<string, string | undefined>
      | undefined;
    const authorization = headers?.authorization;
    const ip = typeof request.ip === "string" ? request.ip : "unknown";
    if (!authorization?.startsWith("Bearer ")) return `ip:${ip}`;
    const tokenHash = createHash("sha256")
      .update(authorization.slice(7))
      .digest("hex");
    return `session:${tokenHash}:ip:${ip}`;
  }
}
