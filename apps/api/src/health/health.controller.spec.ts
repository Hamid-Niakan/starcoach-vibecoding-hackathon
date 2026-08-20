import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { PersistenceService } from "../persistence/persistence.service";
import { DuckDbService } from "../analytics/duckdb.service";

describe("HealthController", () => {
  it("keeps liveness independent of storage", async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PersistenceService, useValue: { ready: false } },
        { provide: DuckDbService, useValue: { ready: false } },
      ],
    }).compile();
    expect(module.get(HealthController).health()).toEqual({ status: "ok" });
  });
});
