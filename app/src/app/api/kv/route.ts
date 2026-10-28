import { hasDb } from "@/lib/server/db";
import { KvConflict, kvGet, kvPut, scopeAccess } from "@/lib/server/kvStore";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** GET /api/kv?scope= — 범위의 모든 값 (acct:본인 / org:소속 기관 / verify:운영자) */
export async function GET(req: Request) {
  const who = await whoami(req);
  const scope = new URL(req.url).searchParams.get("scope") ?? "";
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!scopeAccess(who, scope).read) return fail(403, "볼 수 있는 권한이 없습니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  return json(await kvGet(scope));
}

/** PUT /api/kv — {scope, key, value, rev?} (value null = 지움, rev 를 주면 판 확인) */
export async function PUT(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  const body = (await req.json().catch(() => null)) as { scope?: string; key?: string; value?: unknown; rev?: number } | null;
  if (!body?.scope || !body.key || body.key.length > 200 || body.value === undefined) return fail(400, "요청 형식이 맞지 않습니다.");
  if (!scopeAccess(who, body.scope).write) return fail(403, "고칠 수 있는 권한이 없습니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  try {
    return json({ item: await kvPut(body.scope, body.key, body.value, who, typeof body.rev === "number" ? body.rev : undefined) });
  } catch (e) {
    if (e instanceof KvConflict) return fail(409, e.message, { latest: e.latest });
    return fail(400, (e as Error).message || "저장하지 못했습니다.");
  }
}
