import "server-only";
import { t3qData } from "./demoMode";
import { collectSimilarPages, similarPageBody, type SimilarPageEnvelope } from "../similarPages";

/**
 * T3Q-04 유사사례 검색을 전체 건수(total_count)만큼 — 한 쪽 100건씩 이어받아 한 봉투로(개발서버 similarApi.search, R63).
 * 화면 프록시(/api/t3q/data)와 자동 조회(preview)가 함께 쓴다.
 * - 첫 쪽 봉투를 못 받았거나 2xx 가 아니면 첫 쪽 결과를 그대로 돌려준다(이어받지 않음).
 * - 다음 쪽이 실패(봉투 없음·2xx 아님)하면 그때까지 받은 만큼만.
 * request = 첫 쪽에 보낸 본문(원응답 기록용).
 */
export async function t3qSimilarAll(accountId: string | null | undefined, path: string, body: unknown, opt: { timeoutMs?: number } = {}) {
  const request = similarPageBody(body, 1);
  const first = await t3qData<SimilarPageEnvelope>(accountId, "POST", path, request, opt);
  if (!first.envelope || !first.body || first.http < 200 || first.http >= 300) return { ...first, request };
  let ms = first.ms;
  const merged = await collectSimilarPages<SimilarPageEnvelope>(async (page) => {
    if (page === 1) return first.body!;
    const r = await t3qData<SimilarPageEnvelope>(accountId, "POST", path, similarPageBody(body, page), opt);
    ms += r.ms;
    if (!r.envelope || !r.body || r.http < 200 || r.http >= 300) throw new Error("이어받기 실패");
    return r.body;
  });
  return { ...first, ms, body: merged, request };
}
