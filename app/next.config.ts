import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * 판 번호 — 빌드마다 하나(개발서버 vite.config __BUILD_ID__ · f668628). 화면 코드와 서버(/api/version)에 같은 값이 박힌다.
 * Vercel 은 배포마다 VERCEL_DEPLOYMENT_ID 가 다르다(같은 커밋을 다시 올려도). 그 밖의 빌드는 커밋 → 빌드 시각. 개발 서버(next dev)는 「dev」라 비교하지 않는다(lib/appUpdate)
 */
const buildId = (phase: string) =>
  phase === PHASE_DEVELOPMENT_SERVER ? "dev" : process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`;

export default function config(phase: string): NextConfig {
  return {
    devIndicators: false,
    // 로컬 개발 DB(PGlite, wasm) 는 번들하지 않는다 — lib/server/dbLocal.ts
    serverExternalPackages: ["@electric-sql/pglite"],
    env: { NEXT_PUBLIC_BUILD_ID: buildId(phase) },
  };
}
