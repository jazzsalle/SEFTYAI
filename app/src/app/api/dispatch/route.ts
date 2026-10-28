import { canSend, canView, isOrg, myOrg, type DispatchRequest } from "@/lib/contactsCore";
import { hasDb } from "@/lib/server/db";
import { createDispatch, DispatchError, listDispatches } from "@/lib/server/dispatch";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** GET /api/dispatch?org= — 상황전파 이력 (자기 기관, 운영자는 모든 기관 조회) */
export async function GET(req: Request) {
  const who = await whoami(req);
  const org = new URL(req.url).searchParams.get("org");
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!isOrg(org)) return fail(400, "기관을 고르세요.");
  if (!canView(who, org)) return fail(403, "다른 기관의 전파 이력은 볼 수 없습니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  return json(await listDispatches(org));
}

/** POST /api/dispatch — 상황전파 발송 (자기 기관 담당자만, 시스템 운영자 불가) */
export async function POST(req: Request) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (who.mustChangePw) return fail(403, "초기 비밀번호를 먼저 바꿔 주세요.");
  if (!canSend(who)) return fail(403, "시스템 운영자는 상황전파를 보낼 수 없습니다. 전파 이력 조회만 할 수 있습니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const body = (await req.json().catch(() => null)) as DispatchRequest | null;
  if (!body || !isOrg(body.orgId)) return fail(400, "요청 형식이 맞지 않습니다.");
  if (body.orgId !== myOrg(who)) return fail(403, "자기 기관 연락망으로만 보낼 수 있습니다.");
  try {
    const r = await createDispatch(body, who);
    return json(r, r.duplicate ? 200 : 201);
  } catch (e) {
    if (e instanceof DispatchError) return fail(e.status, e.message, e.extra);
    console.error("[dispatch] failed", e);
    return fail(500, "보내지 못했습니다.");
  }
}
