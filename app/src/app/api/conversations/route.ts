import type { Conversation } from "@/lib/session";
import { allConvs, deleteConvs, listConvs, putConvs } from "@/lib/server/convStore";
import { hasDb } from "@/lib/server/db";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";

/** GET /api/conversations — 내 대화 이력 · ?all=1 은 시스템 운영자만(응답 검증용, 모든 계정) */
export async function GET(req: Request) {
  const who = whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  if (new URL(req.url).searchParams.get("all")) {
    if (who.role !== "운영자") return fail(403, "모든 계정의 대화는 시스템 운영자만 볼 수 있습니다.");
    return json(await allConvs());
  }
  return json(await listConvs(who));
}

/** PUT /api/conversations — 내 대화 저장 {convs: Conversation[]} (새 대화·이어서 질문·제목 변경·브라우저 이력 옮기기) */
export async function PUT(req: Request) {
  const who = whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const body = (await req.json().catch(() => null)) as { convs?: Conversation[] } | null;
  if (!Array.isArray(body?.convs) || body.convs.length > 100) return fail(400, "요청 형식이 맞지 않습니다.");
  return json({ saved: await putConvs(who.id, body.convs) });
}

/** DELETE /api/conversations — 내 대화 삭제 {ids: string[]} */
export async function DELETE(req: Request) {
  const who = whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const body = (await req.json().catch(() => null)) as { ids?: string[] } | null;
  if (!Array.isArray(body?.ids)) return fail(400, "요청 형식이 맞지 않습니다.");
  return json({ deleted: await deleteConvs(who.id, body.ids.filter((x) => typeof x === "string")) });
}
