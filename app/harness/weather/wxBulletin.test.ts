// 하네스 — 기상특보 상세(개발 서버 KmaClient·WeatherStations·kjw 998facb 를 옮긴 것)의 순수 함수
//  · 통보문(getWthrWrnMsg) 해석: 칸 그대로 · 03(NODATA) = 빈 목록 · 그 밖의 코드 = 오류 · 발표시각 없는 줄은 버린다
//  · 상태 이력 = 해당구역(t2)·발효시각(t3) 같은 번호 줄 · 기준지역으로 거르기(lib/wxMatch 와 같은 규칙)
//  · 지점 고르기(기준지역 시·도를 맡는 지방청 + 본청) · 통보문 열쇠
//  · 「이 특보로 질의」 기준지역: 한 곳 = 시·군·구 · 여럿 = 시·도 · 바다 = 없음(지금 기준지역 그대로) · 세션 기준지역은 그대로(submitBody)
// 네트워크 없음 — 응답은 실제 응답(2026-11-06) 꼴을 줄인 고정 자료(kma_wrnmsg_sample.json)
// npx vitest run harness/weather/wxBulletin
import { describe, expect, it } from "vitest";
import sample from "./kma_wrnmsg_sample.json";
import { bulletinSteps, coveringStations, kmaStamp, parseBulletinKey, parseWrnMsg, stepState, stepsFor } from "@/lib/wxBulletin";
import { resolveAskRegion } from "@/lib/wxAskRegion";
import { isSeaArea } from "@/lib/wxMatch";
import { submitBody, type Cond } from "@/lib/session";
import type { AreaPick } from "@/lib/baseRegion";

const SIDOS: AreaPick[] = [
  { code: "11", name: "서울특별시" }, { code: "26", name: "부산광역시" }, { code: "28", name: "인천광역시" }, { code: "41", name: "경기도" },
  { code: "46", name: "전라남도" }, { code: "47", name: "경상북도" }, { code: "48", name: "경상남도" }, { code: "50", name: "제주특별자치도" }, { code: "51", name: "강원특별자치도" },
];
const SGG: Record<string, AreaPick[]> = {
  "51": [{ code: "51810", name: "인제군" }, { code: "51820", name: "고성군" }, { code: "51190", name: "태백시" }],
  "48": [{ code: "48250", name: "김해시" }, { code: "48330", name: "양산시" }],
  "47": [{ code: "47230", name: "영천시" }, { code: "47940", name: "울릉군" }, { code: "47111", name: "포항시 남구" }, { code: "47113", name: "포항시 북구" }, { code: "47190", name: "구미시" }],
  "28": [{ code: "28720", name: "옹진군" }, { code: "28110", name: "중구" }],
};
const sgg = (c: string) => SGG[c] ?? null;

describe("통보문 해석 (getWthrWrnMsg)", () => {
  const rows = parseWrnMsg(sample, "108");
  it("칸 그대로 · 발표시각 없는 줄은 버린다 · 시각 칸만 ISO(+09:00)", () => {
    expect(rows.map((r) => r.key)).toEqual(["108|202611061200|35", "108|202611061100|34", "108|202611060900|33"]);
    const b = rows[0];
    expect(b).toMatchObject({ stnId: "108", stnName: "서울", areaLabel: "전국", seq: 35, title: "풍랑주의보 발표", announcedAt: "2026-11-06T12:00:00+09:00", statusAt: "2026-11-06T21:00:00+09:00", note: "o 없음" });
    expect(b.body).toBe("(1) 풍랑주의보 발표\n  o 해제 예고: 7일 오전(09시~12시)");
    expect(rows[2].statusAt).toBeNull(); // t5 = 0 → 빈 칸
  });
  it("03(NODATA)은 빈 목록, 그 밖의 오류 코드는 오류", () => {
    expect(parseWrnMsg({ response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } }, "159")).toEqual([]);
    expect(() => parseWrnMsg({ response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } }, "159")).toThrow(/30/);
    expect(() => parseWrnMsg(null, "159")).toThrow();
  });
  it("item 이 하나면 객체로 온다", () => {
    const one = { response: { header: { resultCode: "00" }, body: { items: { item: { stnId: "159", tmFc: 202611061000, tmSeq: 7, t1: "강풍주의보 발표" } } } } };
    expect(parseWrnMsg(one, "159").map((b) => [b.key, b.stnName, b.areaLabel])).toEqual([["159|202611061000|7", "부산", "부산·울산·경상남도"]]);
  });
  it("kmaStamp — 12자리만", () => {
    expect(kmaStamp(202611061200)).toBe("2026-11-06T12:00:00+09:00");
    expect(kmaStamp(0)).toBeNull();
    expect(kmaStamp("2026110612")).toBeNull();
  });
});

describe("상태 이력 (해당구역·발효시각 줄)", () => {
  const rows = parseWrnMsg(sample, "108");
  const steps = rows.flatMap(bulletinSteps);
  it("번호별로 나누고 같은 번호의 발효시각을 붙인다 · 이어진 줄은 앞 줄에", () => {
    expect(steps.map((s) => [s.title, s.at])).toEqual([
      ["풍랑주의보 발표", "2026년 11월 06일 15시 00분"],
      ["강풍주의보 발표", "2026년 11월 06일 11시 00분"],
      ["풍랑경보 변경", "2026년 11월 06일 13시 00분"],
      ["한파주의보 발표", "2026년 11월 06일 21시 00분"],
      ["호우경보 해제", "2026년 11월 06일 09시 00분"],
    ]);
    expect(steps[3].areas).toBe("경기도(가평, 양평서부), 강원도(태백, 인제평지, 인제산지), 경상북도(구미, 영천)");
    expect(steps[1].areas).toBe("전라남도(여수, 고흥남부, 완도(여서도 제외))");
  });
  it("기준지역으로 거른다 — 전국 = 모두 · 인제군 = 한파 · 부산 = 호우 해제 · 영천시 = 이어진 줄의 경상북도(영천)", () => {
    expect(stepsFor(steps, null)).toHaveLength(5);
    expect(stepsFor(steps, { sido: "강원특별자치도", sigungu: "인제군" }).map((s) => s.title)).toEqual(["한파주의보 발표"]);
    expect(stepsFor(steps, { sido: "부산광역시" }).map((s) => s.title)).toEqual(["호우경보 해제"]);
    expect(stepsFor(steps, { sido: "경상북도", sigungu: "영천시" }).map((s) => s.title)).toEqual(["한파주의보 발표"]);
    expect(stepsFor(steps, { sido: "서울특별시" })).toEqual([]);
  });
  it("단계 색 — 해제 = 회색, 변경·발표 = 노랑", () => {
    expect(["호우경보 해제", "풍랑경보 변경", "강풍주의보 발표"].map(stepState)).toEqual(["ended", "changed", "raised"]);
  });
});

describe("지점 · 열쇠", () => {
  it("기준지역 시·도를 맡는 지방청 + 본청(108). 전국이면 열 곳", () => {
    expect(coveringStations("26").map((s) => s.stnId)).toEqual(["108", "159"]);
    expect(coveringStations("51810").map((s) => s.stnId)).toEqual(["108", "105"]);
    expect(coveringStations("47").map((s) => s.stnId)).toEqual(["108", "143"]);
    expect(coveringStations(null)).toHaveLength(10);
  });
  it("열쇠 검사", () => {
    expect(parseBulletinKey("108|202611061200|35")).toEqual({ stnId: "108", tmFc: "202611061200", seq: 35 });
    expect(parseBulletinKey("108|2026|35")).toBeNull();
    expect(parseBulletinKey("../x")).toBeNull();
    expect(parseBulletinKey(null)).toBeNull();
  });
});

describe("「이 특보로 질의」 기준지역 (kjw 998facb)", () => {
  const r = (area: string) => resolveAskRegion(area, SIDOS, sgg);
  it("한 곳이면 그 시·군·구", () => {
    expect(r("강원도(인제평지, 인제산지)")).toEqual({ sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } });
    expect(r("경상북도(영천)")).toEqual({ sido: { code: "47", name: "경상북도" }, sigungu: { code: "47230", name: "영천시" } });
    expect(r("인천(옹진)")?.sigungu?.code).toBe("28720");
  });
  it("여럿이면 아우르는 시·도 · 괄호 없으면 시·도 · 「…제외」 · 읽을 수 없는 구역이 섞이면 시·도", () => {
    expect(r("경상남도(김해, 양산)")).toEqual({ sido: { code: "48", name: "경상남도" } });
    expect(r("부산")).toEqual({ sido: { code: "26", name: "부산광역시" } });
    expect(r("경상북도(영덕, 포항, 울진평지 제외)")).toEqual({ sido: { code: "47", name: "경상북도" } });
    expect(r("인천(옹진, 인천영종)")).toEqual({ sido: { code: "28", name: "인천광역시" } }); // 영종 = 중구 안 섬 — 시·군·구 이름으로 읽을 수 없다
    expect(r("경상북도(포항)")).toEqual({ sido: { code: "47", name: "경상북도" } }); // 포항시 남구·북구 — 하나로 고를 수 없다
  });
  it("섬 구역은 속한 시·군", () => {
    expect(r("울릉도.독도")).toEqual({ sido: { code: "47", name: "경상북도" }, sigungu: { code: "47940", name: "울릉군" } });
    expect(r("서해5도")?.sigungu?.code).toBe("28720");
  });
  it("바다 구역 · 모르는 구역 = null(지금 기준지역 그대로)", () => {
    expect(r("동해중부앞바다")).toBeNull();
    expect(r("서해남부앞바다(전남북부서해앞바다)")).toBeNull();
    expect(r("제주도남쪽바깥먼바다")).toBeNull();
    expect(r("어딘가")).toBeNull();
    expect(isSeaArea("동해중부안쪽먼바다")).toBe(true);
    expect(isSeaArea("강원도(인제평지)")).toBe(false);
  });
  it("시·군·구 목록을 받지 못하면 시·도까지만", () => {
    expect(resolveAskRegion("강원도(인제평지)", SIDOS, () => null)).toEqual({ sido: { code: "51", name: "강원특별자치도" } });
  });
});

describe("질의 본문 — 이 질문에만 싣는 기준지역·조건(submitBody)", () => {
  const cond: Cond = { base: { sido: { code: "26", name: "부산광역시" } }, region: "busan", disasterType: "호우" };
  it("base 가 있으면 그 지역, 세션 조건은 그대로 두고 특보 종류·단계만 덮는다", () => {
    const b = submitBody(cond, { question: "q", source: "QUICK", base: { sido: { code: "51", name: "강원특별자치도" }, sigungu: { code: "51810", name: "인제군" } }, condPatch: { warningKind: "호우", warningLevel: "주의보" } });
    expect(b.condition.base).toEqual({ code: "51810", name: "강원특별자치도 인제군", level: "SIGUNGU" });
    expect(b.condition).toMatchObject({ disasterTypes: ["호우"], warningKind: "호우", warningLevel: "주의보" });
    expect(b).not.toHaveProperty("base");
    expect(b).not.toHaveProperty("condPatch");
    expect(cond.base?.sido.code).toBe("26"); // 세션 조건은 바뀌지 않는다
  });
  it("base 가 없으면 세션 기준지역, null 이면 전국", () => {
    expect(submitBody(cond, { question: "q", source: "USER" }).condition.base).toEqual({ code: "26", name: "부산광역시", level: "SIDO" });
    expect(submitBody(cond, { question: "q", source: "QUICK", base: null }).condition.base).toBeNull();
  });
});
