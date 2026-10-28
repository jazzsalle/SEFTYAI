import { timingSafeEqual } from "node:crypto";
import { upsertAccount } from "@/lib/server/auth";
import { audit } from "@/lib/server/db";
import { fail, json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/seed {accounts: {id: password}} — 계정 사전 발급·비밀번호 재설정 (운영 스크립트 전용)
 * 헤더 x-seed-secret = env SEED_SECRET 이어야 한다. SEED_SECRET 이 없으면 비활성.
 */
export async function POST(req: Request) {
  const secret = process.env.SEED_SECRET;
  const got = req.headers.get("x-seed-secret") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return fail(404, "Not Found");
  const b = (await req.json().catch(() => null)) as { accounts?: Record<string, string>; mustChange?: boolean } | null;
  if (!b?.accounts) return fail(400, "accounts 가 필요합니다.");
  const done: string[] = [];
  try {
    for (const [id, pw] of Object.entries(b.accounts)) {
      await upsertAccount(id, pw, b.mustChange !== false); // 기본 = 첫 로그인 때 변경 강제
      done.push(id);
    }
  } catch (e) {
    return fail(400, (e as Error).message, { done });
  }
  await audit(null, null, "account.seed", { ids: done });
  return json({ ok: true, done });
}
