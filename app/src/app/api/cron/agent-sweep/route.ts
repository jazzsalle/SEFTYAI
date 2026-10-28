import { timingSafeEqual } from "node:crypto";
import { hasDb } from "@/lib/server/db";
import { sweepAny } from "@/lib/server/jobs";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/cron/agent-sweep — 방치된 질의 작업 거두기(Vercel Cron 용, R1). Authorization: Bearer <CRON_SECRET>
 * 크론 설정(vercel.json)은 배포 승인 때 함께 — 요금제에 따라 주기 제한이 있다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return fail(404, "Not Found");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const n = await sweepAny(10);
  return json({ ok: true, advanced: n });
}
