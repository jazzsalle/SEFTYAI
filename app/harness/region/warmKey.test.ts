// 하네스 — 브리핑 예열(운영관리 「브리핑 예열」, /api/admin/warm)이 지자체 담당자의 「현재 상황 브리핑」과 같은 재사용 열쇠를 만드는가
//  · 재사용 열쇠(lib/server/jobs.ts) = 보낸 질문 글 · 질문 출처 · query_context · 함께 보낸 특보 · 참조 · T3Q 대화 · AI 모드 10분 구간
//  · 예열은 query_context 를 { region: PILOT_T3Q[지역], disaster_types } 로 직접 만들고, 화면은 기준지역(condition.base)을 보내 buildQueryContext 로 만든다
//  · 기본 조건(기준지역 = 계정 기본, 재난유형 전체, 기준시각 현재, 상세 조건 없음)에서 둘이 같아야 예열한 답이 화면 브리핑에 즉시 나온다
// npx vitest run harness/region/warmKey.test.ts
import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "@/lib/config";
import { baseName, baseWire, defaultBase } from "@/lib/baseRegion";
import { DEFAULT_BRIEFING, fillText, libById } from "@/lib/library";
import { PILOT_T3Q } from "@/lib/t3q/region";
import { buildQueryContext } from "@/lib/server/queryContext";

describe("브리핑 예열 ↔ 화면 브리핑 — 같은 질문 글·같은 query_context", () => {
  for (const acc of ACCOUNTS.filter((a) => a.role === "지자체")) {
    const r = acc.region as keyof typeof PILOT_T3Q;
    it(`${acc.id}(${PILOT_T3Q[r].name}) 기본 브리핑 ${DEFAULT_BRIEFING.length}문항`, () => {
      const base = defaultBase(acc);
      expect(base).not.toBeNull();
      for (const id of DEFAULT_BRIEFING) {
        const q = libById(id)!;
        // 화면(explore startBriefing → session.submit): 질문 글의 {지역} = 기준지역 이름, 조건 = 기본 조건 그대로 보내는 모양(재난유형 「전체」 = 빈 목록)
        const screenQ = q.text.replaceAll("{지역}", baseName(base));
        const condition = { base: baseWire(base), disasterTypes: [], referenceTime: null, period: null, warningKind: null, warningLevel: null, keywords: [], conditions: [] };
        const screenQc = buildQueryContext(acc, condition, q.disasterTypes, screenQ);
        // 예열(api/admin/warm): 질문 글 = fillText(시범 지역 이름), 조건 = 시범 지역 + 질문의 재난유형
        const warmQ = fillText(q, PILOT_T3Q[r].name);
        const warmQc = { region: PILOT_T3Q[r], disaster_types: q.disasterTypes };
        expect(screenQ).toBe(warmQ);
        expect(screenQc).toEqual(warmQc);
      }
    });
  }
});
