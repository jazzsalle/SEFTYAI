// 브리핑 세트 — 개발서버(ai_briefing_item · BriefingSetService · BriefingRules)와 같은 기본 항목·규칙(R51)
// npx vitest run harness/explore/briefingSet.test.ts
import { describe, expect, it } from "vitest";
import { BRIEFING_RULES, briefingDefaults, briefingFromStored, validateBriefing } from "@/lib/briefingSet";
import { LIBRARY, libraryFor } from "@/lib/library";

describe("브리핑 세트 — 개발서버와 같게", () => {
  it("기본 항목 = 사용 중(is_active) 4개, sort_no 차례, 기본(is_default)만 체크", () => {
    const d = briefingDefaults();
    expect(d.map((x) => x.id)).toEqual(["risk-area", "past-damage", "evacuation", "manual"]);
    expect(d.map((x) => x.label)).toEqual(["위험·취약지역", "과거 피해 이력", "통제·대피 대상", "행동매뉴얼"]);
    expect(d.every((x) => x.checked && x.isDefault)).toBe(true);
    expect(BRIEFING_RULES).toMatchObject({ minChecked: 4, maxItems: 8, maxLabelLength: 50, maxQuestionLength: 500 });
  });

  it("저장 규칙 — 최대 8개 · 4개 이상 체크 · 이름·질의문 필수, 저장 모양에는 (기본) 표시가 없다", () => {
    const d = briefingDefaults();
    expect(validateBriefing(d)).toEqual(d.map((x) => ({ id: x.id, label: x.label, question: x.question, checked: x.checked })));
    expect(() => validateBriefing(d.map((x, i) => ({ ...x, checked: i > 0 })))).toThrow("4개 이상");
    expect(() => validateBriefing([...d, ...d, ...d])).toThrow("최대 8건");
    expect(() => validateBriefing([...d, { id: "n", label: "", question: "q", checked: false }])).toThrow("항목명");
    // 번호가 겹치면 새로 매긴다
    const ids = validateBriefing([...d, { ...d[0], checked: false }]).map((x) => x.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("저장해 둔 값 → 이름·질의문이 빈 자리는 버리고 (기본)을 매김, 남는 것이 없으면 null", () => {
    expect(briefingFromStored([{ id: "manual", label: "행동매뉴얼", question: "q", checked: true }, { id: "x", label: "", question: "q" }])).toEqual([
      { id: "manual", label: "행동매뉴얼", question: "q", checked: true, isDefault: true },
    ]);
    expect(briefingFromStored([])).toBeNull();
    expect(briefingFromStored({ brief: 1 })).toBeNull();
  });
});

describe("지역 질문 — 개발서버 questionLibrary 와 같은 글·차례", () => {
  it("공통 10 · 부산 3 · 인제 3 · 영천 3, 브리핑 문항·연속질의 없음, 문항 재난유형 없음", () => {
    expect(LIBRARY.map((q) => q.id)).toEqual([
      "LB-RISK-01", "LB-SLOPE-01", "LB-SLOPE-02", "LB-FT-01", "LB-FT-02", "LB-FT-03", "LB-PLAN-01", "LB-WARN-01", "LB-MSG-01", "LB-EV-01",
      "BS-03", "BS-01", "BS-02", "IJ-01", "IJ-02", "IJ-03", "YC-03", "YC-01", "YC-02",
    ]);
    expect(LIBRARY.every((q) => !q.disasterTypes && !q.quickQueryId)).toBe(true);
    expect(libraryFor("").length).toBe(10);
    expect(libraryFor("inje").map((q) => q.id).slice(10)).toEqual(["IJ-01", "IJ-02", "IJ-03"]);
  });
});
