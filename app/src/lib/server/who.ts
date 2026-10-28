import "server-only";
import type { Account } from "../config";
import { sessionAccount } from "./auth";
import { hasDb } from "./db";

/** 요청한 계정 — 로그인 세션(서명 쿠키 sa_sid → sa_sessions)으로 찾는다 (R7). 화면이 보내는 헤더는 믿지 않는다 */
export async function whoami(req: Request): Promise<Account | null> {
  if (!hasDb()) return null;
  return sessionAccount(req);
}

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
export const fail = (status: number, error: string, extra?: Record<string, unknown>) => json({ error, ...extra }, status);
