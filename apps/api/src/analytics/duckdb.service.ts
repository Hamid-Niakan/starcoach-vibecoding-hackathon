import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

@Injectable()
export class DuckDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DuckDbService.name);
  private connection?: DuckDBConnection;
  ready = false;

  async onModuleInit() {
    try {
      const instance = await DuckDBInstance.create(
        process.env.DUCKDB_PATH ?? ":memory:",
      );
      this.connection = await instance.connect();
      await this.connection.run("select 1 as healthy");
      this.ready = true;
    } catch (error) {
      this.logger.error(
        `DuckDB initialization failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  onModuleDestroy() {
    this.connection?.closeSync();
  }
  async smokeQuery() {
    if (!this.connection) return false;
    await this.connection.run("select 42 as answer");
    return true;
  }
}
