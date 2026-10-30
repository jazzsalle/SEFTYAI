// 하네스 — 전국 기준지역(R32)·임시 서울 규칙(R33)
//  · 화면 조건 → T3Q query_context.region(buildQueryContext): 시·도·시·군·구·읍·면·동 코드 10자리·단계, 전국, 지자체도 고른 지역 그대로, 틀린 값, 예전 호출
//  · R33(임시): 전국 기본 계정 + 전국 + 「우리 지역…」 → 서울특별시, 질문 글은 그대로
//  · 질의 접수 라우트(실제 SQL — PGlite, T3Q 재생): 질문 글 그대로·틀린 기준지역 400
//  · 기상특보 구역 ↔ 기준지역(lib/wxMatch) — 기상청 실응답 발효 현황 원문(kma_t6_samples.json)으로
//  · 재사용 기준(D5)이 같은 함수로 작업의 기준지역을 본다
// npx vitest run harness/region
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import KMA from "./kma_t6_samples.json";
import type { Account } from "@/lib/config";
import type { Advisory } from "@/lib/contract/agent";
import { ACCOUNTS } from "@/lib/config";
import { baseKey, baseName, basePilot, baseQuestionPilot, baseTarget, baseToT3q, baseWire, defaultBase, parseBaseWire, type BaseRegion } from "@/lib/baseRegion";
import { kmaAdvId, kmaSidoNames, parseArea, seenArea, sggShort, splitTop, wxCovers, wxTargetOfT3q, type WxTarget } from "@/lib/wxMatch";
import { buildQueryContext, R33_OUR_REGION, R33_SEOUL } from "@/lib/server/queryContext";
import { parseStatusText } from "@/lib/server/kma";

// 재사용 기준(D5)의 기상청 조회 — 실응답 원문(gale)을 파싱한 특보를 돌려준다
const wx = vi.hoisted(() => ({ result: null as null | { ok: boolean; message: string; advisories: unknown[]; preliminary: unknown[] } }));
vi.mock("@/lib/server/kma", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/server/kma")>();
  return { ...mod, fetchLiveAdvisories: async () => wx.result };
});

process.env.DATABASE_URL = "pglite:memory://";
process.env.SESSION_SECRET = "test-secret";
process.env.T3Q_MODE = "replay";
process.env.T3Q_MAX_GLOBAL = "8";

const acc = (id: string) => ACCOUNTS.find((a) => a.id === id)!;
const MOIS = acc("mois_dsd01");
const ADMIN = acc("admin01");
const YC = acc("yc_safety02");
const IJ = acc("ij_safety01");
const BS = acc("bs_safety01");

const SAMPLE = Object.fromEntries(KMA.samples.map((s) => [s.key, s])) as unknown as Record<"now" | "cold" | "gale" | "d1022" | "daegu" | "d1025", { tmFc: number; t6: string }>;
const kmaTime = (v: number) => {
  const s = String(v);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`;
};
const advs = (k: keyof typeof SAMPLE) => parseStatusText(SAMPLE[k].t6, kmaTime(SAMPLE[k].tmFc));
/** 그 기준지역을 덮는 특보 — 「종류단계:구역」 */
const covered = (k: keyof typeof SAMPLE, t: WxTarget | null) => advs(k).filter((a) => wxCovers(a.area, t)).map((a) => `${a.type}${a.level}:${a.area}`);
const T = (sido: string, sigungu?: string): WxTarget => ({ sido, sigungu: sigungu ?? null });

const SIDO = (code: string, name: string): BaseRegion => ({ sido: { code, name } });
const wire = (code: string, name: string, level: "SIDO" | "SIGUNGU" | "EMD") => ({ code, name, level });

describe("기준지역 → query_context.region (buildQueryContext, R32)", () => {
  it("시·도·시·군·구·읍·면·동 — 코드를 10자리로 채우고 단계·이름은 받은 그대로", () => {
    expect(buildQueryContext(MOIS, { base: wire("26", "부산광역시", "SIDO") }).region).toEqual({ admin_code: "2600000000", level: "SIDO", name: "부산광역시" });
    expect(buildQueryContext(MOIS, { base: wire("47230", "경상북도 영천시", "SIGUNGU") }).region).toEqual({ admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" });
    expect(buildQueryContext(MOIS, { base: wire("51810250", "강원특별자치도 인제군 인제읍", "EMD") }).region).toEqual({ admin_code: "5181025000", level: "EMD", name: "강원특별자치도 인제군 인제읍" });
    expect(buildQueryContext(MOIS, { base: wire("12", "전남광주통합특별시", "SIDO") }).region).toEqual({ admin_code: "1200000000", level: "SIDO", name: "전남광주통합특별시" });
  });

  it("전국(base null) — region 을 보내지 않는다(중앙정부·지자체 모두)", () => {
    expect(buildQueryContext(MOIS, { base: null })).not.toHaveProperty("region");
    expect(buildQueryContext(YC, { base: null })).not.toHaveProperty("region");
    expect(buildQueryContext(BS, { base: null, disasterTypes: ["호우"] })).toEqual({ disaster_types: ["호우"] });
  });

  it("지자체도 다른 지역을 고르면 그 지역 그대로 — 관할로 바꾸지 않는다", () => {
    expect(buildQueryContext(YC, { base: wire("11110", "서울특별시 종로구", "SIGUNGU") }).region).toEqual({ admin_code: "1111000000", level: "SIGUNGU", name: "서울특별시 종로구" });
    expect(buildQueryContext(IJ, { base: wire("26350105", "부산광역시 해운대구 우동", "EMD") }).region).toEqual({ admin_code: "2635010500", level: "EMD", name: "부산광역시 해운대구 우동" });
    expect(buildQueryContext(BS, { base: wire("47", "경상북도", "SIDO") }).region).toEqual({ admin_code: "4700000000", level: "SIDO", name: "경상북도" });
  });

  it("틀린 기준지역 — 검사에서 거르고(숫자만·2/5/8자리·단계 일치·이름 1~80자), buildQueryContext 는 그 값을 쓰지 않는다", () => {
    const bad: unknown[] = [
      wire("2a", "부산광역시", "SIDO"), wire("2", "부산광역시", "SIDO"), wire("263", "부산", "SIGUNGU"), wire("26350", "부산광역시 해운대구", "SIDO"),
      wire("2635010", "우동", "EMD"), wire("2600000000", "부산광역시", "SIDO"), { code: "26", name: "부산광역시", level: "GU" }, { code: 26, name: "부산광역시", level: "SIDO" },
      wire("26", "", "SIDO"), wire("26", "   ", "SIDO"), wire("26", "가".repeat(81), "SIDO"), { code: "26", level: "SIDO" }, "26", ["26"], 26,
    ];
    for (const b of bad) {
      expect(parseBaseWire(b)).toBeNull();
      // 쓰지 않음 — 지자체는 계정 기본(관할), 중앙정부는 전국. 틀린 코드가 그대로 나가지 않는다
      expect(buildQueryContext(YC, { base: b }).region).toEqual({ admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" });
      expect(buildQueryContext(MOIS, { base: b })).not.toHaveProperty("region");
    }
    expect(parseBaseWire(wire("26", "가".repeat(80), "SIDO"))).not.toBeNull();
    expect(parseBaseWire({ code: "47230", name: "  경상북도   영천시 ", level: "SIGUNGU" })).toEqual(wire("47230", "경상북도 영천시", "SIGUNGU"));
  });

  it("예전 호출(condition.region·sub)도 받는다 — base 칸이 없을 때만, 지자체라도 고른 값 그대로", () => {
    expect(buildQueryContext(MOIS, { region: "inje" }).region).toEqual({ admin_code: "5181000000", level: "SIGUNGU", name: "강원특별자치도 인제군" });
    expect(buildQueryContext(MOIS, { region: "busan", sub: { code: "26350", name: "해운대구" } }).region).toEqual({ admin_code: "2635000000", level: "SIGUNGU", name: "부산광역시 해운대구" });
    expect(buildQueryContext(YC, { region: "busan" }).region).toEqual({ admin_code: "2600000000", level: "SIDO", name: "부산광역시" });
    expect(buildQueryContext(YC, null).region).toEqual({ admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" });
    expect(buildQueryContext(MOIS, null)).not.toHaveProperty("region");
    expect(buildQueryContext(MOIS, { region: "nowhere" as never })).not.toHaveProperty("region");
    // base 칸이 있으면 예전 칸은 보지 않는다
    expect(buildQueryContext(MOIS, { base: null, region: "busan" })).not.toHaveProperty("region");
  });
});

describe("R33 임시 — 전국 기본 계정이 전국으로 「우리 지역…」을 물으면 서울특별시(질문 글은 그대로)", () => {
  const SEOUL = { admin_code: "1100000000", level: "SIDO", name: "서울특별시" };
  it("중앙정부·운영자 + 전국 + 「우리 지역은…」·「우리지역에서…」·앞 빈칸 → 서울특별시", () => {
    expect(R33_SEOUL).toEqual(SEOUL);
    for (const q of ["우리 지역은 어디가 위험한가요?", "우리지역에서 먼저 점검할 곳은?", "  우리  지역 침수 이력", "우리 지역에서 먼저 점검해야 할 위험·취약지역은 어디인가요?"]) {
      expect(buildQueryContext(MOIS, { base: null }, undefined, q).region).toEqual(SEOUL);
      expect(buildQueryContext(ADMIN, { base: null }, undefined, q).region).toEqual(SEOUL);
    }
    // 예전 호출(전국)·조건 없음도
    expect(buildQueryContext(MOIS, { region: "national" }, undefined, "우리 지역은?").region).toEqual(SEOUL);
    expect(buildQueryContext(MOIS, null, ["호우"], "우리 지역은?")).toEqual({ region: SEOUL, disaster_types: ["호우"] });
  });
  it("「우리 지역」으로 시작하지 않으면 전국 그대로", () => {
    for (const q of ["부산의 우리 지역 위험지구", "우리 동네는?", "우리 지 역", "", undefined]) expect(buildQueryContext(MOIS, { base: null }, undefined, q)).not.toHaveProperty("region");
  });
  it("지자체 계정이 전국을 고르면 서울로 보내지 않는다", () => {
    for (const a of [YC, IJ, BS]) expect(buildQueryContext(a, { base: null }, undefined, "우리 지역은 어디가 위험한가요?")).not.toHaveProperty("region");
  });
  it("전국 기본 계정이라도 기준지역을 고르면 그 지역(서울 아님)", () => {
    expect(buildQueryContext(MOIS, { base: wire("26", "부산광역시", "SIDO") }, undefined, "우리 지역은 어디가 위험한가요?").region).toEqual({ admin_code: "2600000000", level: "SIDO", name: "부산광역시" });
  });
  it("질문 글은 손대지 않는다(받은 문자열 그대로 판단만)", () => {
    const q = "우리 지역은 어디가 위험한가요?";
    const qc = buildQueryContext(MOIS, { base: null }, undefined, q);
    expect(JSON.stringify(qc)).not.toContain(q);
    expect(q).toBe("우리 지역은 어디가 위험한가요?");
  });
});

describe("기준지역 기본값·이름·시범 지역 id (lib/baseRegion)", () => {
  it("기본값 — 부산 = 시·도 26 부산광역시, 영천 = 47 경상북도 + 47230 영천시, 인제 = 51 강원특별자치도 + 51810 인제군, 중앙정부·운영자 = 전국", () => {
    expect(defaultBase(BS)).toEqual({ sido: { code: "26", name: "부산광역시" } });
    expect(defaultBase(YC)).toEqual({ sido: { code: "47", name: "경상북도" }, sigungu: { code: "47230", name: "영천시" } });
    expect(defaultBase(IJ)).toEqual({ sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } });
    expect(defaultBase(MOIS)).toBeNull();
    expect(defaultBase(ADMIN)).toBeNull();
    // 기본값으로 보내는 지역 = 예전 시범 지역 값과 같다
    expect(baseToT3q(baseWire(defaultBase(YC))!)).toEqual({ admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" });
    expect(baseToT3q(baseWire(defaultBase(IJ))!)).toEqual({ admin_code: "5181000000", level: "SIGUNGU", name: "강원특별자치도 인제군" });
    expect(baseToT3q(baseWire(defaultBase(BS))!)).toEqual({ admin_code: "2600000000", level: "SIDO", name: "부산광역시" });
  });
  it("시범 지역 id — 26 아래 busan, 47230 아래 yeongcheon, 51810 아래 inje, 그 밖 national", () => {
    const pick = (sido: [string, string], sgg?: [string, string], emd?: [string, string]): BaseRegion => ({
      sido: { code: sido[0], name: sido[1] }, sigungu: sgg ? { code: sgg[0], name: sgg[1] } : null, emd: emd ? { code: emd[0], name: emd[1] } : null,
    });
    expect(basePilot(null)).toBe("national");
    expect(basePilot(pick(["26", "부산광역시"]))).toBe("busan");
    expect(basePilot(pick(["26", "부산광역시"], ["26350", "해운대구"], ["26350105", "우동"]))).toBe("busan");
    expect(basePilot(pick(["47", "경상북도"]))).toBe("national");
    expect(basePilot(pick(["47", "경상북도"], ["47230", "영천시"]))).toBe("yeongcheon");
    expect(basePilot(pick(["47", "경상북도"], ["47230", "영천시"], ["47230101", "조교동"]))).toBe("yeongcheon");
    expect(basePilot(pick(["47", "경상북도"], ["47290", "경산시"]))).toBe("national");
    expect(basePilot(pick(["51", "강원특별자치도"], ["51810", "인제군"], ["51810250", "인제읍"]))).toBe("inje");
    expect(basePilot(pick(["11", "서울특별시"]))).toBe("national");
  });
  it("질문 모음·시작 화면 시범 지역(R48) — 시·군·구를 고르지 않은 경상북도 = yeongcheon, 강원특별자치도 = inje(지도 첫 화면 basePilot 은 그대로)", () => {
    const pick = (sido: [string, string], sgg?: [string, string]): BaseRegion => ({ sido: { code: sido[0], name: sido[1] }, sigungu: sgg ? { code: sgg[0], name: sgg[1] } : null });
    expect(baseQuestionPilot(null)).toBe("national");
    expect(baseQuestionPilot(pick(["26", "부산광역시"]))).toBe("busan");
    expect(baseQuestionPilot(pick(["47", "경상북도"]))).toBe("yeongcheon");
    expect(baseQuestionPilot({ sido: { code: "47", name: "경상북도" } })).toBe("yeongcheon"); // sigungu 칸 없음
    expect(baseQuestionPilot(pick(["47", "경상북도"], ["47230", "영천시"]))).toBe("yeongcheon");
    expect(baseQuestionPilot(pick(["47", "경상북도"], ["47290", "경산시"]))).toBe("national");
    expect(baseQuestionPilot(pick(["51", "강원특별자치도"]))).toBe("inje");
    expect(baseQuestionPilot(pick(["51", "강원특별자치도"], ["51810", "인제군"]))).toBe("inje");
    expect(baseQuestionPilot(pick(["51", "강원특별자치도"], ["51110", "춘천시"]))).toBe("national");
    expect(baseQuestionPilot(pick(["11", "서울특별시"]))).toBe("national");
    // 지도 첫 화면·대화 이력의 시범 지역은 바뀌지 않는다
    expect(basePilot(pick(["47", "경상북도"]))).toBe("national");
    expect(basePilot(pick(["51", "강원특별자치도"]))).toBe("national");
  });
  it("보낼 값·이름·특보 맞출 지역 — 가장 아래 단계 하나, 이름은 시·도부터, 읍·면·동이면 그 시·군·구로 특보를 맞춘다", () => {
    const b: BaseRegion = { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" }, emd: { code: "51810250", name: "인제읍" } };
    expect(baseWire(b)).toEqual({ code: "51810250", name: "강원특별자치도 인제군 인제읍", level: "EMD" });
    expect(baseWire(null)).toBeNull();
    expect(baseName(b)).toBe("강원특별자치도 인제군 인제읍");
    expect(baseName(null)).toBe("전국");
    expect(baseName(SIDO("36", "세종특별자치시"))).toBe("세종특별자치시");
    expect(baseKey(b)).toBe("51810250");
    expect(baseKey(null)).toBe("");
    expect(baseTarget(b)).toEqual({ sido: "강원특별자치도", sigungu: "인제군" });
    expect(baseTarget(null)).toBeNull();
    expect(parseBaseWire(baseWire(b))).toEqual(baseWire(b));
  });
});

describe("기상특보 구역 ↔ 기준지역 (lib/wxMatch) — 기상청 실응답 원문", () => {
  it("구역 나누기 — 괄호 안 괄호도 한 구역(전라남도(신안(흑산면제외), 흑산도.홍도)). 대응절차용 시범 지역 표시는 그대로", () => {
    const parts = splitTop("전라남도(신안(흑산면제외), 흑산도.홍도), 제주도(제주도산지, 제주시서부)");
    expect(parts).toEqual(["전라남도(신안(흑산면제외), 흑산도.홍도)", "제주도(제주도산지, 제주시서부)"]);
    const cold = advs("cold");
    const jn = cold.find((a) => a.type === "한파" && a.area.startsWith("전라남도"))!;
    expect(jn.area).toBe("전라남도(담양, 장성, 화순, 보성, 광양, 순천, 함평, 영광(낙월면 제외), 나주동남부, 나주서북부, 곡성북부, 곡성남부, 구례평지)");
    expect(cold.some((a) => /^\s|\)$/.test(a.area) && !a.area.includes("("))).toBe(false); // 예전 파싱의 「 나주동남부」「구례평지)」 같은 조각 없음
    expect(parseArea(jn.area).items).toContain("영광(낙월면제외)");
    expect(cold.filter((a) => a.regionId).map((a) => `${a.type}${a.level}:${a.regionId}`)).toEqual(["한파주의보:inje"]);
    expect(advs("gale").find((a) => a.area.startsWith("전북자치도(군산"))!.id).toBe("KMA-강풍주의보-전북자치도(군산옥도면(어청도제외),군산어청도)");
  });

  it("지금 dev 서버가 받는 현황(바다 구역 풍랑주의보 6건) — 전국 전부, 제주특별자치도는 제주도 바다 구역만, 그 밖은 없음", () => {
    expect(covered("now", null)).toHaveLength(6);
    expect(covered("now", T("제주특별자치도"))).toEqual(["풍랑주의보:제주도남쪽바깥먼바다", "풍랑주의보:제주도남동쪽안쪽먼바다", "풍랑주의보:제주도남서쪽안쪽먼바다"]);
    for (const t of [T("제주특별자치도", "제주시"), T("제주특별자치도", "서귀포시"), T("부산광역시"), T("부산광역시", "해운대구"), T("경상북도"), T("서울특별시"), T("강원특별자치도", "인제군")])
      expect(covered("now", t)).toEqual([]);
  });

  it("시·도 — 기상청 이름(경상북도·강원도·전북자치도·제주도…), 섬 구역, 그 시·도 이름으로 시작하는 바다 구역", () => {
    expect(covered("gale", T("경상북도"))).toEqual([
      "강풍주의보:울릉도.독도",
      "풍랑주의보:동해남부앞바다(경북북부앞바다)",
      "한파주의보:경상북도(영덕, 포항, 울진평지, 경주중북부, 경주동부, 경주남부 제외)",
    ]);
    expect(covered("gale", T("인천광역시"))).toEqual(["강풍주의보:서해5도", "강풍주의보:인천(옹진, 인천영종)", "한파주의보:인천(강화)"]);
    expect(covered("cold", T("강원특별자치도")).map((x) => x.split("(")[0])).toEqual(["한파주의보:강원도"]);
    expect(covered("cold", T("전북특별자치도")).map((x) => x.split("(")[0])).toEqual(["한파주의보:전북자치도"]);
    expect(covered("cold", T("제주특별자치도")).map((x) => x.split("(")[0])).toEqual([
      "강풍주의보:제주도", "풍랑주의보:제주도앞바다", "풍랑주의보:제주도남쪽바깥먼바다", "풍랑주의보:제주도남동쪽안쪽먼바다", "풍랑주의보:제주도남서쪽안쪽먼바다",
    ]);
    // 전남광주통합특별시 — 광주·전라남도 둘 다(전남 이름 바다 구역 포함)
    expect(covered("cold", T("전남광주통합특별시")).map((x) => x.split("(")[0])).toEqual(["강풍주의보:전라남도", "풍랑주의보:서해남부앞바다", "한파주의보:전라남도", "한파주의보:광주"]);
    for (const [s, want] of [["대전광역시", "한파주의보:대전"], ["세종특별자치시", "한파주의보:세종"], ["대구광역시", "한파주의보:대구"], ["충청북도", "한파주의보:충청북도"]])
      expect(covered("cold", T(s))).toEqual([want]);
    expect(covered("cold", T("서울특별시"))).toEqual([]);
    expect(covered("cold", T("부산광역시"))).toEqual([]);
  });

  it("시·군·구 — 시·도 전체 특보, 목록에 그 시·군·구(짧은 이름으로 시작), 목록 끝이 「…제외」면 목록 전체를 뺀 특보(그 시·군·구 전체가 빠진 것이 아니면 덮음)", () => {
    const head = (k: keyof typeof SAMPLE, t: WxTarget) => covered(k, t).map((x) => x.split("(")[0]);
    expect(head("cold", T("강원특별자치도", "인제군"))).toEqual(["한파주의보:강원도"]); // 인제평지·인제산지
    expect(head("cold", T("강원특별자치도", "고성군"))).toEqual(["한파주의보:강원도"]); // 고성산지
    expect(head("cold", T("강원특별자치도", "속초시"))).toEqual([]);
    // 「경상북도(영덕, 포항, 울진평지, 경주중북부, 경주동부, 경주남부 제외)」 = 경상북도에서 동해안 여섯 구역을 뺀 곳
    // (6일 전 d1022 의 「경상북도(청도, 고령, …, 울진산지, 경주서부)」처럼 내륙 — 「…제외」가 목록 전체에 걸린다)
    for (const s of ["영천시", "안동시", "구미시", "경산시"]) expect(head("cold", T("경상북도", s))).toEqual(["한파주의보:경상북도"]);
    for (const s of ["포항시 북구", "포항시 남구", "영덕군"]) expect(head("cold", T("경상북도", s))).toEqual([]); // 시·군 전체가 빠짐
    expect(head("cold", T("경상북도", "경주시"))).toEqual(["한파주의보:경상북도"]); // 경주중북부·동부·남부만 빠지고 경주서부는 남음
    expect(head("cold", T("경상북도", "울진군"))).toEqual(["한파주의보:경상북도"]); // 울진평지만 빠지고 울진산지는 남음
    expect(head("cold", T("경상북도", "울릉군"))).toEqual([]); // 울릉도.독도는 기상청이 따로 쓰는 구역 — 경상북도 특보에 들지 않음
    expect(head("cold", T("경기도", "군포시"))).toEqual(["한파주의보:경기도"]);
    expect(head("cold", T("경기도", "수원시 장안구"))).toEqual([]);
    expect(head("cold", T("충청북도", "청주시 상당구"))).toEqual(["한파주의보:충청북도"]); // 시·도 전체
    expect(head("cold", T("대전광역시", "유성구"))).toEqual(["한파주의보:대전"]); // 광역시 전체 특보는 그 구·군에도
    expect(head("cold", T("인천광역시", "강화군"))).toEqual(["한파주의보:인천"]);
    expect(head("cold", T("인천광역시", "남동구"))).toEqual([]);
    // 「전북자치도(부안위도면, 군산옥도면(어청도 제외), 군산어청도 제외)」 = 전북에서 섬(위도면·옥도면·어청도)을 뺀 곳
    for (const s of ["전주시 완산구", "익산시", "남원시"]) expect(head("cold", T("전북특별자치도", s))).toEqual(["한파주의보:전북자치도"]);
    expect(head("cold", T("전북특별자치도", "군산시"))).toEqual(["한파주의보:전북자치도"]); // 섬(옥도면·어청도)만 빠지고 육지는 남음
    expect(head("cold", T("전북특별자치도", "부안군"))).toEqual(["한파주의보:전북자치도"]); // 위도면만 빠짐
    // 통합 시·도 — 구는 광주 특보, 시·군은 전라남도 특보
    expect(head("cold", T("전남광주통합특별시", "광산구"))).toEqual(["한파주의보:광주"]);
    expect(head("cold", T("전남광주통합특별시", "나주시"))).toEqual(["한파주의보:전라남도"]); // 괄호 안 괄호 뒤의 나주동남부
    expect(head("cold", T("전남광주통합특별시", "신안군"))).toEqual(["강풍주의보:전라남도"]); // 신안(흑산면제외)
    expect(head("cold", T("제주특별자치도", "제주시"))).toEqual(["강풍주의보:제주도"]); // 바다 구역은 시·도 기준일 때만
    // 「…제외」만: 제주도(서귀포시중산간 제외) — 제주시도 서귀포시도 덮는다. 경보 제주도(서귀포시중산간)는 서귀포시만
    expect(head("gale", T("제주특별자치도", "제주시"))).toEqual(["강풍주의보:제주도"]);
    expect(head("gale", T("제주특별자치도", "서귀포시"))).toEqual(["강풍경보:제주도", "강풍주의보:제주도"]);
    // 섬 구역·시·도 이름이 붙은 목록 구역
    expect(head("gale", T("경상북도", "울릉군"))).toEqual(["강풍주의보:울릉도.독도"]);
    expect(head("gale", T("인천광역시", "옹진군"))).toEqual(["강풍주의보:서해5도", "강풍주의보:인천"]);
    expect(head("gale", T("인천광역시", "영종구"))).toEqual(["강풍주의보:인천"]); // 인천영종
    expect(head("gale", T("전남광주통합특별시", "여수시"))).toEqual(["강풍주의보:전라남도"]);
    expect(head("gale", T("충청남도", "보령시"))).toEqual(["강풍주의보:충청남도"]); // 보령(도서제외)·보령도서
    expect(head("gale", T("전북특별자치도", "군산시"))).toEqual(["강풍주의보:전북자치도", "한파주의보:전북자치도"]);
    expect(head("d1022", T("대구광역시", "군위군"))).toEqual(["한파주의보:대구"]);
    expect(head("d1022", T("대구광역시", "중구"))).toEqual([]);
    expect(head("d1022", T("경상북도", "안동시"))).toEqual(["한파주의보:경상북도"]);
    expect(head("d1022", T("경상북도", "포항시 북구"))).toEqual([]); // 포함 목록에 포항 없음
    expect(head("d1022", T("경기도", "양주시"))).toEqual(["한파주의보:경기도"]);
    // 대구청 통보문(같은 날 03:00) — 울릉도.독도는 시·도와 따로, 「…제외」 목록에는 울릉도가 없다
    expect(head("daegu", T("경상북도", "울릉군"))).toEqual(["강풍주의보:울릉도.독도"]);
    expect(head("daegu", T("경상북도", "영천시"))).toEqual(["한파주의보:경상북도"]);
    expect(head("daegu", T("경상북도", "포항시 북구"))).toEqual([]);
    expect(head("daegu", T("경상북도"))).toEqual(["강풍주의보:울릉도.독도", "한파주의보:경상북도"]);
    expect(head("daegu", T("대구광역시", "군위군"))).toEqual(["한파주의보:대구"]);
    // 태풍 날 강풍주의보 「제주도(제주시서부, 제주시북부 제외)」 = 그 두 구역을 뺀 제주도 — 서귀포시 전체·제주시 나머지
    const gale = (t: WxTarget) => head("d1025", t).filter((x) => x.startsWith("강풍"));
    expect(gale(T("제주특별자치도", "서귀포시"))).toEqual(["강풍주의보:제주도"]);
    expect(gale(T("제주특별자치도", "제주시"))).toEqual(["강풍주의보:제주도"]);
  });

  it("사용자 결정의 예 — 「부산」 「경상남도(김해, 양산)」 「강원도(인제평지, 인제산지)」 「서울」", () => {
    expect(wxCovers("부산", T("부산광역시"))).toBe(true);
    expect(wxCovers("부산", T("부산광역시", "해운대구"))).toBe(true);
    expect(wxCovers("부산", T("경상남도", "김해시"))).toBe(false);
    expect(wxCovers("경상남도(김해, 양산)", T("경상남도", "김해시"))).toBe(true);
    expect(wxCovers("경상남도(김해, 양산)", T("경상남도", "창원시 의창구"))).toBe(false);
    expect(wxCovers("경상남도(김해, 양산)", T("부산광역시"))).toBe(false);
    expect(wxCovers("강원도(인제평지, 인제산지)", T("강원특별자치도", "인제군"))).toBe(true);
    expect(wxCovers("강원도(인제평지, 인제산지)", T("강원특별자치도", "고성군"))).toBe(false);
    expect(wxCovers("서울", T("서울특별시", "종로구"))).toBe(true);
    expect(wxCovers("서울", null)).toBe(true);
    // 짧은 이름이 다른 이름의 앞이 아니면 맞추지 않는다(양주 ≠ 남양주), 한 글자 구(중구)는 온이름으로
    expect(wxCovers("경기도(남양주)", T("경기도", "양주시"))).toBe(false);
    expect(wxCovers("경기도(양주)", T("경기도", "남양주시"))).toBe(false);
    expect(sggShort("중구")).toBe("중구");
    expect(sggShort("수원시 장안구")).toBe("수원");
    // 울릉군은 울릉도.독도 구역만 — 경상북도 전체·「…제외」 특보는 덮지 않고, 포함 목록에 울릉도.독도가 있으면 덮음
    expect(wxCovers("울릉도.독도", T("경상북도", "울릉군"))).toBe(true);
    expect(wxCovers("경상북도", T("경상북도", "울릉군"))).toBe(false);
    expect(wxCovers("경상북도(포항 제외)", T("경상북도", "울릉군"))).toBe(false);
    expect(wxCovers("경상북도(울릉도.독도)", T("경상북도", "울릉군"))).toBe(true);
    expect(wxCovers("경상북도", T("경상북도"))).toBe(true);
    expect(wxCovers("경상북도", T("경상북도", "영천시"))).toBe(true);
    // 「…제외」 하나짜리·여럿짜리 모두 목록 전체를 뺀다
    expect(wxCovers("경상북도(포항 제외)", T("경상북도", "포항시 북구"))).toBe(false);
    expect(wxCovers("경상북도(영천, 포항 제외)", T("경상북도", "영천시"))).toBe(false);
    expect(wxCovers("경상북도(영천, 포항 제외)", T("경상북도", "경산시"))).toBe(true);
    expect(kmaSidoNames("전남광주통합특별시", "광산구")).toEqual(["광주"]);
    expect(kmaSidoNames("전남광주통합특별시", "목포시")).toEqual(["전라남도", "전남"]);
  });

  it("T3Q region → 맞출 기준지역 — 이름(시·도부터)·단계로, 지역 없음 = 전국, 이름 없음 = 모름", () => {
    expect(wxTargetOfT3q(undefined)).toBeNull();
    expect(wxTargetOfT3q(null)).toBeNull();
    expect(wxTargetOfT3q({})).toBeNull();
    expect(wxTargetOfT3q(R33_SEOUL)).toEqual(T("서울특별시"));
    expect(wxTargetOfT3q({ admin_code: "4111100000", level: "SIGUNGU", name: "경기도 수원시 장안구" })).toEqual(T("경기도", "수원시 장안구"));
    expect(wxTargetOfT3q({ admin_code: "4111112900", level: "EMD", name: "경기도 수원시 장안구 파장동" })).toEqual(T("경기도", "수원시 장안구"));
    expect(wxTargetOfT3q({ admin_code: "3611010100", level: "EMD", name: "세종특별자치시 반곡동" })).toEqual(T("세종특별자치시"));
    expect(wxTargetOfT3q({ admin_code: "2635010500", name: "부산광역시 해운대구 우동" })).toEqual(T("부산광역시", "해운대구")); // 단계가 없으면 코드로
    expect(wxTargetOfT3q({ admin_code: "2600000000" })).toBeUndefined();
    expect(wxTargetOfT3q("2600000000")).toBeUndefined();
  });

  it("답을 받은 때 특보(wx_seen)의 구역 글 — 특보 id 에서 다시 읽는다", () => {
    for (const a of [...advs("gale"), ...advs("now")] as Advisory[]) {
      expect(a.id).toBe(kmaAdvId(a.type, a.level, a.area));
      const back = seenArea({ id: a.id, type: a.type, level: a.level });
      expect(back).toBe(a.area.replace(/\s/g, ""));
      expect(wxCovers(back!, T("제주특별자치도", "서귀포시"))).toBe(wxCovers(a.area, T("제주특별자치도", "서귀포시")));
    }
    expect(seenArea({ id: "a1", type: "호우", level: "경보" })).toBeNull();
  });
});

// ── 실제 SQL(PGlite)·T3Q 재생 ──
type Jobs = typeof import("@/lib/server/jobs");
type Route = typeof import("@/app/api/agent/jobs/route");
let J: Jobs;
let R: Route;
let sql: { query: (t: string, p?: unknown[]) => Promise<Record<string, unknown>[]> };
const cookies: Record<string, string> = {};
const PW = "Test!pass123";

beforeAll(async () => {
  wx.result = { ok: true, message: "", advisories: advs("gale"), preliminary: [] };
  const db = await import("@/lib/server/db");
  await db.ensureSchema();
  sql = db.db() as never;
  const A = await import("@/lib/server/auth");
  for (const id of ["mois_dsd01", "yc_safety02"]) {
    await A.upsertAccount(id, PW, false);
    const r = await A.login(id, PW, "ua");
    if (!r.ok) throw new Error("login");
    cookies[id] = r.cookie.split(";")[0];
  }
  J = await import("@/lib/server/jobs");
  R = await import("@/app/api/agent/jobs/route");
});

const post = (id: string, body: Record<string, unknown>) =>
  R.POST(new Request("http://x/api/agent/jobs", { method: "POST", headers: { cookie: cookies[id], "content-type": "application/json" }, body: JSON.stringify(body) }));
const row = async (id: string) => (await sql.query("select * from sa_agent_jobs where id = $1", [id]))[0];

describe("질의 접수 라우트 — 기준지역·R33 이 실제로 보내는 요청에", () => {
  it("중앙정부 + 전국 + 「우리 지역은…」 → query_context.region = 서울특별시, 질문 글은 그대로(보낸 글·저장 글 모두)", async () => {
    const q = "우리 지역은 지금 어디가 가장 위험한가요?";
    const res = await post("mois_dsd01", { question: q, source: "USER", condition: { base: null, disasterTypes: [] } });
    expect(res.status).toBe(201);
    const { job } = (await res.json()) as { job: { id: string; question_user: string; question_sent: string } };
    const r = await row(job.id);
    const req = r.request as { question: string; query_context: { region?: unknown } };
    expect(req.query_context.region).toEqual({ admin_code: "1100000000", level: "SIDO", name: "서울특별시" });
    expect(req.question).toBe(q);
    expect(r.question_user).toBe(q);
    expect(r.question_sent).toBe(q);
  });

  it("지자체가 전국을 고르면 「우리 지역…」이어도 지역 없이, 다른 지역을 고르면 그 지역 그대로", async () => {
    const a = await post("yc_safety02", { question: "우리 지역 위험지구는?", source: "USER", condition: { base: null } });
    expect(a.status).toBe(201);
    const ra = await row(((await a.json()) as { job: { id: string } }).job.id);
    expect((ra.request as { query_context: Record<string, unknown> }).query_context).not.toHaveProperty("region");
    const b = await post("yc_safety02", { question: "종로구 침수 이력은?", source: "USER", condition: { base: { code: "11110", name: "서울특별시 종로구", level: "SIGUNGU" } } });
    expect(b.status).toBe(201);
    const rb = await row(((await b.json()) as { job: { id: string } }).job.id);
    expect((rb.request as { query_context: { region: unknown } }).query_context.region).toEqual({ admin_code: "1111000000", level: "SIGUNGU", name: "서울특별시 종로구" });
  });

  it("틀린 기준지역은 400 — 질의를 만들지 않는다", async () => {
    const before = (await sql.query("select count(*)::int as n from sa_agent_jobs"))[0].n;
    for (const base of [{ code: "26350", name: "부산광역시 해운대구", level: "SIDO" }, { code: "26a", name: "부산", level: "SIDO" }, { code: "26", name: "", level: "SIDO" }, "26"]) {
      const res = await post("mois_dsd01", { question: `틀린 기준지역 ${JSON.stringify(base)}`, source: "USER", condition: { base } });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("기준지역 값이 올바르지 않습니다.");
    }
    expect((await sql.query("select count(*)::int as n from sa_agent_jobs"))[0].n).toBe(before);
  });
});

describe("질의 접수 라우트 — AI 모드 점검은 기준지역만(R39)", () => {
  // 입력창 「조건 변경」에 가정 조건을 모두 넣어 둔 화면이 보내는 condition
  const FULL = {
    base: { code: "47230", name: "경상북도 영천시", level: "SIGUNGU" },
    disasterTypes: ["호우"],
    referenceTime: "2020-07-23T10:00:00+09:00",
    period: { from: "2020-07-20", to: "2020-07-26" },
    warningKind: "호우",
    warningLevel: "경보",
    keywords: ["지하차도"],
    conditions: [{ item: "rain_1h", label: "시간 강우", value: 80, unit: "mm" }],
  };
  const sent = async (id: string, body: Record<string, unknown>) => {
    const res = await post(id, body);
    expect(res.status).toBe(201);
    const r = await row(((await res.json()) as { job: { id: string } }).job.id);
    return r.request as { query_context: Record<string, unknown>; weather_warnings?: unknown };
  };
  const AIM_Q = (readFileSync(join(__dirname, "..", "..", "src", "components", "explore", "AiModeModal.tsx"), "utf8").match(/const AIM_Q =\s*"([^"]+)"/) ?? [])[1];

  it("AI_MODE 면 query_context = 기준지역만 — 재난유형·기준시각·발생기간·특보 종류·단계·키워드·강우 조건 없음, 특보는 weather_warnings 로 그대로", async () => {
    const warnings = { items: [{ warning_key: "KMA-호우경보-경상북도", kind: "호우", level: "경보", area: "경상북도" }] };
    const req = await sent("yc_safety02", { question: AIM_Q, source: "AI_MODE", aiMode: { check_id: "CHK-1", trigger: "START", interval_min: 10 }, warnings, condition: FULL });
    expect(req.query_context).toEqual({ region: { admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" } });
    for (const k of ["detail", "period", "reference_time", "disaster_types"]) expect(req.query_context).not.toHaveProperty(k);
    expect(req.weather_warnings).toEqual(warnings);
  });

  it("AI_MODE 가 아니면 가정 조건을 지금처럼 싣는다", async () => {
    const req = await sent("yc_safety02", { question: "R39 대조 — 영천 지하차도 통제 기준은?", source: "USER", condition: FULL });
    for (const k of ["region", "detail", "period", "reference_time", "disaster_types"]) expect(req.query_context).toHaveProperty(k);
  });

  it("R33 영향 없음 — 점검 질문은 「우리 지역」으로 시작하지 않아 전국 기본 계정이 전국으로 보내도 서울로 바뀌지 않는다", async () => {
    expect(AIM_Q).toBeTruthy();
    expect(R33_OUR_REGION.test(AIM_Q!)).toBe(false);
    const req = await sent("mois_dsd01", { question: AIM_Q, source: "AI_MODE", condition: { ...FULL, base: null } });
    expect(req.query_context).toEqual({});
  });

  it("AI_MODE 를 잇달아 두 번 보내면(켜자마자 새로 고침·새 탭) 3초 중복 차단 없이 둘 다 201 · 같은 작업 id", async () => {
    const body = { question: AIM_Q, source: "AI_MODE", aiMode: { check_id: "CHK-2", trigger: "START", interval_min: 10 }, warnings: { items: [] }, condition: { base: { code: "26350", name: "부산광역시 해운대구", level: "SIGUNGU" } } };
    const a = await post("yc_safety02", body);
    const b = await post("yc_safety02", { ...body, aiMode: { ...body.aiMode, check_id: "CHK-3" } });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const ja = ((await a.json()) as { job: { id: string } }).job.id;
    const jb = ((await b.json()) as { job: { id: string } }).job.id;
    expect(jb).toBe(ja);
  });

  it("AI_MODE 가 아니면 3초 중복 차단은 그대로(429)", async () => {
    const body = { question: "R39 대조 — 3초 안에 같은 질문", source: "USER", condition: { base: null } };
    expect((await post("yc_safety02", body)).status).toBe(201);
    expect((await post("yc_safety02", body)).status).toBe(429);
  });
});

describe("재사용 기준(D5) — 작업의 기준지역에 특보가 발효 중인지 같은 함수(wxCovers)로", () => {
  const RAW = { status: "SUCCESS", result: { answer: "재사용 시험 답" }, meta: { base_time: "2026-10-28T06:00:00+09:00" } };
  const answered = async (a: Account, question: string, qc: Record<string, unknown>) => {
    const j = await J.submitJob(a, { question, source: "USER", queryContext: qc, noCache: true });
    await sql.query("update sa_agent_jobs set state = 'DONE', t3q_status = 'SUCCESS', http_status = 200, raw = $2, finished_at = now() - interval '2 hours' where id = $1", [j.id, JSON.stringify(RAW)]);
    return j.id;
  };
  const reused = async (a: Account, question: string, region: unknown) => {
    const qc = region ? { region } : {};
    const src = await answered(a, question, qc);
    const j = await J.submitJob(a, { question, source: "USER", queryContext: qc });
    return j.cached_from === src;
  };
  // 슬롯이 차지 않게 시험마다 진행 작업을 비운다(이 묶음은 재사용 판단만 본다)
  const clear = () => sql.query("update sa_agent_jobs set state = 'CANCELLED', finished_at = now() - interval '10 minutes' where state in ('QUEUED','SUBMITTED','RUNNING')");

  it("특보가 덮는 기준지역(인제군 한파주의보·영천시 「…제외」 한파주의보·울릉군 강풍주의보·제주특별자치도·인천 옹진군)은 2시간 전 답을 다시 쓰지 않는다", async () => {
    for (const [i, region] of [
      { admin_code: "5181000000", level: "SIGUNGU", name: "강원특별자치도 인제군" },
      { admin_code: "4723000000", level: "SIGUNGU", name: "경상북도 영천시" },
      { admin_code: "4794000000", level: "SIGUNGU", name: "경상북도 울릉군" },
      { admin_code: "5000000000", level: "SIDO", name: "제주특별자치도" },
      { admin_code: "2872033000", level: "EMD", name: "인천광역시 옹진군 백령면" },
    ].entries()) {
      await clear();
      expect(await reused(MOIS, `D5 특보 발효 ${i}`, region)).toBe(false);
    }
  });

  it("특보가 덮지 않는 기준지역(포항시 북구 — 경상북도 한파주의보 「…제외」 목록에 있음, 서울특별시, R33 서울)은 24시간 안 답을 다시 쓴다", async () => {
    for (const [i, region] of [
      { admin_code: "4711300000", level: "SIGUNGU", name: "경상북도 포항시 북구" },
      { admin_code: "1111000000", level: "SIGUNGU", name: "서울특별시 종로구" },
      R33_SEOUL,
    ].entries()) {
      await clear();
      expect(await reused(YC, `D5 특보 없음 ${i}`, region)).toBe(true);
    }
  });

  it("전국(지역 없음)은 어느 지역이든 특보가 있으면 1시간 기준, 지역 이름을 읽을 수 없으면 24시간 그대로", async () => {
    await clear();
    expect(await reused(MOIS, "D5 전국", null)).toBe(false);
    await clear();
    expect(await reused(MOIS, "D5 이름 없는 지역", { admin_code: "5181000000" })).toBe(true);
  });
});
