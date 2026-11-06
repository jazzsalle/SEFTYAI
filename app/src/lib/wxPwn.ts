/**
 * 기상청 특보코드조회(WthrWrnInfoService getPwnCd) — 특보 상세 창 「전국 발효 현황」 건수(개발 서버 KmaClient.GetWarningEventsAsync · WarningCodes ·
 * WarningLedger · WeatherService Nationwide 를 옮김, 사용자 지시 2026-11-06 「특보도 개발서버를 따른다」).
 *  · getPwnCd 는 구역(특보구역 코드 L…·S…)마다 「발표」·「해제」 사건만 준다. 발효 중 목록은 사건을 시간순으로 되짚어 만든다 — 발표면 열고, 해제면 닫고,
 *    같은 구역·종류에 단계만 바뀐 발표면 앞의 것을 닫고 새로 연다(격상)
 *  · 해제 통보가 오지 않는 구역이 있어, 특보발효현황(getPwnStatus)에 없는 종류·단계는 닫는다(WarningLedger.Reconcile). 현황을 읽지 못했으면 닫지 않는다
 *  · 개발 서버는 1분마다(WX_POLL) 장부를 DB 에 쌓는다. 여기는 DB 표 없이 부를 때마다 되짚는 창(PWN_DAYS — 개발 서버 처음 채우는 BackfillDays)을 처음부터 되짚는다
 *  · 셈 = 발효 중 구역 수를 (종류·단계·해상 여부)로 묶어 많은 것부터, 같으면 종류 이름 순. 해상 구역(S…)은 이름에 「(해상)」(WarningCodes.LabelOf)
 * 이 파일은 import 가 없는 순수 함수뿐이라 화면·서버·하네스가 함께 쓴다. 기상청을 부르는 일은 lib/server/kmaBulletin
 */

/** 특보 종류(warnVar) — 활용가이드 응답 명세(개발 서버 WarningCodes.Kinds) */
const KINDS: Record<number, string> = { 1: "강풍", 2: "호우", 3: "한파", 4: "건조", 5: "폭풍해일", 6: "풍랑", 7: "태풍", 8: "대설", 9: "황사", 12: "폭염", 13: "열대야" };
/** 특보 강도(warnStress) */
const LEVELS: Record<number, string> = { 0: "주의보", 1: "경보", 2: "중대경보" };

/** 모르는 코드는 지어내지 않고 코드를 함께 적는다 — 「기타 특보(14)」 */
export const pwnKind = (code: number) => KINDS[code] ?? `기타 특보(${code})`;
export const pwnLevel = (code: number) => LEVELS[code] ?? `기타(${code})`;
/** 해상 특보구역(S…)인가 — 육상 기준지역과 이어지지 않는다 */
export const isSeaCode = (areaCode: string) => /^s/i.test(areaCode);

/** getPwnCd item 한 줄 */
export interface PwnRow {
  areaCode: string;
  areaName: string;
  warnVar: number;
  warnStress: number;
  /** 발효 계열은 startTime 만, 해제 계열은 endTime 만 차 온다(개발 서버 실응답 1,004행 확인) — command 코드 대신 시각 칸을 본다 */
  start: string | null;
  end: string | null;
  /** 발표 시각(tmFc) */
  announced: string | null;
  seq: number;
  /** cancel=1 — 취소된 특보는 없던 일 */
  cancelled: boolean;
}

/** 「202610281400」 → 같은 꼴 문자열(비교용). 0 이거나 꼴이 아니면 null */
const stamp = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return /^\d{12}$/.test(s) && s !== "000000000000" ? s : null;
};
const num = (v: unknown, d: number) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : d;
};

/** getPwnCd 응답 한 장 → 줄. 결과 코드가 00 이 아니면 던진다(몸통이 없다) */
export function parsePwnCd(j: unknown): PwnRow[] {
  const res = (j as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: unknown } | "" } } })?.response;
  const code = res?.header?.resultCode;
  // 03(NODATA_ERROR) = 그 기간에 사건 없음
  if (code === "03") return [];
  if (code !== "00") throw new Error(`기상청 특보코드 응답 ${code ?? "?"}`);
  const items = typeof res?.body?.items === "object" ? res.body.items?.item : undefined;
  const list = (Array.isArray(items) ? items : items ? [items] : []) as Record<string, unknown>[];
  return list.flatMap((o) => {
    const areaCode = String(o.areaCode ?? "").trim();
    if (!areaCode) return [];
    return [{
      areaCode,
      areaName: String(o.areaName ?? "").trim(),
      warnVar: num(o.warnVar, -1),
      warnStress: num(o.warnStress, -1),
      start: stamp(o.startTime),
      end: stamp(o.endTime),
      announced: stamp(o.tmFc),
      seq: num(o.tmSeq, 0),
      cancelled: String(o.cancel ?? "").trim() === "1",
    }];
  });
}

/** 발효 중 특보 하나(장부의 열린 줄) */
export interface PwnOpen {
  areaCode: string;
  areaName: string;
  kind: string;
  level: string;
}

/** 특보발효현황(getPwnStatus t6)에 비춘 요약 — understood 가 거짓이면 아무것도 닫지 않는다 */
export interface PwnSummary {
  understood: boolean;
  /** 「강풍주의보」 꼴 발효 중 종류·단계. 비었으면 전국에 특보 없음 */
  labels: Set<string>;
}

/**
 * 사건을 시간순(발표 시각 → 발표 번호)으로 되짚어 지금 발효 중인 구역을 만든다(WarningLedger.Apply) — 그다음 현황에 없는 종류·단계는 닫는다(Reconcile).
 * 해제는 그 구역·종류에 열린 것을 단계와 무관하게 닫는다(「호우주의보 해제」가 격상된 경보를 닫는 경우)
 */
export function replayPwn(rows: PwnRow[], summary: PwnSummary | null): PwnOpen[] {
  const open: (PwnOpen & { key: string })[] = [];
  const known = new Set<string>();
  const ordered = [...rows].sort((a, b) => (a.announced ?? "").localeCompare(b.announced ?? "") || a.seq - b.seq);
  for (const r of ordered) {
    if (r.cancelled) continue;
    const kind = pwnKind(r.warnVar);
    const level = pwnLevel(r.warnStress);
    if (r.end) {
      for (let i = open.length - 1; i >= 0; i--) if (open[i].areaCode === r.areaCode && open[i].kind === kind) open.splice(i, 1);
      continue;
    }
    if (!r.start) continue;
    const key = `${r.areaCode}|${kind}|${level}|${r.announced ?? ""}`;
    if (known.has(key)) continue;
    const prev = open.findIndex((w) => w.areaCode === r.areaCode && w.kind === kind);
    if (prev >= 0) open.splice(prev, 1);
    open.push({ key, areaCode: r.areaCode, areaName: r.areaName, kind, level });
    known.add(key);
  }
  const kept = summary?.understood ? open.filter((w) => summary.labels.has(w.kind + w.level)) : open;
  return kept.map((w) => ({ areaCode: w.areaCode, areaName: w.areaName, kind: w.kind, level: w.level }));
}

/** 전국 발효 현황 칩 하나 */
export interface PwnCount {
  type: string;
  level: string;
  sea: boolean;
  count: number;
}

/** 발효 중 구역을 (종류·단계·해상 여부)로 센다 — 많은 것부터, 같으면 종류 이름 순(WeatherService Nationwide) */
export function countPwn(open: PwnOpen[]): PwnCount[] {
  const map = new Map<string, PwnCount>();
  for (const w of open) {
    const sea = isSeaCode(w.areaCode);
    const k = `${w.kind}|${w.level}|${sea}`;
    const c = map.get(k);
    if (c) c.count++;
    else map.set(k, { type: w.kind, level: w.level, sea, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, "ko"));
}
