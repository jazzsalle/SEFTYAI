// 하네스 — 화면에 영어가 나오지 않게(사용자 지시 2026-10-28): 녹화본에 실제로 온 정보 부족 항목 이름이 모두 한국어로 바뀌는지 본다.
// npx vitest run harness/labels
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gapName } from "@/lib/labels";

const dir = join(__dirname, "..", "recordings");
const components = new Set<string>();
const walk = (v: unknown): void => {
  if (Array.isArray(v)) return v.forEach(walk);
  if (!v || typeof v !== "object") return;
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.data_gaps)) for (const g of o.data_gaps) if (typeof (g as { component?: unknown })?.component === "string") components.add((g as { component: string }).component);
  Object.values(o).forEach(walk);
};
for (const f of readdirSync(dir, { recursive: true }) as string[]) if (f.endsWith(".json")) walk(JSON.parse(readFileSync(join(dir, f), "utf8")));

describe("정보 부족 항목 이름", () => {
  it("녹화본에 정보 부족 항목이 있다", () => expect(components.size).toBeGreaterThan(10));
  // 괄호 속 단위(m, mm 등)는 영어 낱말이 아니므로 빼고 본다. 이름 속에 「·」를 쓰지 않는다(목록 구분과 헷갈림 — 시각 설계 §0.2)
  it.each([...components].sort())("%s → 한국어", (c) => {
    const name = gapName(c);
    expect(name.replace(/\((?:m|mm|cm|km|㎡|m²|㎥|ha)\)/g, "")).not.toMatch(/[A-Za-z]/);
    expect(name).not.toContain("·");
  });
  it("이름 규칙 예", () => {
    expect(gapName("similarity.factors.rain")).toBe("강우(유사도 요인)");
    expect(gapName("items[].max_depth_m")).toBe("각 항목의 최대 침수심(m)");
    expect(gapName("document_store")).toBe("원문 문서 보관");
  });
});
