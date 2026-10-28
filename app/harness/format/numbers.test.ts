// 하네스 — 숫자 표기 통일(천 단위 쉼표, 사용자 결정 2026-10-28): 녹화된 T3Q 데이터 응답의 숫자 전부로 확인한다.
// ① 쉼표를 빼면 받은 숫자 글자와 같다(다른 글자는 바뀌지 않음) ② 번호·코드·연도 열은 쉼표 없음 ③ 1,000 이상의 양은 쉼표
// npx vitest run harness/format
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fmtNum, fmtValue, isPlainNumKey } from "@/lib/format";

const dir = join(__dirname, "..", "recordings");
const pairs: [string, number][] = [];
/** 받은 값 나무를 돌며 (열 이름, 숫자) 모으기 — {key, value} 속성 묶음은 value 의 열 이름을 그 key 로(화면과 같은 규칙) */
const walk = (v: unknown, k?: string): void => {
  if (Array.isArray(v)) return v.forEach((x) => walk(x, k));
  if (typeof v === "number") { if (k) pairs.push([k, v]); return; }
  if (!v || typeof v !== "object") return;
  const o = v as Record<string, unknown>;
  const own = typeof o.key === "string" ? o.key : undefined;
  for (const [kk, x] of Object.entries(o)) walk(x, kk === "value" && own ? own : kk);
};
for (const f of readdirSync(dir, { recursive: true }) as string[]) {
  if (!f.endsWith(".json")) continue;
  const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
  // 데이터 조회 녹화본만(에이전트 답 글은 원문 그대로라 여기 대상 아님)
  if (Array.isArray(j)) for (const r of j) if (r?.response?.result) walk(r.response.result);
}

describe("숫자 표기 — 천 단위 쉼표로 통일", () => {
  it("녹화본에 숫자가 충분히 있다", () => expect(pairs.length).toBeGreaterThan(500));
  it("쉼표를 빼면 받은 숫자 글자 그대로(반올림·자릿수 변화 없음)", () => {
    for (const [k, n] of pairs) expect(fmtValue(k, n).replace(/,/g, "")).toBe(String(n));
  });
  it("번호·코드·연도·순번·순위 열은 쉼표 없음", () => {
    const plain = pairs.filter(([k]) => isPlainNumKey(k));
    expect(plain.length).toBeGreaterThan(0);
    for (const [k, n] of plain) expect(fmtValue(k, n)).not.toContain(",");
  });
  it("그 밖의 숫자는 1,000 이상이면 쉼표", () => {
    const big = pairs.filter(([k, n]) => !isPlainNumKey(k) && Math.abs(n) >= 1000 && /^-?\d+(\.\d+)?$/.test(String(n)));
    expect(big.length).toBeGreaterThan(0);
    for (const [k, n] of big) expect(fmtValue(k, n)).toContain(",");
  });
  it("예", () => {
    expect(fmtNum(1037156500000)).toBe("1,037,156,500,000");
    expect(fmtNum(9608.5)).toBe("9,608.5");
    expect(fmtNum(46.6667)).toBe("46.6667");
    expect(fmtNum(-12345)).toBe("-12,345");
    expect(fmtNum(999)).toBe("999");
    for (const k of ["built_year", "flood_year", "base_year", "admin_code", "disaster_no", "designation_no", "event_master_id", "seq", "rank", "row_no", "station_no"]) expect(isPlainNumKey(k)).toBe(true);
    for (const k of ["area_m2", "record_count", "item_count", "total_count", "damage_amount_krw", "displaced", "elapsed_hours", "score"]) expect(isPlainNumKey(k)).toBe(false);
    expect(fmtValue("built_year", 1995)).toBe("1995");
    expect(fmtValue("area_m2", 16179)).toBe("16,179");
  });
});
