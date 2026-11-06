import { describe, expect, it } from "vitest";
import { fromMeasures, isFilled, toMeasures } from "@/components/explore/CondModal";
import { buildQueryContext } from "@/lib/server/queryContext";
import type { Account } from "@/lib/config";

/** R54 — [조건 변경] 기상·수문 조건(개발서버 ConditionModal · conditions.toQueryContext) */
describe("재난상황 조건 — 기상·수문 값", () => {
  it("체크했고 숫자가 든 줄만 조건으로 친다(개발서버 isFilled)", () => {
    expect(isFilled({ checked: true, value: "70" })).toBe(true);
    expect(isFilled({ checked: false, value: "70" })).toBe(false);
    expect(isFilled({ checked: true, value: " " })).toBe(false);
    expect(isFilled({ checked: true, value: "칠십" })).toBe(false);
  });

  it("세션 조건 ↔ 줄 9개 — 채운 줄만 이름·값·단위로", () => {
    const ms = toMeasures({ conditions: [{ item: "RAIN_3H", label: "3시간 누적", value: 70, unit: "mm" }] });
    expect(ms).toHaveLength(9);
    expect(ms.find((m) => m.item === "RAIN_3H")).toMatchObject({ checked: true, value: "70" });
    ms.find((m) => m.item === "HUMIDITY")!.value = "85";
    ms.find((m) => m.item === "HUMIDITY")!.checked = true;
    ms.find((m) => m.item === "FLOW")!.value = "120"; // 체크 안 함 → 안 나감
    expect(fromMeasures(ms)).toEqual([
      { item: "RAIN_3H", label: "3시간 누적", value: 70, unit: "mm" },
      { item: "HUMIDITY", label: "습도", value: 85, unit: "%" },
    ]);
  });

  it("query_context.detail.conditions = item·label·value·unit·source_type MANUAL(개발서버 toQueryContext 와 같은 꼴)", () => {
    const acc = { id: "busan", role: "지자체", region: "busan" } as unknown as Account;
    const qc = buildQueryContext(acc, {
      base: { code: "26", name: "부산광역시", level: "SIDO" },
      warningKind: "호우", warningLevel: "주의보", keywords: ["지하차도"],
      conditions: [{ item: "RAIN_6H", label: "6시간 누적", value: 90, unit: "mm" }],
    });
    expect(qc.detail).toEqual({
      warning_kind: "호우", warning_level: "주의보", keywords: ["지하차도"],
      conditions: [{ item: "RAIN_6H", label: "6시간 누적", value: 90, unit: "mm", source_type: "MANUAL" }],
    });
  });
});
