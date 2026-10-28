import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // 로컬 개발 DB(PGlite, wasm) 는 번들하지 않는다 — lib/server/dbLocal.ts
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
