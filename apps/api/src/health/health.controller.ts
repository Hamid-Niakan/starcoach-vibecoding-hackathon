import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DuckDbService } from "../analytics/duckdb.service";
import { PersistenceService } from "../persistence/persistence.service";

@Controller("api/health")
export class HealthController {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly duckdb: DuckDbService,
  ) {}
  @Get() health() {
    return { status: "ok" as const };
  }
  @Get("live") live() {
    return { status: "ok" as const };
  }
  @Get("ready") ready() {
    if (!this.persistence.ready || !this.duckdb.ready)
      throw new ServiceUnavailableException({
        status: "not-ready",
        postgres: this.persistence.ready,
        duckdb: this.duckdb.ready,
      });
    return { status: "ready" as const, postgres: true, duckdb: true };
  }
}
