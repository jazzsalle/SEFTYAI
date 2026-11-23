// @vitest-environment jsdom
// 데이터군 탭(개발서버 97e1fdc · 0be612a — FUN-UFR-303008) · 조건 불일치 구분 표시(e41e5a9 — FUN-UFR-302003) · 유사사례 판단(3e03b0f — FUN-UFR-401001).
// npx vitest run harness/render/dataGroups
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DataGroupTabs from "@/components/answer/DataGroupTabs";
import { buildDataGroups, effectiveCondition, judgeSimilar, mismatchMarks, withoutDocumentGroups } from "@/lib/dataGroups";

afterEach(cleanup);

const REFS = [
  { ref: "r1", entity_type: "EVENT", entity_id: "T1", display_name: "2020 부산 호우", similarity: { score: 91.6 }, region: { admin_code: "2600000000", name: "부산광역시" }, disaster_types: ["호우"] },
  { ref: "r2", entity_type: "EVENT", entity_id: "T2", display_name: "2022 경기 태풍", similarity: { score: 80 }, region: { admin_code: "4100000000", name: "경기도" }, disaster_types: ["태풍"] },
  { ref: "r3", entity_type: "RISK_AREA", entity_id: "HZ-1", display_name: "범천2지구", region: null },
];
const DOCS = [{ doc: "d1", document_id: "DOC-1", title: "저감계획", page: 32, url: "/v1/agent/query/R/doc-refs/d1" }];
const GROUPS = [
  { group: "SIMILAR_EVENT", label: "유사재난 사례", count: 3, unit: "건", object_ids: ["T1", "T2", "T9", "T1"] },
  { group: "DOCUMENT", label: "근거 문서", count: 1, object_ids: ["DOC-1"] },
  { group: "RISK_AREA", label: "위험지역", object_ids: ["HZ-1"] },
  { group: "EMPTY", label: "빈 군", object_ids: ["없음"] },
  { group: "", object_ids: ["T1"] },
];

describe("데이터군(lib/dataGroups)", () => {
  it("T3Q 가 준 군·이름·개수 그대로, 찾지 못한 ID·빈 군은 뺀다, 유사도는 반올림, 문서는 「제목 p.N」", () => {
    const g = buildDataGroups(GROUPS, REFS, DOCS);
    expect(g.map((x) => [x.key, x.label, x.count, x.unit, x.items.map((i) => i.name)])).toEqual([
      ["SIMILAR_EVENT", "유사재난 사례", 3, "건", ["2020 부산 호우", "2022 경기 태풍"]],
      ["DOCUMENT", "근거 문서", 1, "건", ["저감계획 p.32"]],
      ["RISK_AREA", "위험지역", 1, "건", ["범천2지구"]],
    ]);
    expect(g[0].items[0].meta).toEqual(["유사도 92"]);
    expect(g[1].items[0].doc).toBe("d1");
    expect(buildDataGroups(undefined, REFS, DOCS)).toEqual([]);
    // 근거 표가 문서를 보여 주면 문서만 든 군은 뺀다(차례 그대로)
    expect(withoutDocumentGroups(g).map((x) => x.key)).toEqual(["SIMILAR_EVENT", "RISK_AREA"]);
  });
  it("조건 불일치 — 둘 다 알 때만, 질문에서 읽은 조건이 앞선다, 재난유형은 유사사례만", () => {
    const cond = effectiveCondition({ region: { admin_code: "2600000000" }, disaster_types: ["호우"] }, { region: { admin_code: "1100000000" } });
    expect(cond).toEqual({ regionCode: "2600000000", types: ["호우"] });
    expect(mismatchMarks(REFS[0], cond)).toEqual([]);
    expect(mismatchMarks(REFS[1], cond)).toEqual(["다른 지역 · 경기도", "다른 유형 · 태풍"]);
    expect(mismatchMarks(REFS[2], cond)).toEqual([]);
    // 객체가 조건보다 넓은 단위면 판단하지 않는다
    expect(mismatchMarks({ ref: "x", region: { admin_code: "4100000000", name: "경기도" } }, effectiveCondition(null, { region: { admin_code: "2611000000" } }))).toEqual([]);
    expect(mismatchMarks(REFS[1], effectiveCondition(null, null))).toEqual([]);
  });
  it("유사사례 판단 — context_used.similarity_ranking 이 있을 때만, 없는 옛 답은 null", () => {
    expect(judgeSimilar({ similarity_ranking: { method: "x" }, interpreted_conditions: { disaster_types: ["호우"] } })).toEqual({ similar: true, disasterTypes: ["호우"] });
    expect(judgeSimilar({ interpreted_conditions: {} })).toEqual({ similar: false, disasterTypes: [] });
    expect(judgeSimilar(undefined)).toBeNull();
  });
});

describe("데이터군 탭(DataGroupTabs)", () => {
  it("군이 여럿이면 탭(이름 + 개수), 5건씩 「N건 더보기」, 유사사례는 사건 상세 · 객체는 상세 · 구분 표시는 글자", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ref: `e${i}`, entity_type: "RISK_AREA", entity_id: `HZ-${i}`, display_name: `지구 ${i}` }));
    const groups = buildDataGroups(
      [GROUPS[0], { group: "RISK_AREA", label: "위험지역", count: 7, object_ids: many.map((m) => m.entity_id) }],
      [...REFS, ...many],
      [],
      (r) => mismatchMarks(r, { regionCode: "2600000000", types: ["호우"] }),
    );
    const onEvent = vi.fn();
    const onEntity = vi.fn();
    const onSelect = vi.fn();
    const { container, rerender } = render(<DataGroupTabs id="g" groups={groups} selected={null} onSelect={onSelect} onEntity={onEntity} onEvent={onEvent} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["유사재난 사례 3", "위험지역 7"]);
    expect(container.querySelector(".dg-mark")?.textContent).toBe("다른 지역 · 경기도");
    fireEvent.click(screen.getByRole("button", { name: "2020 부산 호우" }));
    expect(onEvent.mock.calls[0][0].key).toBe("T1");
    fireEvent.click(screen.getByRole("tab", { name: "위험지역 7" }));
    expect(onSelect).toHaveBeenCalledWith("RISK_AREA");
    rerender(<DataGroupTabs id="g" groups={groups} selected="RISK_AREA" onSelect={onSelect} onEntity={onEntity} onEvent={onEvent} />);
    expect(container.querySelectorAll(".dg-list li").length).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "2건 더보기" }));
    expect(container.querySelectorAll(".dg-list li").length).toBe(7);
    fireEvent.click(screen.getByRole("button", { name: "지구 0" }));
    expect(onEntity.mock.calls[0][0].entity_id).toBe("HZ-0");
  });
  it("군이 하나면 탭 없이 머리글 「유사재난 사례 3건」, 문서 이름은 우측 근거 문서로", () => {
    const onDoc = vi.fn();
    const g = buildDataGroups([GROUPS[1]], REFS, DOCS);
    const { container } = render(<DataGroupTabs id="g" groups={g} selected={null} onSelect={() => {}} onEntity={() => {}} onDoc={onDoc} />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(container.querySelector("h4.dg-head")?.textContent).toBe("근거 문서 1건");
    fireEvent.click(screen.getByRole("button", { name: "저감계획 p.32" }));
    expect(onDoc).toHaveBeenCalledWith("d1");
  });
});
