import "server-only";
import type { Account } from "../config";
import type { T3qHealth } from "../adminTypes";
import { t3qConfigured } from "../t3q/client";
import { hasDb } from "./db";
import { fail, whoami } from "./who";

/**
 * 운영관리 API 공통 — 운영자 확인 · T3Q 연결 상태
 * 세션이 없으면 401(화면이 세션 만료 안내를 띄움), 운영자가 아니면 403.
 */
export async function requireOperator(req: Request): Promise<{ who: Account; res?: undefined } | { who?: undefined; res: Response }> {
  if (!hasDb()) return { res: fail(503, "서버 DB가 연결되지 않았습니다.") };
  const who = await whoami(req);
  if (!who) return { res: fail(401, "로그인이 필요합니다.") };
  if (who.role !== "운영자") return { res: fail(403, "운영관리는 시스템 운영자만 이용할 수 있습니다.") };
  if (who.mustChangePw) return { res: fail(403, "초기 비밀번호를 먼저 바꿔 주세요.") };
  return { who };
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** Neon 질의 결과 행에 타입만 붙인다 (값은 그대로) */
export const rows = async <T>(p: PromiseLike<unknown>): Promise<T[]> => (await p) as T[];

let cache: { at: number; v: T3qHealth } | null = null;

/** T3Q /health (30초 캐시) — /api/t3q/health 와 같은 기준 */
export async function t3qHealth(): Promise<T3qHealth> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  const mode = process.env.T3Q_MODE === "replay" ? "replay" : "live";
  const base = process.env.T3Q_BASE_URL?.replace(/\/$/, "").replace(/\/v1$/, "");
  let ok = false, version: string | null = null, detail: string | null = null;
  if (mode === "replay") {
    ok = true;
    detail = "녹화 재생(replay) 모드";
  } else if (!base || !t3qConfigured()) {
    detail = "T3Q 연결 설정(T3Q_BASE_URL·T3Q_CLIENT_TOKEN)이 없습니다";
  } else {
    try {
      const r = await fetch(base + "/health", { signal: AbortSignal.timeout(5000), cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { status?: string; version?: string } | null;
      ok = r.ok && j?.status === "ok";
      version = j?.version ?? null;
      if (!ok) detail = `HTTP ${r.status}${j?.status ? ` · status ${j.status}` : ""}`;
    } catch (e) {
      detail = (e as Error).name === "TimeoutError" ? "응답 시간 초과(5초)" : "연결 실패";
    }
  }
  const v: T3qHealth = { ok, mode, configured: t3qConfigured(), version, checkedAt: new Date().toISOString(), detail };
  cache = { at: Date.now(), v };
  return v;
}
