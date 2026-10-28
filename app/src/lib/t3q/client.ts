import "server-only";
import { randomBytes } from "node:crypto";

/**
 * T3Q 시범서비스 API 호출 (서버 전용) — 토큰은 서버 env 에만 (R0·§8)
 * - X-Request-Id 는 매 호출 새 값(재사용하면 T3Q 가 이전 ASYNC 작업을 덮어씀)
 * - 응답 봉투는 손대지 않고 그대로 돌려준다 — 화면·저장 모두 원문 기준 (R0)
 * - 401·422 는 FastAPI 기본꼴({detail})이라 봉투가 아님 → envelope=false 로 구분
 */
export interface T3qResult<T = unknown> {
  http: number;
  ms: number;
  requestId: string;
  envelope: boolean;
  body: T | null;
  error?: string;
}

export const t3qConfigured = () => !!(process.env.T3Q_BASE_URL && process.env.T3Q_CLIENT_TOKEN);
export const newRequestId = () => randomBytes(16).toString("hex");

export async function t3q<T = unknown>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, opt: { timeoutMs?: number; requestId?: string } = {}): Promise<T3qResult<T>> {
  if (process.env.T3Q_MODE === "replay") {
    if (process.env.VERCEL_ENV === "production") throw new Error("T3Q_MODE=replay 는 운영 배포에서 쓸 수 없다");
    const { replay } = await import("./replay");
    return replay<T>(method, path, body, opt.requestId);
  }
  const base = process.env.T3Q_BASE_URL?.replace(/\/$/, "");
  const token = process.env.T3Q_CLIENT_TOKEN;
  const requestId = opt.requestId ?? newRequestId();
  if (!base || !token) return { http: 0, ms: 0, requestId, envelope: false, body: null, error: "T3Q 연결 설정이 없습니다" };
  const t0 = Date.now();
  try {
    const r = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8", "X-Request-Id": requestId },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(opt.timeoutMs ?? 20000),
      cache: "no-store",
    });
    const text = await r.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 본문이 JSON 이 아님 */
    }
    const envelope = !!json && typeof json === "object" && "schema_version" in (json as object);
    return { http: r.status, ms: Date.now() - t0, requestId, envelope, body: json as T, error: envelope ? undefined : `T3Q 응답 오류 (${r.status})` };
  } catch (e) {
    const timeout = (e as Error).name === "TimeoutError";
    return { http: 0, ms: Date.now() - t0, requestId, envelope: false, body: null, error: timeout ? "T3Q 응답 시간 초과" : "T3Q 연결 실패" };
  }
}
