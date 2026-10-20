import { hasDb } from "@/lib/server/db";
import { checkScope, checkSet, checksGet, checksReset } from "@/lib/server/kvStore";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** GET /api/checks — 소속 기관의 대응절차 체크 (기관 공용, 운영자는 개인) {key: {by, at}} */
export async function GET(req: Request) {
  const who = whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  return json(await checksGet(checkScope(who)));
}

/** POST /api/checks — {key, done} */
export async function POST(req: Request) {
  const who = whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const body = (await req.json().catch(() => null)) as { key?: string; done?: boolean } | null;
  if (!body?.key || body.key.length > 300 || typeof body.done !== "boolean") return fail(400, "요청 형식이 맞지 않습니다.");
  await checkSet(checkScope(who), body.key, body.done, who);
  return json(await checksGet(checkScope(who)));
}

/** DELETE /api/checks — 새 상황으로 시작 (기관 체크 모두 비움, prefix 를 주면 그 매뉴얼만) */
export async function DELETE(req: Request) {
  const who = whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const body = (await req.json().catch(() => ({}))) as { prefix?: string };
  const n = await checksReset(checkScope(who), who, typeof body.prefix === "string" ? body.prefix.slice(0, 200) : undefined);
  return json({ cleared: n });
}
