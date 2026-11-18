/**
 * 유사사례 전체 이어받기 — 개발서버 features/search/similar/similarApi.ts collectSimilarPages(256e5ec·d387e02) 그대로(R63).
 * 정의서 UFR-002-001-02 · 기능분해도 FUN-UFR-402006: 유사사례를 건수 제한 없이 모두 받는다.
 *
 * 첫 쪽의 total_count 만큼 다음 쪽을 이어받아 한 목록으로 합친다. 전체 건수는 T3Q 가 준 total_count 를 그대로 쓴다.
 * - 원천이 결과를 주지 않은 응답(미제공 등, result 가 없음)은 그대로 돌려준다 — 「결과 0건」으로 바꾸지 않는다.
 * - 이어받다 실패하면 이미 받은 만큼 돌려준다 — 첫 쪽까지 버려 화면 전체를 오류로 만들지 않는다.
 * 화면·서버가 함께 쓴다(브라우저 전용 코드 없음).
 */

/** T3Q-04 한 쪽에 받을 수 있는 최대 건수(T3Q 회신 2026-11-13: page.size 최대 100) */
export const SIMILAR_PAGE_SIZE = 100;
/** 이어받기가 끝없이 도는 것을 막는 한도 — 100건씩 20쪽 = 2,000건 */
export const SIMILAR_MAX_PAGES = 20;

export interface SimilarPageEnvelope {
  result?: { total_count?: number; items?: unknown[]; [k: string]: unknown } | null;
  [k: string]: unknown;
}

export async function collectSimilarPages<E extends SimilarPageEnvelope>(fetchPage: (page: number) => Promise<E>): Promise<E> {
  const first = await fetchPage(1);
  if (!first.result) return first;

  const total = first.result.total_count;
  const items = [...(first.result.items ?? [])];

  for (let page = 2; page <= SIMILAR_MAX_PAGES; page++) {
    if (typeof total !== "number" || items.length >= total) break;
    let more: unknown[];
    try {
      more = (await fetchPage(page)).result?.items ?? [];
    } catch {
      break;
    }
    if (more.length === 0) break;
    items.push(...more);
  }

  return { ...first, result: { ...first.result, items } };
}

/** T3Q-04 요청 본문의 쪽 — 받은 본문의 다른 칸(query_context 등)은 그대로 두고 page 만 바꾼다 */
export const similarPageBody = (body: unknown, page: number): Record<string, unknown> => ({
  ...(body && typeof body === "object" ? (body as Record<string, unknown>) : {}),
  page: { page, size: SIMILAR_PAGE_SIZE },
});
