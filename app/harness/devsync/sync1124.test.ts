// 하네스 — 개발서버 6ff5b1d..origin/dev 옮김(2026-11-24): 질의 조건·특보 참조·기상정보문·새 배포본 새로고침
//  · 67617f2 기상·수문 조건 observed_at · 810fe49 특보·통보문 참조 · 74974d2 기상정보문 · 1c4ea03·0247dbf 「이 특보로 질의」 조건 되돌림 · f668628 새로고침
// npx vitest run harness/devsync/sync1124
import { describe, expect, it } from "vitest";
import type { Account } from "@/lib/config";
import type { Advisory, WeatherResponse } from "@/lib/contract/agent";
import { toKstIso } from "@/lib/format";
import { buildQueryContext } from "@/lib/server/queryContext";
import { cacheKeyOf } from "@/lib/server/jobs";
import { aimWarningsPayload, bulletinText, latestBulletinKeys, toRefBulletin, toRefInfo, warningsPayload } from "@/lib/wxref";
import { latestInfos, parseWthrInfo, type WxBulletin, type WxInfo } from "@/lib/wxBulletin";
import { condReset, hasInputCond } from "@/lib/dialogue";
import { isChunkError, isNewer } from "@/lib/appUpdate";

const acc = { id: "busan", role: "지자체", region: "busan" } as unknown as Account;
const BASE = { code: "26", name: "부산광역시", level: "SIDO" };

describe("기상·수문 조건 observed_at(개발서버 67617f2)", () => {
  it("toKstIso — PC 시간대와 상관없이 한국 시간 +09:00", () => {
    expect(toKstIso(new Date("2026-11-20T00:10:00Z"))).toBe("2026-11-20T09:10:00+09:00");
  });

  it("조건 창에서 적용한 시각이 있으면 그것을, 없거나 꼴이 틀리면 보내는 시각을 — 칸은 item·label·value·unit·source_type·observed_at 만", () => {
    const now = new Date("2026-11-24T01:00:00Z");
    const qc = buildQueryContext(acc, {
      base: BASE,
      conditions: [
        { item: "RAIN_1H", label: "1시간 강우량", value: 50, unit: "mm", observedAt: "2026-11-24T09:30:00+09:00" },
        { item: "WATER_LEVEL", label: "하천 수위", value: 3.2, unit: "m" },
        { item: "FLOW", label: "하천 유량", value: 900, unit: "m³/s", observedAt: "어제" },
      ],
    }, undefined, now);
    expect((qc.detail as { conditions: unknown[] }).conditions).toEqual([
      { item: "RAIN_1H", label: "1시간 강우량", value: 50, unit: "mm", source_type: "MANUAL", observed_at: "2026-11-24T09:30:00+09:00" },
      { item: "WATER_LEVEL", label: "하천 수위", value: 3.2, unit: "m", source_type: "MANUAL", observed_at: "2026-11-24T10:00:00+09:00" },
      { item: "FLOW", label: "하천 유량", value: 900, unit: "m³/s", source_type: "MANUAL", observed_at: "2026-11-24T10:00:00+09:00" },
    ]);
  });

  it("작업 열쇠는 observed_at 이 달라도 같다(진행 중 합류가 깨지지 않게)", () => {
    const qc = (at: string) => ({ region: { admin_code: "2600000000" }, detail: { conditions: [{ item: "RAIN_1H", value: 50, observed_at: at }] } });
    const k = (at: string) => cacheKeyOf({ question: "q", source: "USER", queryContext: qc(at) });
    expect(k("2026-11-24T10:00:00+09:00")).toBe(k("2026-11-24T10:00:05+09:00"));
  });
});

const now = "2026-11-24T10:00:00+09:00";
const WX: WeatherResponse = { mode: "live", status: { ok: true, fetchedAt: now, message: "" }, advisories: [], preliminary: [] };
const ADV: Advisory = { id: "KMA-호우경보-부산", type: "호우", level: "경보", area: "부산", issuedAt: now, status: "발효" };
const B = (stnId: string, at: string, seq: number): WxBulletin => ({
  key: `${stnId}|${at.replace(/\D/g, "").slice(0, 12)}|${seq}`, stnId, stnName: stnId === "159" ? "부산" : "서울", areaLabel: "", announcedAt: at, seq,
  title: "호우경보 발표", areas: "부산", effectiveText: "2026년 11월 24일 10시 00분", body: "", statusAt: null, statusText: "o 호우경보 : 부산", preliminary: "", note: "",
});

describe("특보·통보문·기상정보문 참조(개발서버 810fe49·74974d2)", () => {
  it("AI 모드 창 질의 — 발효 특보가 없으면 칸을 싣지 않고(null), 있으면 모두 한 번에", () => {
    expect(aimWarningsPayload(WX, [])).toBeNull();
    const p = aimWarningsPayload(WX, [ADV, { ...ADV, id: "KMA-강풍주의보-부산", type: "강풍", level: "주의보" }])!;
    expect(p.items.map((i) => i.warning_key)).toEqual(["KMA-호우경보-부산", "KMA-강풍주의보-부산"]);
    expect(p).not.toHaveProperty("bulletins");
    expect(p).not.toHaveProperty("weather_info");
  });

  it("「이 특보로 질의」 — 그 특보 1건과 통보문 전문·기상정보문(「기상정보(예보)」)을 함께, 비면 칸을 싣지 않는다", () => {
    const b = B("159", now, 12);
    const info: WxInfo = { key: "159|202611240900|3", stnId: "159", stnName: "부산", announcedAt: "2026-11-24T09:00:00+09:00", seq: 3, text: "< 강수 현황과 전망 >\n○ (현황) 부산 30mm" };
    const p = warningsPayload(WX, [ADV], { bulletins: [toRefBulletin(b)], weatherInfo: [toRefInfo(info)] });
    expect(p.items).toHaveLength(1);
    expect(p.bulletins).toEqual([{ stn_name: "부산", announced_at: now, seq: 12, title: "호우경보 발표", text: "제목: 호우경보 발표\n해당구역: 부산\n발효시각: 2026년 11월 24일 10시 00분\n특보발효현황내용: o 호우경보 : 부산" }]);
    expect(p.weather_info).toEqual([{ label: "기상정보(예보)", stn_name: "부산", announced_at: "2026-11-24T09:00:00+09:00", seq: 3, text: info.text }]);
    const bare = warningsPayload(WX, [ADV], { bulletins: [], weatherInfo: [] });
    expect(bare).not.toHaveProperty("bulletins");
    expect(bare).not.toHaveProperty("weather_info");
  });

  it("bulletinText — 빈 칸은 건너뛰고 글은 손대지 않는다", () => {
    expect(bulletinText({ ...B("108", now, 1), body: "  ", note: "유의" })).toBe("제목: 호우경보 발표\n해당구역: 부산\n발효시각: 2026년 11월 24일 10시 00분\n특보발효현황내용: o 호우경보 : 부산\n참고사항: 유의");
  });

  it("latestBulletinKeys — 관서마다 가장 최근 한 장, 최신순, 최대 3관서", () => {
    const list = [B("159", "2026-11-24T08:00:00+09:00", 1), B("159", "2026-11-24T09:00:00+09:00", 2), B("108", "2026-11-24T07:00:00+09:00", 5), B("143", "2026-11-24T06:00:00+09:00", 1), B("156", "2026-11-24T05:00:00+09:00", 1)];
    expect(latestBulletinKeys(list)).toEqual([list[1].key, list[2].key, list[3].key]);
  });

  it("parseWthrInfo · latestInfos — 03 은 빈 목록, 발표시각·본문 없는 것은 뺌, 12시간 안 최신 3장", () => {
    expect(parseWthrInfo({ response: { header: { resultCode: "03" } } }, "159")).toEqual([]);
    expect(() => parseWthrInfo({ response: { header: { resultCode: "30", resultMsg: "키 오류" } } }, "159")).toThrow("기상청 기상정보문 오류 30");
    const rows = parseWthrInfo({ response: { header: { resultCode: "00" }, body: { items: { item: [
      { stnId: "159", tmFc: 202611240900, tmSeq: 3, t1: "< 강수 현황과 전망 >\r\n○ 부산" },
      { stnId: "159", tmFc: 202611231800, tmSeq: 2, t1: "옛 전망" },
      { stnId: "108", tmFc: 202611240800, tmSeq: 7, t1: "전국 전망" },
      { stnId: "108", tmFc: 202611240700, tmSeq: 6, t1: "" },
      { stnId: "108", tmFc: 202611240600, tmSeq: 5, t1: "새벽 전망" },
      { stnId: "108", tmFc: 202611240500, tmSeq: 4, t1: "그 전 전망" },
    ] } } } }, "159");
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ key: "159|202611240900|3", stnName: "부산", announcedAt: "2026-11-24T09:00:00+09:00", text: "< 강수 현황과 전망 >\n○ 부산" });
    const picked = latestInfos(rows, Date.parse("2026-11-24T10:00:00+09:00"));
    expect(picked.map((r) => r.seq)).toEqual([3, 7, 5]);
  });
});

describe("「이 특보로 질의」 조건 되돌림(개발서버 1c4ea03·0247dbf)", () => {
  it("condReset — 재난유형·상세를 비우고 발생기간은 최근 한 달(정시), 기준지역은 건드리지 않는다", () => {
    const r = condReset();
    expect(r).not.toHaveProperty("base");
    expect([r.disasterType, r.warningKind, r.warningLevel, r.keywords, r.conditions, r.referenceTime]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    const to = new Date(r.periodTo!);
    expect(to.getMinutes()).toBe(0);
    const from = new Date(r.periodFrom!);
    expect(to.getTime() - from.getTime()).toBeGreaterThan(27 * 86_400_000);
  });

  it("hasInputCond — 재난유형·기간 없음·특보·키워드·수치가 있으면 참, 기본 조건이면 거짓", () => {
    const d = condReset();
    expect(hasInputCond(d)).toBe(false);
    expect(hasInputCond({ ...d, disasterType: "호우" })).toBe(true);
    expect(hasInputCond({ ...d, disasterType: "전체" })).toBe(false);
    expect(hasInputCond({ ...d, periodFrom: undefined, periodTo: undefined })).toBe(true);
    expect(hasInputCond({ ...d, warningKind: "호우" })).toBe(true);
    expect(hasInputCond({ ...d, conditions: [{ item: "RAIN_1H", value: 1 }] })).toBe(true);
  });
});

describe("새 배포본 새로고침(개발서버 f668628)", () => {
  it("isNewer — 읽지 못한 값·dev 는 새 판으로 보지 않는다", () => {
    expect(isNewer(null, "a")).toBe(false);
    expect(isNewer("a", "dev")).toBe(false);
    expect(isNewer("dev", "a")).toBe(false);
    expect(isNewer("a", "a")).toBe(false);
    expect(isNewer("b", "a")).toBe(true);
  });

  it("isChunkError — 옛 조각을 못 찾은 지연 로딩 실패만", () => {
    expect(isChunkError({ name: "ChunkLoadError", message: "x" })).toBe(true);
    expect(isChunkError(new Error("Loading chunk 123 failed."))).toBe(true);
    expect(isChunkError(new Error("다른 오류"))).toBe(false);
    expect(isChunkError(null)).toBe(false);
  });
});
