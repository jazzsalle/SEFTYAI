import "server-only";
import type { Account } from "../config";
import type { Advisory } from "../contract/agent";
import type { AreaPick, BaseRegion } from "../baseRegion";
import { resolveAskRegion } from "../wxAskRegion";
import { ISLANDS, parseArea } from "../wxMatch";
import {
  BULLETIN_LIMIT, DETAIL_HOURS, INFO_HOURS, STEP_LIMIT, bulletinHead, bulletinKey, bulletinSteps, coveringStations, latestInfos, parseBulletinKey, parseWrnMsg, parseWthrInfo, scenarioSteps, wxStation,
  type WxBulletin, type WxDetailResponse, type WxInfo,
} from "../wxBulletin";
import { countPwn, ledgerPwn, pwnStampOf, pwnSteps, type PwnWarning } from "../wxPwn";
import { fetchPwnRows, kmaYmd } from "./kma";
import { adminAreas } from "./vworldAdmin";
import { weatherFor } from "./weather";

/**
 * 기상특보 상세 — 통보문(getWthrWrnMsg)·상태 이력·「이 특보로 질의」 기준지역 (개발 서버 KmaClient.GetBulletinsAsync · WeatherService.GetOverviewAsync · GetBulletinAsync 를 옮김).
 * 개발 서버는 10분마다 통보문을 DB 에 쌓아 두고(WX_MSG) 화면이 표를 읽는다. 여기는 DB 표가 없어 사람이 상세 창을 열 때만 기상청을 부르고,
 * 지점마다 60초 서버 캐시를 둔다(/api/weather 와 같은 장단 — 탭·사용자가 많아도 기상청은 지점마다 1분에 한 번).
 * 시연 시나리오를 켠 시연 계정(R45 — weatherFor realtimeCut)은 기상청을 부르지 않는다: 통보문·상태 이력 없이 끊김만 알리고, 시나리오 특보의 기준지역만 싣는다.
 * 전국 발효 현황 건수(counts)·상태이력(recent)은 특보코드조회(getPwnCd) 장부로 낸다(개발 서버 Nationwide·Steps). 부르지 못하면 둘 다 없이
 * (화면이 셈은 특보 글로, 상태이력은 통보문 단계(steps)로 대신한다)
 */
const BASE = "https://apis.data.go.kr/1360000/WthrWrnInfoService";
const CACHE_MS = 60_000;
/** 한 장에 받을 수 — 이틀에 전국 24장(개발 서버 2026-10-28 확인)이라 넉넉하다 */
const PAGE = 100;
/** 장을 넘기는 상한 — 상류가 끝을 알려 주지 않을 때 무한히 도는 것만 막는다 */
const MAX_PAGES = 5;

const cache = new Map<string, { at: number; rows: WxBulletin[] }>();

/** KST 날짜(yyyyMMdd) */
const ymd = kmaYmd;

/** 한 지점의 from~to(yyyyMMdd) 통보문 — 끝은 「덜 찬 장」으로 안다(totalCount 를 믿지 않는다 — 개발 서버 2026-10-28) */
export async function fetchStationBulletins(stnId: string, from: string, to: string): Promise<WxBulletin[]> {
  const key = process.env.KMA_SERVICE_KEY ?? "";
  if (!key) throw new Error("기상청 API 키 미설정 (KMA_SERVICE_KEY)");
  const ck = `${stnId}|${from}|${to}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const rows: WxBulletin[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}/getWthrWrnMsg?serviceKey=${key}&dataType=JSON&numOfRows=${PAGE}&pageNo=${page}&stnId=${encodeURIComponent(stnId)}&fromTmFc=${from}&toTmFc=${to}`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`기상청 통보문 응답 ${r.status}`);
    const got = parseWrnMsg(await r.json(), stnId);
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  cache.set(ck, { at: Date.now(), rows });
  return rows;
}

// ── 특보코드조회(getPwnCd) — 전국 발효 현황 건수 · 상태이력(lib/wxPwn, 개발 서버 WX_POLL·Nationwide·Steps). 사건은 /api/weather 와 같은 캐시(lib/server/kma fetchPwnRows) ──
/**
 * 특보코드 장부 — 사건을 되짚어 현황(특보발효현황)에 없는 종류·단계는 닫는다. 현황은 받은 특보(/api/weather — 같은 장부에서 낸 발효 중 특보)의 종류·단계로 본다
 * (그 특보가 이미 현황으로 맞춘 것이라 같은 결과). 현황 시각 = weather.statusAt. 부르지 못하면 null — 화면은 셈을 특보 글로, 상태이력을 통보문으로 대신한다
 */
async function pwnLedger(advs: Advisory[], statusOk: boolean, statusAt: string | undefined, now: number): Promise<PwnWarning[] | null> {
  try {
    const rows = await fetchPwnRows(now);
    const at = statusAt ? pwnStampOf(Date.parse(statusAt)) : null;
    return ledgerPwn(rows, { understood: statusOk, labels: new Set(advs.map((a) => a.type + a.level)), at }, pwnStampOf(now));
  } catch {
    return null;
  }
}

/** 시·도 코드 → 그 시·도의 시·군·구(브이월드, 하루 캐시). 받지 못하면 null */
async function sigungusLoader(codes: string[]): Promise<(code: string) => AreaPick[] | null> {
  const got = new Map<string, AreaPick[] | null>();
  await Promise.all(codes.map(async (c) => got.set(c, await adminAreas("sigungu", c).catch(() => null))));
  return (c) => got.get(c) ?? null;
}

/** 특보마다 「이 특보로 질의」 기준지역 — 브이월드 시·도 목록을 받지 못하면 모두 null(지금 기준지역 그대로) */
export async function askRegions(advisories: Advisory[]): Promise<Record<string, BaseRegion | null>> {
  const out: Record<string, BaseRegion | null> = {};
  if (!advisories.length) return out;
  const sidos = await adminAreas("sido").catch(() => null);
  if (!sidos) {
    for (const a of advisories) out[a.id] = null;
    return out;
  }
  // 시·도까지 먼저 정하고, 괄호 목록이 있는 구역·섬 구역(울릉도.독도 …)의 시·도만 시·군·구 목록을 받는다
  const need = advisories.flatMap((a) => {
    const b = resolveAskRegion(a.area, sidos, () => null);
    return b && (/\(/.test(a.area) || ISLANDS[parseArea(a.area).head]) ? [b.sido.code] : [];
  });
  const sgg = await sigungusLoader([...new Set(need)]);
  advisories.forEach((a) => (out[a.id] = resolveAskRegion(a.area, sidos, sgg)));
  return out;
}

/** 특보 상세 — sidoCode = 기준지역 시·도 코드(없으면 전국 — 지점 열 곳 모두) */
export async function wxDetail(acc: Account, sidoCode: string | null, now = Date.now()): Promise<WxDetailResponse> {
  const weather = await weatherFor(acc);
  const advs = weather.advisories.filter((a) => a.status !== "해제");
  const base: WxDetailResponse = { ok: true, fetchedAt: new Date(now).toISOString(), hours: DETAIL_HOURS, failed: [], bulletins: [], bulletinsMore: false, steps: [], askRegions: {} };
  // 시연 시나리오 특보는 켠 시각에 발효된 것으로 상태이력에 싣는다(기상청 사건이 아니므로 장부를 거치지 않는다)
  if (weather.realtimeCut) return { ...base, realtimeCut: true, askRegions: await askRegions(advs), recent: scenarioSteps(advs) };
  const since = now - DETAIL_HOURS * 3600_000;
  const stations = coveringStations(sidoCode);
  // 기준지역 맞추기(브이월드)와 통보문(기상청)은 서로 기다리지 않는다
  const [regions, got, ledger] = await Promise.all([
    askRegions(advs),
    Promise.allSettled(stations.map((s) => fetchStationBulletins(s.stnId, ymd(since), ymd(now)))),
    pwnLedger(advs, weather.status.ok, weather.statusAt, now),
  ]);
  base.askRegions = regions;
  if (ledger) {
    base.counts = countPwn(ledger.filter((w) => w.active));
    // 상태이력 — 전국 모두(최신순). 화면이 기준지역으로 거르고(lib/wxMatch — 구역 맞추기 글 area) 최신 STEP_LIMIT 건으로 끊는다
    base.recent = pwnSteps(ledger, pwnStampOf(since));
  }
  const failed = stations.filter((_, i) => got[i].status === "rejected").map((s) => `${s.name}(${s.areaLabel})`);
  const rows = got
    .flatMap((g) => (g.status === "fulfilled" ? g.value : []))
    .filter((b) => Date.parse(b.announcedAt) >= since)
    .sort((a, b) => b.announcedAt.localeCompare(a.announcedAt) || b.seq - a.seq);
  return {
    ...base,
    ok: failed.length < stations.length,
    failed,
    bulletins: rows.slice(0, BULLETIN_LIMIT).map(bulletinHead),
    bulletinsMore: rows.length > BULLETIN_LIMIT,
    steps: rows.flatMap(bulletinSteps).slice(0, STEP_LIMIT),
  };
}

// ── 기상정보문(getWthrInfo) — 개발 서버 74974d2 는 10분마다 표(wx_info)에 쌓아 두고 읽는다. 여기는 표 없이 「이 특보로 질의」 때만 부르고 지점마다 60초 캐시(통보문과 같은 키·같은 지점) ──
const infoCache = new Map<string, { at: number; rows: WxInfo[] }>();

/** 한 지점의 from~to(yyyyMMdd) 기상정보문 — 끝은 「덜 찬 장」으로 안다(통보문과 같음) */
export async function fetchStationInfos(stnId: string, from: string, to: string): Promise<WxInfo[]> {
  const key = process.env.KMA_SERVICE_KEY ?? "";
  if (!key) throw new Error("기상청 API 키 미설정 (KMA_SERVICE_KEY)");
  const ck = `${stnId}|${from}|${to}`;
  const hit = infoCache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const rows: WxInfo[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE}/getWthrInfo?serviceKey=${key}&dataType=JSON&numOfRows=${PAGE}&pageNo=${page}&stnId=${encodeURIComponent(stnId)}&fromTmFc=${from}&toTmFc=${to}`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`기상청 기상정보문 응답 ${r.status}`);
    const got = parseWthrInfo(await r.json(), stnId);
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  infoCache.set(ck, { at: Date.now(), rows });
  return rows;
}

/**
 * 기준지역을 맡는 지방청·본청(전국)이 발표 12시간 안에 낸 기상정보문 최신 3장 — 본문까지(개발 서버 GET /api/weather/infos · WeatherService.GetInfosAsync).
 * sidoCode 가 없으면(전국) 지점 열 곳 모두. 받지 못한 지점은 빼고 준다 — 질의를 막을 일이 아니다
 */
export async function wxInfos(sidoCode: string | null, now = Date.now()): Promise<WxInfo[]> {
  const since = now - INFO_HOURS * 3600_000;
  const got = await Promise.allSettled(coveringStations(sidoCode).map((s) => fetchStationInfos(s.stnId, ymd(since), ymd(now))));
  return latestInfos(got.flatMap((g) => (g.status === "fulfilled" ? g.value : [])), now);
}

/** 통보문 한 장(본문 포함) — 열쇠의 지점·발표 날짜로 다시 받아 찾는다(지점 캐시를 그대로 쓴다). 없으면 null */
export async function bulletinByKey(key: string): Promise<WxBulletin | null> {
  const k = parseBulletinKey(key);
  if (!k || !wxStation(k.stnId)) return null;
  const day = k.tmFc.slice(0, 8);
  // 상세 창이 받아 둔 범위(어제~오늘)에 있으면 그 캐시를 쓴다
  const now = Date.now();
  for (const [from, to] of [[ymd(now - DETAIL_HOURS * 3600_000), ymd(now)], [day, day]]) {
    const rows = await fetchStationBulletins(k.stnId, from, to);
    const hit = rows.find((b) => b.key === bulletinKey(k.stnId, k.tmFc, k.seq));
    if (hit) return hit;
  }
  return null;
}
