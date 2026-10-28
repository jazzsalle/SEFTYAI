import { canManage, canView, isOrg, type Bundle } from "@/lib/contactsCore";
import { Conflict, getBundle, putBundle } from "@/lib/server/contactsStore";
import { hasDb } from "@/lib/server/db";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** GET /api/contacts?org= — 기관 연락망 (자기 기관, 운영자는 모든 기관 조회) */
export async function GET(req: Request) {
  const who = await whoami(req);
  const org = new URL(req.url).searchParams.get("org");
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (who.mustChangePw) return fail(403, "초기 비밀번호를 먼저 바꿔 주세요.");
  if (!isOrg(org)) return fail(400, "기관을 고르세요.");
  if (!canView(who, org)) return fail(403, "다른 기관의 연락망은 볼 수 없습니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  return json(await getBundle(org));
}

/** PUT /api/contacts?org= — 연락망 저장 {bundle, rev, what} (자기 기관 담당자만, 운영자 불가) */
export async function PUT(req: Request) {
  const who = await whoami(req);
  const org = new URL(req.url).searchParams.get("org");
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (who.mustChangePw) return fail(403, "초기 비밀번호를 먼저 바꿔 주세요.");
  if (!isOrg(org)) return fail(400, "기관을 고르세요.");
  if (!canManage(who, org)) return fail(403, "관리 권한이 없습니다. 연락망은 자기 기관 담당자만 고칠 수 있습니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const body = (await req.json().catch(() => null)) as { bundle?: Bundle; rev?: number; what?: string } | null;
  if (!body?.bundle || typeof body.rev !== "number") return fail(400, "요청 형식이 맞지 않습니다.");
  try {
    return json(await putBundle(org, body.bundle, body.rev, { id: who.id, name: who.name }, String(body.what ?? "연락망 변경").slice(0, 200)));
  } catch (e) {
    if (e instanceof Conflict) return fail(409, e.message, { latest: await getBundle(org) });
    return fail(400, (e as Error).message || "저장하지 못했습니다.");
  }
}
