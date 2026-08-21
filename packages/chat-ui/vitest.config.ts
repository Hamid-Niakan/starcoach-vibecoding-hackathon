import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@hackathon/api-client": fileURLToPath(
        new URL("../api-client/src/index.ts", import.meta.url),
      ),
      "@hackathon/contracts": fileURLToPath(
        new URL("../contracts/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
