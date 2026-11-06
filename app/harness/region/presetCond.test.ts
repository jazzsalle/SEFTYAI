// 하네스 — 질문별 조건 프리셋(질문 모음 「시연」·「한눈 요약 질의」)은 그 질문에만 실린다 · 시연 시나리오 특보 판별 · 재사용 열쇠(R45)
//  · 프리셋은 그 질문 요청에만 실리고 세션 조건(조건 편집 창 값)은 바꾸지 않는다
//  (옛 「재난담당자의 하루」 묶음·「시연 세트 예열」 시험은 R51 에서 그 기능과 함께 지웠다)
// npx vitest run harness/region/presetCond.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCOUNTS } from "@/lib/config";
import { basePilot, baseWire, defaultBase, type BaseRegion } from "@/lib/baseRegion";
import { SCN_ACCOUNT, SCN_SOURCE, sentWithScenario } from "@/lib/scenario";
import { KMA_SOURCE } from "@/lib/wxref";
import { demoAsk, libById, presetCondition, wireCondition, type DemoItem } from "@/lib/library";
import { submitBody, type Cond } from "@/lib/session";
import { cacheKeyOf, type JobSource } from "@/lib/server/jobs";

const REC = join(__dirname, "..", "recordings");
const rec = (p: string) => JSON.parse(readFileSync(join(REC, `${p}.json`), "utf8")) as { request: Record<string, unknown> };
const accOf = (r: keyof typeof SCN_ACCOUNT) => ACCOUNTS.find((a) => a.id === SCN_ACCOUNT[r])!;
/** 로그인 직후 세션 조건(lib/session condFor) — 기준지역만, 나머지 비움 */
const condOf = (base: BaseRegion | null): Cond => ({ base, region: basePilot(base) });

describe("시연 시나리오 특보 · 재사용 열쇠", () => {
  it("시연 시나리오 특보와 함께 보낸 요청 판별(답 카드·보고서·브리핑 머리의 회색 한 줄)", () => {
    expect(sentWithScenario(rec("demo_v3/BRF-BS-4").request)).toBe(true);
    expect(sentWithScenario(rec("demo_chain_busan/BS-02").request)).toBe(false);
    expect(sentWithScenario({ weather_warnings: { items: [{ warning_key: "L1010100-호우-경보" }] } })).toBe(false);
    expect(sentWithScenario(null)).toBe(false);
    // R45 — 끊긴 계정이 기준지역을 시나리오 구역 밖으로 두고 보낸 빈 목록(출처 시나리오)도 — 기상청 실시간을 확인한 답이 아니다
    expect(sentWithScenario({ weather_warnings: { collect_status: "COLLECTED", source: SCN_SOURCE, items: [] } })).toBe(true);
    expect(sentWithScenario({ weather_warnings: { collect_status: "COLLECTED", source: KMA_SOURCE, items: [] } })).toBe(false);
  });

  it("재사용 열쇠 — 끊긴 계정의 구역 밖 빈 목록(출처 시나리오)은 기상청 「특보 없음」과 열쇠가 다르고, 항목이 있으면 출처와 무관하게 지금 그대로(R45)", () => {
    const at = "2026-11-05T08:30:00+09:00";
    const base = { question: "점검", source: "AI_MODE" as JobSource, queryContext: { region: { name: "서울특별시" } } };
    const key = (w: Record<string, unknown>) => cacheKeyOf({ ...base, weatherWarnings: w }, { now: Date.parse(at) });
    const empty = (source: string) => ({ collect_status: "COLLECTED", collected_at: at, source, items: [] });
    expect(key(empty(SCN_SOURCE))).not.toBe(key(empty(KMA_SOURCE)));
    // 기상청 빈 목록은 예전 열쇠 그대로(출처·시각 무관)
    expect(key(empty(KMA_SOURCE))).toBe(key({ ...empty(KMA_SOURCE), collected_at: "2026-11-05T09:00:00+09:00" }));
    // 항목이 있으면 출처가 열쇠에 들지 않는다 — 예열한 SCN-* 열쇠·기상청 열쇠가 바뀌지 않음
    const item = { warning_key: "SCN-BS-1", kind: "호우", level: "경보", area: "부산", announced_at: at, effective_at: at, change: "발효" };
    expect(key({ ...empty(SCN_SOURCE), items: [item] })).toBe(key({ ...empty(KMA_SOURCE), items: [item] }));
  });
});

describe("조건 프리셋은 그 질문에만 — 세션 조건을 바꾸지 않는다", () => {
  const acc = accOf("busan");
  const session: Cond = Object.freeze({
    ...condOf(defaultBase(acc)), disasterType: "태풍", periodFrom: "2024-01-01", warningKind: "강풍", keywords: ["도로"],
    conditions: Object.freeze([Object.freeze({ item: "WIND_SPEED", label: "풍속", value: 20, unit: "m/s" })]) as Cond["conditions"],
  }) as Cond;
  const snapshot = JSON.stringify(session);

  it("프리셋 질문 = 기준지역만 세션 값, 나머지는 프리셋 값만", () => {
    const d = libById("SIM-SH-2-6") as DemoItem;
    const body = submitBody(session, demoAsk(d));
    expect(body.condition).toEqual(presetCondition(baseWire(session.base), d.cond));
    expect(body.condition.keywords).toEqual([]);
    expect(body.condition.disasterTypes).toEqual(["호우"]);
    expect("cond" in body).toBe(false); // 프리셋 원본은 요청 본문에 따로 싣지 않는다
    expect(JSON.stringify(session)).toBe(snapshot);
  });

  it("프리셋이 없는 질문은 세션 조건 그대로(지금까지와 같은 모양)", () => {
    const body = submitBody(session, { question: "질문", source: "USER" });
    expect(body.condition).toEqual({
      base: baseWire(session.base), disasterTypes: ["태풍"], referenceTime: null, period: { from: "2024-01-01", to: null },
      warningKind: "강풍", warningLevel: null, keywords: ["도로"], conditions: session.conditions,
    });
    expect(body.condition).toEqual(wireCondition(baseWire(session.base), session));
    expect(JSON.stringify(session)).toBe(snapshot);
  });
});
