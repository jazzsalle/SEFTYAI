import "server-only";
import { ACCOUNTS, type Account } from "../config";

/**
 * 요청한 계정 — 헤더 x-sa-account 의 계정 ID로 찾음
 * 시연판은 별도 인증 서버가 없어 화면이 보낸 계정 ID를 믿는다. 실서비스는 로그인 세션(서명된 쿠키)으로 바꾼다.
 */
export function whoami(req: Request): Account | null {
  const id = req.headers.get("x-sa-account");
  return ACCOUNTS.find((a) => a.id === id) ?? null;
}

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
export const fail = (status: number, error: string, extra?: Record<string, unknown>) => json({ error, ...extra }, status);
