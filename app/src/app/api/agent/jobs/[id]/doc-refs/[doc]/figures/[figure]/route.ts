import { docRefTarget } from "@/lib/server/jobs";
import { hasDb } from "@/lib/server/db";
import { t3qImage } from "@/lib/t3q/client";
import { fail, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DOC = /^d[0-9]{1,4}$/;
const FIG = /^f[0-9]{1,4}$/;

/**
 * GET /api/agent/jobs/{id}/doc-refs/{doc}/figures/{figure} — 문서에서 따로 뽑은 그림(위치도·차트·사진 등, T3Q v0.4.8 doc_refs[].figures[]).
 * 화면의 <img> 가 로그인 쿠키로 부른다. 개인정보가 있는 쪽은 T3Q 가 주지 않는다(403 FIGURE_WITHHELD) — code 로 알린다.
 * 내려받기용이 아니라 화면 표시용 — 브라우저에만 잠깐 둔다(private).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; doc: string; figure: string }> }) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const { id, doc, figure } = await ctx.params;
  if (!DOC.test(doc) || !FIG.test(figure)) return fail(400, "근거 번호 형식이 맞지 않습니다.");
  const t = await docRefTarget(who, id, doc, figure);
  if ("error" in t) return fail(t.error, "이 답의 근거 문서가 아닙니다.");
  const r = await t3qImage(`/agent/query/${t.requestId}/doc-refs/${doc}/figures/${figure}`);
  if (!r.bytes || !r.type) return fail(r.http === 403 ? 403 : r.http === 404 ? 404 : r.http === 410 ? 410 : 502, "이미지를 불러오지 못했습니다.", { code: r.code });
  return new Response(r.bytes, { status: 200, headers: { "content-type": r.type, "cache-control": "private, max-age=600", "x-content-type-options": "nosniff" } });
}
