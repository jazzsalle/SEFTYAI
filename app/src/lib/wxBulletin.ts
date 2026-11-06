/**
 * 기상특보 통보문 (기상청 기상특보 조회서비스 getWthrWrnMsg) — 특보 상세 창의 「최근 통보문」·「상태 이력」이 쓴다.
 * 개발 서버(nia_ai-backend) KmaClient.GetBulletinsAsync · WeatherStations · WeatherService 를 옮겼다.
 *  · 통보문은 지점(stnId) 단위로 온다(stnId 필수). 108(전국) 하나로는 모자라 지방청 열 곳을 모두 받는다(개발 서버 2026-10-28 확인 — 지방청만 낸 통보문이 있다)
 *  · 기준지역을 맡는 지방청과 본청(전국)만 고른다 — 부산 담당자에게 강원도 통보문을 섞지 않는다. 전국이면 모두
 *  · 칸(t1~t7·other)은 기상청이 적어 보낸 글 그대로 둔다(고치거나 합치지 않음 — R25). 시각 칸(tmFc·t5)만 ISO 로 읽는다
 *  · 상태 이력 = 통보문의 해당구역(t2)·발효시각(t3) 줄「(1) 강풍주의보 발표 : 전라남도(여수, …)」 — 구역 글이 특보 현황과 같은 꼴이라 lib/wxMatch 로 기준지역과 맞춘다.
 *    (개발 서버는 특보코드 getPwnCd 를 DB 에 쌓고 wx_area_map 으로 맞추지만, 여기에는 그 표가 없다)
 * 이 파일은 import 가 타입·순수 함수뿐이라 화면·서버·하네스가 함께 쓴다.
 */
import type { BaseRegion } from "./baseRegion";
import { splitTop, wxCovers, type WxTarget } from "./wxMatch";

/** 통보문을 내는 지점 하나 — sido = 맡는 시·도 법정동 코드 앞 두 자리(옛 코드·새 코드 함께). 비어 있으면 전국 */
export interface WxStation {
  stnId: string;
  name: string;
  /** 특보해당구역 — 화면에 그대로 적는다 */
  areaLabel: string;
  sido: string[];
}

/** 활용가이드 「첨부. 지점코드」 — 개발 서버 WeatherStations.All 그대로 */
export const WX_STATIONS: WxStation[] = [
  { stnId: "108", name: "서울", areaLabel: "전국", sido: [] },
  { stnId: "109", name: "서울", areaLabel: "서울·인천·경기도", sido: ["11", "23", "28", "41"] },
  { stnId: "159", name: "부산", areaLabel: "부산·울산·경상남도", sido: ["21", "26", "31", "48"] },
  { stnId: "143", name: "대구", areaLabel: "대구·경상북도", sido: ["22", "27", "47"] },
  { stnId: "156", name: "광주", areaLabel: "광주·전라남도", sido: ["12", "24", "29", "46"] },
  { stnId: "146", name: "전주", areaLabel: "전북자치도", sido: ["45", "52"] },
  { stnId: "133", name: "대전", areaLabel: "대전·세종·충청남도", sido: ["25", "30", "36", "44"] },
  { stnId: "131", name: "청주", areaLabel: "충청북도", sido: ["43"] },
  { stnId: "105", name: "강릉", areaLabel: "강원도", sido: ["42", "51"] },
  { stnId: "184", name: "제주", areaLabel: "제주도", sido: ["49", "50"] },
];

export const wxStation = (stnId: string) => WX_STATIONS.find((s) => s.stnId === stnId);

/** 기준지역 시·도 코드(앞 두 자리)를 맡는 지점 — 늘 108(전국)이 함께 든다. 코드가 없으면(전국) 모두 */
export function coveringStations(sidoCode: string | null | undefined): WxStation[] {
  const c = (sidoCode ?? "").slice(0, 2);
  if (!/^\d\d$/.test(c)) return WX_STATIONS;
  return WX_STATIONS.filter((s) => !s.sido.length || s.sido.includes(c));
}

/** 「202611061200」 → ISO(+09:00). 0·꼴이 아니면 null — 그 칸이 비었다는 뜻 */
export function kmaStamp(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{12}$/.test(s) || /^0+$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`;
}

/** 통보문 한 장 — 기상청 칸 그대로(글 칸은 앞뒤 빈칸만 뗀다) */
export interface WxBulletin {
  /** 「지점|발표시각(12자리)|발표번호」 — 본문을 다시 찾을 때 쓴다 */
  key: string;
  stnId: string;
  stnName: string;
  areaLabel: string;
  /** 발표시각(tmFc) */
  announcedAt: string;
  /** 발표번호(tmSeq — 지점별·월별) */
  seq: number;
  /** 제목(t1) */
  title: string;
  /** 해당구역(t2) */
  areas: string;
  /** 발효시각(t3) — 글로 적힌 시각 */
  effectiveText: string;
  /** 내용(t4) — 비어 오는 일이 흔하다(조회 실패가 아니라 덧붙일 말이 없었다는 뜻) */
  body: string;
  /** 특보발효현황시각(t5) */
  statusAt: string | null;
  /** 특보발효현황내용(t6) */
  statusText: string;
  /** 예비특보(t7) */
  preliminary: string;
  /** 참고사항(other) */
  note: string;
}
/** 목록 한 줄 — 본문은 펼칠 때 한 장씩(목록에 다 실으면 응답이 수십 KB 로 분다) */
export type WxBulletinHead = Pick<WxBulletin, "key" | "stnId" | "stnName" | "areaLabel" | "announcedAt" | "seq" | "title">;
export const bulletinHead = (b: WxBulletin): WxBulletinHead => ({ key: b.key, stnId: b.stnId, stnName: b.stnName, areaLabel: b.areaLabel, announcedAt: b.announcedAt, seq: b.seq, title: b.title });

/** 상태 이력 한 단계 — 통보문 해당구역(t2)·발효시각(t3)의 같은 번호 줄 */
export interface WxStep {
  /** 그 통보문의 열쇠 */
  key: string;
  /** 줄 번호(「(1)」) */
  no: number;
  /** 「강풍주의보 발표」 「풍랑경보 변경」 「호우경보 해제」 — 기상청 글 그대로 */
  title: string;
  /** 구역 글 그대로 — 「전라남도(여수, 고흥남부, 완도(여서도 제외))」 */
  areas: string;
  /** 발효시각 글 그대로 — 「2026년 11월 06일 11시 00분」. 없으면 빈 글자 */
  at: string;
  stnName: string;
  seq: number;
  announcedAt: string;
}

/** GET /api/weather/detail 응답 */
export interface WxDetailResponse {
  ok: boolean;
  /** 받은 시각(서버) */
  fetchedAt: string;
  /** 되짚는 시간 */
  hours: number;
  /** 시연 시나리오를 켠 시연 계정(R45) — 기상청을 부르지 않았다. 통보문·상태 이력이 비어 있는 것은 「없음」이 아니다 */
  realtimeCut?: boolean;
  /** 받지 못한 지점 이름(일부 실패) */
  failed: string[];
  /** 최신순, 최대 BULLETIN_LIMIT 장 */
  bulletins: WxBulletinHead[];
  /** 끊었는가(더 있다) */
  bulletinsMore: boolean;
  /** 받은 통보문 모두의 단계 — 최신순(화면이 기준지역으로 거른다 — stepsFor) */
  steps: WxStep[];
  /** 특보 id → 「이 특보로 질의」에 쓸 기준지역. null = 정할 수 없음(바다 구역 등 — 지금 기준지역 그대로) */
  askRegions: Record<string, BaseRegion | null>;
}

export const DETAIL_HOURS = 24;
export const BULLETIN_LIMIT = 20;
export const STEP_LIMIT = 100;

const str = (v: unknown) => (v == null ? "" : String(v).replace(/\r/g, "").trim());

/** getWthrWrnMsg 응답 → 통보문. 03(NODATA)은 「그 기간에 없음」(오류 아님) → 빈 목록. 그 밖의 코드는 오류 */
export function parseWrnMsg(j: unknown, stnId: string): WxBulletin[] {
  const res = (j as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: unknown } | "" } } } | null)?.response;
  const code = res?.header?.resultCode;
  if (code === "03") return [];
  if (code !== "00") throw new Error(`기상청 통보문 오류 ${code ?? "응답 없음"}: ${res?.header?.resultMsg ?? ""}`.trim());
  const items = res?.body?.items && typeof res.body.items === "object" ? res.body.items.item : undefined;
  const list = (items == null ? [] : Array.isArray(items) ? items : [items]) as Record<string, unknown>[];
  const out: WxBulletin[] = [];
  for (const o of list) {
    const at = kmaStamp(o.tmFc);
    // 발표시각이 없으면 열쇠를 만들 수 없다(번호만으로는 같은 통보문인지 가릴 수 없다)
    if (!at) continue;
    const stn = str(o.stnId) || stnId;
    const seq = Number(o.tmSeq);
    const st = wxStation(stn);
    out.push({
      key: bulletinKey(stn, String(o.tmFc).trim(), Number.isFinite(seq) ? seq : -1),
      stnId: stn,
      stnName: st?.name ?? `지점 ${stn}`,
      areaLabel: st?.areaLabel ?? "",
      announcedAt: at,
      seq: Number.isFinite(seq) ? seq : -1,
      title: str(o.t1),
      areas: str(o.t2),
      effectiveText: str(o.t3),
      body: str(o.t4),
      statusAt: kmaStamp(o.t5),
      statusText: str(o.t6),
      preliminary: str(o.t7),
      note: str(o.other),
    });
  }
  return out;
}

export const bulletinKey = (stnId: string, tmFc: string, seq: number) => `${stnId}|${tmFc}|${seq}`;
/** 열쇠 검사 — 지점 숫자 · 발표시각 12자리 · 번호. 틀리면 null */
export function parseBulletinKey(key: string | null | undefined): { stnId: string; tmFc: string; seq: number } | null {
  const m = /^(\d{2,4})\|(\d{12})\|(-?\d{1,6})$/.exec((key ?? "").trim());
  return m ? { stnId: m[1], tmFc: m[2], seq: Number(m[3]) } : null;
}

/** 「(1) 강풍주의보 발표 : …」 줄들 → 번호별 [제목, 값]. 번호 없이 이어진 줄은 앞 줄에 붙인다. 번호가 하나도 없으면 글 전체를 1번으로 */
function numbered(text: string): Map<number, { title: string; value: string }> {
  const out = new Map<number, { title: string; value: string }>();
  let last: number | null = null;
  for (const line of text.split("\n")) {
    const m = /^\s*\((\d+)\)\s*([^:：]*?)\s*[:：]\s*(.*)$/.exec(line);
    if (m) {
      last = Number(m[1]);
      out.set(last, { title: m[2].trim(), value: m[3].trim() });
    } else if (last != null && line.trim()) {
      const cur = out.get(last)!;
      cur.value = `${cur.value} ${line.trim()}`.trim();
    }
  }
  return out;
}

/** 통보문 한 장 → 상태 이력 단계(해당구역 줄마다 하나, 같은 번호의 발효시각을 붙인다) */
export function bulletinSteps(b: WxBulletin): WxStep[] {
  const areas = numbered(b.areas);
  const times = numbered(b.effectiveText);
  if (!areas.size && b.areas) areas.set(1, { title: b.title, value: b.areas });
  return [...areas.entries()].map(([no, a]) => ({
    key: b.key,
    no,
    title: a.title || b.title,
    areas: a.value,
    at: times.get(no)?.value ?? (times.size === 0 ? b.effectiveText : ""),
    stnName: b.stnName,
    seq: b.seq,
    announcedAt: b.announcedAt,
  }));
}

/** 기준지역을 덮는 단계만(구역 글의 괄호 깊이 0 구역 가운데 하나라도 덮으면) — 특보 줄과 같은 규칙(lib/wxMatch). 전국(null)이면 모두 */
export function stepsFor(steps: WxStep[], target: WxTarget | null): WxStep[] {
  if (!target) return steps;
  return steps.filter((s) => splitTop(s.areas).some((part) => wxCovers(part, target)));
}

/** 상태 이력 단계의 종류 — 화면 색(해제 = 회색, 그 밖 = 노랑) */
export const stepState = (title: string) => (/해제/.test(title) ? "ended" : /변경/.test(title) ? "changed" : "raised");
