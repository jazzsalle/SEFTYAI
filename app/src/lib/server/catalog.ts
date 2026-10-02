import "server-only";
import summary from "@data/seed/datasets_summary.json";
import { EVENTS, REPORTS_119, SIT_REPORTS } from "./events";
import { MANUALS } from "./manual";
import { RISKS } from "./risk";

type Counts = Record<string, Record<string, number>>;
const C = (summary as unknown as { counts_by_dataset_and_region: Counts }).counts_by_dataset_and_region;
const sumOf = (k: string) => Object.values(C[k] ?? {}).reduce((a, b) => a + b, 0);
const by = (k: string) => C[k] ?? {};

export interface CatalogItem {
  key: string;
  folder: string;
  name: string;
  star: boolean;
  provider: string;
  records: number;
  byRegion: Record<string, number>;
  usedIn: string[];
  status: "반영" | "샘플" | "구조만" | "연계예정";
  note: string;
}

export function catalog(): CatalogItem[] {
  const risk = (cat: string) => RISKS.filter((r) => r.category === cat);
  const rc = (cat: string) => {
    const m: Record<string, number> = {};
    risk(cat).forEach((r) => {
      const k = r.region.sido.includes("부산") ? "부산광역시" : r.region.sigungu;
      m[k] = (m[k] ?? 0) + 1;
    });
    return m;
  };
  return [
    { key: "dl", folder: "9.★ 재해대장_피해위치_복구비", name: "재해대장 (2010~2025) 공공시설 피해·복구비", star: true, provider: "행안부 (김인건 사무관)", records: sumOf("disaster_ledger:재해대장 2010~2025"), byRegion: by("disaster_ledger:재해대장 2010~2025"), usedIn: ["재난사건(재난마스터) 피해·복구", "유사사례", "위험객체 피해 이력"], status: "반영", note: "재난명 → 재난마스터 ID 매핑, 읍면동 단위 피해 이력으로 위험객체에 연결" },
    { key: "rz", folder: "12.★ 재해위험지구 사업 현황", name: "붕괴위험지역·위험저수지·풍수해개선지구 + '26~'30 정비 중기계획", star: true, provider: "행안부 (김인건 사무관)", records: risk("붕괴위험지역").length + risk("위험저수지").length + risk("풍수해개선지구").length, byRegion: Object.fromEntries(["부산광역시", "영천시", "인제군"].map((k) => [k, (rc("붕괴위험지역")[k] ?? 0) + (rc("위험저수지")[k] ?? 0) + (rc("풍수해개선지구")[k] ?? 0)])), usedIn: ["위험·취약지역 어디/왜/언제", "객체 상세 정비계획 탭", "지도"], status: "반영", note: "geojson 좌표 + 정비계획 xlsx 결합 (사업명·사업비·기간·진행상태)" },
    { key: "rv", folder: "13.★ 위험지역_자연재해 및 하천기본계획 구축 목록", name: "하천기본계획 위험요소 추출 (T3Q)", star: true, provider: "T3Q", records: risk("하천위험요소").length, byRegion: rc("하천위험요소"), usedIn: ["하천 상세", "위험·취약지역"], status: "반영", note: "대천천(부산) 위험요소 인스턴스 — 측점 기반 위치 근사" },
    { key: "bg", folder: "15.★ 하천 인근 건축물 지하공간", name: "건축물관리대장 지하공간 (하천 인근)", star: true, provider: "행안부 · 세움터", records: risk("건축물지하공간").length, byRegion: rc("건축물지하공간"), usedIn: ["위험·취약지역(지하공간)", "지도"], status: "샘플", note: "실데이터 미수신 — 표출 방식(지하층 보유 건물 색상·층수) 시연용 샘플" },
    { key: "fp", folder: "16.★ 상습침수지역 및 피해데이터", name: "상습침수지역(필지) · 침수흔적도 · 사유/공공시설 피해 · 풍수해보험", star: true, provider: "행안부 재난영향분석과", records: risk("상습침수지역").length + sumOf("flood_damage:침수흔적도(위선)") + sumOf("flood_damage:풍수해보험 보험금지급(주택)"), byRegion: rc("상습침수지역"), usedIn: ["유사사례 '어디가 잠겼나'", "재난사건 침수흔적·보험", "위험·취약지역"], status: "반영", note: "사유시설 281MB 원본 스트리밍 → 3개 지역 37,658건 읍면동 집계" },
    { key: "up", folder: "17.★ 지하차도 및 전국 캠핑장", name: "지하차도 현황(26.6.10) · 전국 야영장", star: true, provider: "행안부 · 한국관광공사", records: risk("지하차도").length + risk("야영장").length, byRegion: Object.fromEntries(["부산광역시", "영천시", "인제군"].map((k) => [k, (rc("지하차도")[k] ?? 0) + (rc("야영장")[k] ?? 0)])), usedIn: ["지하차도 통제 기준(침수심 15cm)", "계곡 야영장 철수 판단"], status: "반영", note: "방재등급·차단시설·통제기준 침수심 등 실기준 반영" },
    { key: "ls", folder: "18.★ 산사태 취약정보", name: "산사태취약지역 지정 현황", star: true, provider: "산림청 경유", records: risk("산사태취약지역").length, byRegion: rc("산사태취약지역"), usedIn: ["산사태 대피 시점", "지도"], status: "반영", note: "위도/경도 열 뒤바뀜 보정" },
    { key: "fv", folder: "19.★ 홍수취약지구 (기후부)", name: "'26 홍수취약지구 리스트 · 관리카드", star: true, provider: "기후에너지환경부", records: risk("홍수취약지구").length, byRegion: rc("홍수취약지구"), usedIn: ["하천 위험 구간", "대응수위(구포대교 4.31/5.35m 등)"], status: "반영", note: "관리카드 대응수위 → '언제 위험해지나' 실기준" },
    { key: "sr", folder: "20.★ 소하천 전체 목록 (NDMS)", name: "소하천대장 + 인제군 대장·정비계획 비교", star: true, provider: "NDMS 사업단", records: risk("소하천").length, byRegion: rc("소하천"), usedIn: ["소하천·세월교", "지도 소하천구역 레이어"], status: "반영", note: "3개 지역 좌표 공란 → 읍면동 근사 + 브이월드 소하천구역 폴리곤 병행" },
    { key: "f119", folder: "30.★ 소방 신고정보 (260929)", name: "소방긴급구조정보(표준) — 119 신고", star: true, provider: "소방청 (국조실 협력과제)", records: REPORTS_119.length, byRegion: Object.fromEntries(["부산", "영천", "인제"].map((k) => [k, REPORTS_119.filter((r) => r.신고지역명.includes(k)).length])), usedIn: ["119 신고 피드(상황판)", "재난사건 신고 탭", "신고 지점 인근 위험객체"], status: "구조만", note: "21개 표준 항목 그대로 사용 · 값은 실제 피해 지점에 근거한 시연값(원천 신고내용 마스킹 유통)" },
    { key: "man", folder: "지자체 의견수렴 · 풍수해 매뉴얼", name: "부산·영천·인제 풍수해 현장조치 행동매뉴얼", star: false, provider: "3개 지자체", records: MANUALS.reduce((n, m) => n + m.taskCount, 0), byRegion: Object.fromEntries(MANUALS.map((m) => [m.region.split(" ").pop()!, m.taskCount])), usedIn: ["지금 할 일(상황판)", "행동매뉴얼 대응절차", "현장 통제 기준"], status: "반영", note: "단계별 조치·담당·시기·쪽수 / 연락처 제외" },
    { key: "ndms", folder: "인제 NDMS 상황보고서", name: "재난상황 보고서 (NDMS)", star: false, provider: "인제군", records: SIT_REPORTS.length, byRegion: { 실보고서: SIT_REPORTS.filter((s) => !s.synthetic).length, 시연: SIT_REPORTS.filter((s) => s.synthetic).length }, usedIn: ["재난사건 이력", "상황보고 원문"], status: "반영", note: "실보고서 5건(마스킹) + 별지 제1호서식 구조 시연 보고" },
    { key: "ev", folder: "27. 재난코드 정보", name: "재난마스터 (재난유형코드-발생일-순번)", star: false, provider: "재난안전데이터과", records: EVENTS.length, byRegion: { 실사건: EVENTS.filter((e) => !e.synthetic && !e.training).length, 시연: EVENTS.filter((e) => e.synthetic).length }, usedIn: ["사건 단위 신고·피해·복구·침수흔적 묶음", "유사사례"], status: "반영", note: "공식 재난코드(1001 호우, 1005 태풍 …) 사용, NDMS 키 매핑" },
    { key: "gis", folder: "하천 공간정보 · 행정구역", name: "국가기본도 하천(중심선·실폭) · 소하천구역 · 행정동 경계", star: false, provider: "국토지리정보원 · 브이월드 · SGIS", records: 186 + 881 + 808 + 228, byRegion: { 하천: 186, 실폭: 881, 소하천구역: 808, 행정동: 228 }, usedIn: ["지도 하천·경계 레이어", "하천 엔터티 ↔ 대화 연계"], status: "반영", note: "부산·영천·인제만 추출, EPSG:4326 단순화" },
    { key: "kma", folder: "기상청 API", name: "기상특보 조회서비스 (WthrWrnInfoService)", star: false, provider: "기상청 (공공데이터포털)", records: 0, byRegion: {}, usedIn: ["특보 바·특보 탭(실시간 모드)", "AI 모드 자동 점검"], status: "반영", note: "서버 프록시 실연동 · 강우 관측값은 T3Q ASOS/AWS 결합 예정" },
  ];
}

export function catalogSummary() {
  const items = catalog();
  return {
    datasets: items.length,
    riskObjects: RISKS.length,
    events: EVENTS.length,
    reports119: REPORTS_119.length,
    manualTasks: MANUALS.reduce((n, m) => n + m.taskCount, 0),
  };
}
