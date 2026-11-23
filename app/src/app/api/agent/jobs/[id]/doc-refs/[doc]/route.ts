import { docRefTarget } from "@/lib/server/jobs";
import { hasDb } from "@/lib/server/db";
import { t3q } from "@/lib/t3q/client";
import { fail, json, whoami } from "@/lib/server/who";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DOC = /^d[0-9]{1,4}$/;

/**
 * GET /api/agent/jobs/{id}/doc-refs/{doc} — 답이 근거로 든 문서 쪽(T3Q 쪽 본문 API, 설명서 6.10절)을 대신 받아 넘긴다.
 * T3Q 인증이 필요해 브라우저가 직접 열 수 없다. 봉투는 그대로(R0) — 인용 부분(passage)·쪽 전체(markdown)·문서 정보·가린 개인정보 수(masked).
 * 그 답의 doc_refs 에 있는 doc 만 연다. 404 DOC_REF_NOT_FOUND(대화 삭제)·410 DOC_CHANGED(문서 갱신)는 code 로 알린다.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; doc: string }> }) {
  const who = await whoami(req);
  if (!who) return fail(401, "로그인이 필요합니다.");
  if (!hasDb()) return fail(503, "서버 DB가 연결되지 않았습니다.");
  const { id, doc } = await ctx.params;
  if (!DOC.test(doc)) return fail(400, "근거 번호 형식이 맞지 않습니다.");
  const t = await docRefTarget(who, id, doc);
  if ("error" in t) return fail(t.error, t.error === 404 ? "이 답의 근거 문서가 아닙니다." : "이 답은 근거 쪽을 다시 열 수 없습니다.", { code: t.error === 404 ? "NOT_IN_ANSWER" : "NO_REQUEST_ID" });
  const r = await t3q<{ warnings?: { code?: string }[] }>("GET", `/agent/query/${t.requestId}/doc-refs/${doc}`);
  if (!r.envelope) return fail(502, r.error ?? "근거 쪽을 불러오지 못했습니다.", { http: r.http });
  // 403 = 제공기관 정책으로 볼 수 없는 근거(화면이 「인용 부분만 볼 수 있습니다」로 따로 알린다 — 개발서버 evidenceApi)
  if (r.http !== 200) return fail(r.http === 410 ? 410 : r.http === 404 ? 404 : r.http === 403 ? 403 : 502, "근거 쪽을 열 수 없습니다.", { code: r.body?.warnings?.[0]?.code ?? null });
  return json({ http: r.http, envelope: r.body });
}
