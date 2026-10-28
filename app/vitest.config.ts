import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "@data": fileURLToPath(new URL("./data", import.meta.url)), "server-only": fileURLToPath(new URL("./harness/stubs/server-only.ts", import.meta.url)) } },
  test: { include: ["harness/**/*.test.ts", "harness/**/*.test.tsx", "src/**/*.test.ts"], environment: "node" },
});
