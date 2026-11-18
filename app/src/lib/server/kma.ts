import "server-only";
import type { Advisory, RegionId } from "../contract/agent";
import { kmaAdvId, splitTop } from "../wxMatch";
import { isSeaCode, ledgerPwn, parsePwnCd, pwnIso, pwnStampOf, readPwnSummary, zoneArea, type PwnRow, type PwnSummary } from "../wxPwn";

/**
 * 기상청 기상특보 조회서비스 (data.go.kr WthrWrnInfoService) — 개발 서버 KmaClient 를 옮김(2026-11-19 「특보 시각 처리를 개발서버와 같게」)
 * - getPwnCd     : 구역 단위 특보 사건(구역코드·구역 이름·종류·단계·발효 시각 startTime·해제 시각 endTime·발표 시각 tmFc·번호·취소) — 발효 중 특보는 이것을 되짚어 만든다(lib/wxPwn ledgerPwn)
 * - getPwnStatus : 특보발효현황 글(t6 — 현황에 없는 종류·단계는 닫는다, 개발 서버 EffectiveSummary) · 예비특보(t7) · 발표 시각
 * 특보코드를 받지 못하면 예전처럼 특보 현황 글의 구역 묶음으로 낸다(발효·발표 시각 = 현황 한 장의 발표 시각, 구역코드 없음 — 화면은 「미제공」)
 * CORS 미지원 + 키 보호 → 서버 프록시로만 호출
 */
const BASE = "https://apis.data.go.kr/1360000/WthrWrnInfoService";
const serviceKey = () => process.env.KMA_SERVICE_KEY ?? "";

/** 대응절차(SOP) 단계 추천용 시범 지역 표시(regionId) — 기준지역 맞추기는 lib/wxMatch(구역 글 그대로)로 한다 */
const REGION_KEYS: [RegionId, RegExp][] = [
  ["busan", /부산/],
  ["yeongcheon", /영천/],
  ["inje", /인제/],
];
const regionIdOf = (area: string) => REGION_KEYS.find(([, re]) => re.test(area))?.[0];

function kmaTime(v: string | number) {
  const s = String(v);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10) || "00"}:${s.slice(10, 12) || "00"}:00+09:00`;
}

/** "o 호우경보 : 부산, 경상남도(김해, 양산), 강원도(인제평지)" 형태 파싱 — 특보코드를 받지 못했을 때의 대체 */
export function parseStatusText(text: string, issuedAt: string): Advisory[] {
  const out: Advisory[] = [];
  const lines = text.replace(/\r/g, "").split(/\n|(?=o\s)/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^o\s*([가-힣]+?)(주의보|경보)\s*:\s*(.+)$/);
    if (!m) continue;
    const [, type, level, areas] = m;
    // 광역 단위로 분해 : "경상북도(영천, 경산)" → 경상북도(영천, 경산). 괄호 안 괄호(「전라남도(신안(흑산면제외), 흑산도.홍도)」)도 한 구역으로
    const parts = splitTop(areas);
    for (const part of parts) {
      out.push({
        id: kmaAdvId(type, level, part),
        type,
        level: level as "경보" | "주의보",
        area: part,
        regionId: regionIdOf(part),
        issuedAt,
        status: "발효",
      });
    }
  }
  return out;
}

// ── 특보코드조회(getPwnCd) ──
/** 되짚는 날 수 — 개발 서버가 장부를 처음 채울 때(BackfillDays, 상류 상한 60일). DB 장부가 없어 이만큼 처음부터 되짚는다 */
export const PWN_DAYS = 60;
/** 60일 전체를 다시 받는 간격 — 그 사이에는 최근 이틀(개발 서버 LookbackDays)만 1분마다 받아 덧붙인다(1분마다 세 장씩 긁지 않게) */
const PWN_FULL_MS = 10 * 60_000;
const PWN_RECENT_MS = 60_000;
const PWN_RECENT_DAYS = 2;
/** 한 장에 받을 줄 수 · 장 상한(개발 서버 KmaClient PageSize·MaxPages) */
const PWN_PAGE = 1000;
const PWN_MAX_PAGES = 50;

/** KST 날짜(yyyyMMdd) */
export const kmaYmd = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");

/** from~to(yyyyMMdd) 특보 사건 — 끝은 「덜 찬 장」으로 안다(totalCount 를 믿지 않는다 — 개발 서버 2026-10-28) */
async function pwnRange(from: string, to: string): Promise<PwnRow[]> {
  const key = serviceKey();
  if (!key) throw new Error("기상청 API 키 미설정 (KMA_SERVICE_KEY)");
  const rows: PwnRow[] = [];
  for (let page = 1; page <= PWN_MAX_PAGES; page++) {
    const url = `${BASE}/getPwnCd?serviceKey=${key}&dataType=JSON&numOfRows=${PWN_PAGE}&pageNo=${page}&fromTmFc=${from}&toTmFc=${to}`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`기상청 특보코드 응답 ${r.status}`);
    const got = parsePwnCd(await r.json());
    rows.push(...got);
    if (got.length < PWN_PAGE) break;
  }
  return rows;
}

const rowKey = (r: PwnRow) => [r.areaCode, r.warnVar, r.warnStress, r.announced, r.seq, r.start, r.end, r.cancelled].join("|");

let pwnFull: { at: number; p: Promise<PwnRow[]> } | null = null;
let pwnRecent: { at: number; p: Promise<PwnRow[]> } | null = null;

/** 최근 PWN_DAYS 일 특보 사건 — 60일은 10분마다, 최근 이틀은 1분마다 받아 합친다(같은 줄은 하나로). 실패는 캐시하지 않는다 */
export async function fetchPwnRows(now = Date.now()): Promise<PwnRow[]> {
  const to = kmaYmd(now);
  if (!pwnFull || now - pwnFull.at > PWN_FULL_MS) {
    const p = pwnRange(kmaYmd(now - (PWN_DAYS - 1) * 86_400_000), to);
    pwnFull = { at: now, p };
    pwnRecent = null;
    p.catch(() => {
      if (pwnFull?.p === p) pwnFull = null;
    });
  } else if (!pwnRecent ? now - pwnFull.at > PWN_RECENT_MS : now - pwnRecent.at > PWN_RECENT_MS) {
    const p = pwnRange(kmaYmd(now - (PWN_RECENT_DAYS - 1) * 86_400_000), to);
    pwnRecent = { at: now, p };
    p.catch(() => {
      if (pwnRecent?.p === p) pwnRecent = null;
    });
  }
  const full = await pwnFull!.p;
  const recent = pwnRecent ? await pwnRecent.p : [];
  if (!recent.length) return full;
  const seen = new Set(full.map(rowKey));
  return [...full, ...recent.filter((r) => !seen.has(rowKey(r)))];
}

/** 장부 열린 줄 → 특보(구역마다 한 건). 대표 시각(issuedAt) = 발효 시각, 없으면 발표 시각, 둘 다 없으면 현황 시각 */
function pwnAdvisories(rows: PwnRow[], summary: PwnSummary, now: number, fallbackAt: string): Advisory[] {
  return ledgerPwn(rows, summary, pwnStampOf(now))
    // 화면·대응절차 단계 추천이 아는 단계만(중대경보·모르는 코드 「기타(n)」는 아직 발표된 적이 없어 계약에 없다 — 전국 발효 현황 셈에는 든다)
    .filter((w) => w.active && (w.level === "경보" || w.level === "주의보"))
    .map((w) => {
      const area = zoneArea(w.areaCode, w.areaName);
      const effectiveAt = pwnIso(w.effective);
      const announcedAt = pwnIso(w.announced);
      return {
        // 같은 맞추기 글에 구역이 여럿 들 수 있어(「부산」 ← 부산동부·부산서부) 구역코드를 붙인다 — 구역 글은 lib/wxMatch seenArea 가 # 앞만 읽는다
        id: `${kmaAdvId(w.kind, w.level, area)}#${w.areaCode}`,
        type: w.kind,
        level: w.level as Advisory["level"],
        area,
        regionId: regionIdOf(area),
        issuedAt: effectiveAt ?? announcedAt ?? fallbackAt,
        status: "발효" as const,
        areaCode: w.areaCode,
        areaName: w.areaName,
        effectiveAt,
        announcedAt,
        changeType: w.changeType,
        sea: isSeaCode(w.areaCode),
      };
    })
    // 개발 서버 ActiveWarnings 차례 — 구역 이름 · 종류
    .sort((a, b) => a.areaName.localeCompare(b.areaName, "ko") || a.type.localeCompare(b.type, "ko"));
}

type StatusItem = { tmFc: string; tmEf: unknown; t6: string; t7: string } | null;

/** 특보발효현황(getPwnStatus) 한 장 — 없으면 null. 결과 코드가 00 이 아니면 던진다 */
async function fetchStatus(): Promise<StatusItem> {
  const url = `${BASE}/getPwnStatus?serviceKey=${serviceKey()}&pageNo=1&numOfRows=10&dataType=JSON`;
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  const code = j?.response?.header?.resultCode;
  if (code !== "00") throw new Error(j?.response?.header?.resultMsg ?? "응답 오류");
  const item = [j.response.body.items.item].flat()[0];
  return item ? { tmFc: String(item.tmFc), tmEf: item.tmEf, t6: item.t6 ?? "", t7: item.t7 ?? "" } : null;
}

const failMessage = (e: unknown) => (e instanceof Error && e.name === "TimeoutError" ? "기상청 API 응답 지연(TIMEOUT)" : "기상청 API 연결 실패");

export async function fetchLiveAdvisories(now = Date.now()): Promise<{
  ok: boolean;
  message: string;
  advisories: Advisory[];
  preliminary: { text: string; at: string }[];
  /** 특보발효현황 시각(tmEf) */
  statusAt?: string;
}> {
  if (!serviceKey()) return { ok: false, message: "기상청 API 키 미설정 (KMA_SERVICE_KEY)", advisories: [], preliminary: [] };
  const [st, pwn] = await Promise.allSettled([fetchStatus(), fetchPwnRows(now)]);
  // 둘 다 받지 못했으면 조회 실패(「특보 없음」과 섞지 않는다). 현황만 받지 못했으면 개발 서버처럼 현황 맞추기 없이 특보코드 장부만(EffectiveSummary.Unreadable)
  if (st.status === "rejected" && pwn.status === "rejected") return { ok: false, message: failMessage(st.reason), advisories: [], preliminary: [] };
  const item = st.status === "fulfilled" ? st.value : null;
  const at = item ? kmaTime(item.tmFc) : new Date(now).toISOString();
  const statusAt = item ? pwnIso(readPwnSummary("", item.tmEf).at) ?? undefined : undefined;
  if (st.status === "fulfilled" && !item && pwn.status === "rejected") return { ok: true, message: "현재 발효 특보 없음", advisories: [], preliminary: [] };
  const summary: PwnSummary = item ? readPwnSummary(item.t6, item.tmEf) : { understood: false, labels: new Set() };
  const advisories =
    pwn.status === "fulfilled"
      ? pwnAdvisories(pwn.value, summary, now, at)
      : !item || /없\s*음/.test(item.t6)
        ? []
        : parseStatusText(item.t6, at);
  const preliminary = !item || /없\s*음/.test(item.t7)
    ? []
    : item.t7.replace(/\r/g, "").split("\n").map((s) => s.replace(/^o\s*/, "").trim()).filter(Boolean).map((text) => ({ text, at }));
  return {
    ok: true,
    // 유엔이가 센 건수는 보이지 않는다(R25) — 기상청 발표 시각만
    message: !item
      ? "기상청 특보코드 기준"
      : advisories.length ? `기상청 ${at.slice(11, 16)} 발표` : `현재 발효 특보 없음 (기상청 ${at.slice(5, 10).replace("-", ".")} ${at.slice(11, 16)} 발표 기준)`,
    advisories,
    preliminary,
    ...(statusAt ? { statusAt } : {}),
  };
}
