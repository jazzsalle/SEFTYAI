/**
 * 기상청 특보코드조회(WthrWrnInfoService getPwnCd) — 특보 상세 창 「전국 발효 현황」 건수(개발 서버 KmaClient.GetWarningEventsAsync · WarningCodes ·
 * WarningLedger · WeatherService Nationwide 를 옮김, 사용자 지시 2026-11-06 「특보도 개발서버를 따른다」).
 *  · getPwnCd 는 구역(특보구역 코드 L…·S…)마다 「발표」·「해제」 사건만 준다. 발효 중 목록은 사건을 시간순으로 되짚어 만든다 — 발표면 열고, 해제면 닫고,
 *    같은 구역·종류에 단계만 바뀐 발표면 앞의 것을 닫고 새로 연다(격상)
 *  · 해제 통보가 오지 않는 구역이 있어, 특보발효현황(getPwnStatus)에 없는 종류·단계는 닫는다(WarningLedger.Reconcile). 현황을 읽지 못했으면 닫지 않는다
 *  · 개발 서버는 1분마다(WX_POLL) 장부를 DB 에 쌓는다. 여기는 DB 표 없이 부를 때마다 되짚는 창(PWN_DAYS — 개발 서버 처음 채우는 BackfillDays)을 처음부터 되짚는다
 *  · 셈 = 발효 중 구역 수를 (종류·단계·해상 여부)로 묶어 많은 것부터, 같으면 종류 이름 순. 해상 구역(S…)은 이름에 「(해상)」(WarningCodes.LabelOf)
 *  · 2026-11-19 특보 줄·상세의 발효 중 특보도 이 장부에서 낸다(개발 서버 WeatherService.GetStatusAsync — 구역마다 한 건, 발효 시각(startTime)·발표 시각(tmFc)·
 *    구역코드를 따로). 상태이력(pwnSteps)도 이 장부로(개발 서버 Steps). 기준지역 맞추기는 zoneArea(매핑표 wx_area_map 대신 구역 코드 앞자리·이름)
 * 이 파일은 import 가 없는 순수 함수뿐이라 화면·서버·하네스가 함께 쓴다. 기상청을 부르는 일은 lib/server/kma
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
  /** 특보발효현황 시각(tmEf, 12자리) — 현황에 없어 닫은 특보의 해제 시각. 없으면 부르는 쪽이 준 지금 */
  at?: string | null;
}

/**
 * 장부 한 줄 — 개발 서버 wx_warning(WarningLedger 가 열고 닫는 행). 시각은 기상청 12자리(「202611161600」) 그대로
 *  · announced = 발표(tmFc) · effective = 발효(startTime) · ended = 해제(endTime · 격상된 새 발효 · 현황 시각)
 *  · changeType = 신규 · 변경(같은 구역·종류에 앞의 것이 열려 있었다) · endType = 해제 · 변경 · 해제(현황)
 */
export interface PwnWarning extends PwnOpen {
  /** 「구역코드|종류|단계|발표시각」 — 개발 서버 WarningLedger.KeyOf */
  key: string;
  announced: string | null;
  effective: string | null;
  changeType: "신규" | "변경";
  active: boolean;
  ended: string | null;
  endType: "해제" | "변경" | "해제(현황)" | null;
}

/**
 * 사건을 시간순(발표 시각 → 발표 번호)으로 되짚어 장부를 만든다(개발 서버 WarningLedger.Apply) — 그다음 현황에 없는 종류·단계는 닫는다(Reconcile).
 * 해제는 그 구역·종류에 열린 것을 단계와 무관하게 닫는다(「호우주의보 해제」가 격상된 경보를 닫는 경우). 같은 구역·종류에 다른 발표가 오면 앞의 것을 닫고(변경) 새로 연다.
 * now = 현황 시각(summary.at)이 없을 때 현황으로 닫은 특보의 해제 시각(12자리). 열린 것·닫힌 것 모두 돌려준다(상태이력 — pwnSteps)
 */
export function ledgerPwn(rows: PwnRow[], summary: PwnSummary | null, now: string | null = null): PwnWarning[] {
  const all: PwnWarning[] = [];
  const open: PwnWarning[] = [];
  const known = new Set<string>();
  const close = (w: PwnWarning, at: string | null, type: NonNullable<PwnWarning["endType"]>) => {
    w.active = false;
    w.ended = at;
    w.endType = type;
    open.splice(open.indexOf(w), 1);
  };
  const ordered = [...rows].sort((a, b) => (a.announced ?? "").localeCompare(b.announced ?? "") || a.seq - b.seq);
  for (const r of ordered) {
    if (r.cancelled) continue;
    const kind = pwnKind(r.warnVar);
    const level = pwnLevel(r.warnStress);
    if (r.end) {
      for (const w of open.filter((x) => x.areaCode === r.areaCode && x.kind === kind)) close(w, r.end, "해제");
      continue;
    }
    if (!r.start) continue;
    const key = `${r.areaCode}|${kind}|${level}|${r.announced ?? ""}`;
    // 이미 아는 특보 — 같은 줄이 두 번 와도 한 번만
    if (known.has(key)) continue;
    const prev = open.find((w) => w.areaCode === r.areaCode && w.kind === kind);
    if (prev) close(prev, r.start, "변경");
    const w: PwnWarning = {
      key, areaCode: r.areaCode, areaName: r.areaName, kind, level,
      announced: r.announced, effective: r.start, changeType: prev ? "변경" : "신규", active: true, ended: null, endType: null,
    };
    all.push(w);
    open.push(w);
    known.add(key);
  }
  // 현황 맞추기 — 읽어내지 못했으면 아무것도 닫지 않는다(형식이 바뀐 것을 「없음」으로 오해하면 발효 중 특보를 모두 지운다)
  if (summary?.understood) for (const w of open.filter((x) => !summary.labels.has(x.kind + x.level))) close(w, summary.at ?? now, "해제(현황)");
  return all;
}

/** 사건을 되짚어 지금 발효 중인 구역만(ledgerPwn 의 열린 줄) */
export function replayPwn(rows: PwnRow[], summary: PwnSummary | null): PwnOpen[] {
  return ledgerPwn(rows, summary)
    .filter((w) => w.active)
    .map((w) => ({ areaCode: w.areaCode, areaName: w.areaName, kind: w.kind, level: w.level }));
}

/** 특보 종류 이름 — 특보발효현황 줄의 「강풍주의보」를 가를 때 */
const KIND_NAMES = new Set(Object.values(KINDS));
/** 긴 단계부터 — 「중대경보」가 「경보」로 잘리지 않게 */
const LEVEL_NAMES = Object.values(LEVELS).sort((a, b) => b.length - a.length);
/** 「강풍주의보」 → [강풍, 주의보]. 표에 없는 말이면 null(개발 서버 WarningCodes.SplitLabel) */
export function splitPwnLabel(label: string): [string, string] | null {
  for (const lv of LEVEL_NAMES) if (label.endsWith(lv) && KIND_NAMES.has(label.slice(0, -lv.length))) return [label.slice(0, -lv.length), lv];
  return null;
}

const BULLETS = ["o", "O", "ㅇ", "-", "*", "·", "ㆍ"];
const squeeze = (s: string) => s.replace(/\s+/g, "");

/**
 * 특보발효현황 글(getPwnStatus t6)을 읽는다(개발 서버 EffectiveSummaryReader) — 글머리표 줄의 콜론 앞 「종류단계」만 믿는다(구역 이름은 읽지 않는다).
 * 글머리표 없는 줄은 앞 줄 구역이 이어진 것. 모르는 줄이 하나라도 있으면 읽지 못한 것(understood=false) — 반만 읽고 나머지를 「없음」으로 치면 걸린 특보를 지운다.
 * at = 특보발효현황 시각(tmEf, 12자리)
 */
export function readPwnSummary(text: string | null | undefined, at: unknown = null): PwnSummary {
  const labels = new Set<string>();
  let none = false;
  let unknown = false;
  for (const line of String(text ?? "").split(/[\r\n]+/)) {
    const t = line.trim();
    if (!t || !BULLETS.includes(t[0])) continue;
    const body = t.slice(1).trim();
    if (!body) continue;
    if (squeeze(body) === "없음") {
      none = true;
      continue;
    }
    const colon = body.indexOf(":");
    const label = colon > 0 ? squeeze(body.slice(0, colon)) : "";
    if (!label || !splitPwnLabel(label)) {
      unknown = true;
      continue;
    }
    labels.add(label);
  }
  return { understood: (labels.size > 0 || none) && !unknown, labels, at: stamp(at) };
}

/** 기상청 12자리 → ISO(+09:00). 비었으면 null */
export const pwnIso = (s: string | null | undefined) =>
  s && /^\d{12}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00` : null;
/** 시각(ms) → 기상청 12자리(한국 시각) — 장부 시각과 견줄 때 */
export const pwnStampOf = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 16).replace(/\D/g, "");

// ── 특보구역 → 기준지역 맞추기 글(lib/wxMatch 가 읽는 꼴) ──
/** 육상 특보구역 코드 앞 네 자리 → 도(기상청 특보 현황 글의 이름). 2026-09~11 실제 응답의 구역 이름으로 확인 — 광역시 구역(L110~)은 이름으로 가린다 */
const PROVINCE: Record<string, string> = {
  L101: "경기도", L102: "강원도", L103: "충청남도", L104: "충청북도", L105: "전라남도", L106: "전북자치도", L107: "경상북도", L108: "경상남도", L109: "제주도",
};
/** 광역시·특별시 — 구역 이름이 이것으로 시작하면(「부산동부」 「서울동남권」 「대전광역시」 「울산서부」) 그 시 전체로 맞춘다(구·군까지는 매핑표가 없어 가리지 못한다) */
const METROS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"];
/** 경기 코드(L101)를 쓰지만 인천에 속한 구역 */
const INCHEON = new Set(["강화군", "옹진군", "백령도.대청도", "연평도.우도"]);

/**
 * 특보구역(getPwnCd areaCode·areaName) → 기준지역 맞추기 글(Advisory.area — lib/wxMatch wxCovers·wxAskRegion 이 읽는 「시·도(구역)」 꼴).
 * 개발 서버는 특보구역↔행정구역 매핑표(wx_area_map)로 맞추지만 그 표가 저장소에 없다 — 구역 코드 앞자리(도)와 구역 이름(시·군 이름으로 시작)으로 잇는다.
 *  · 바다(S…) → 이름 그대로(「부산앞바다」 — 이름이 시·도로 시작할 때만 맞는다)
 *  · 광역시 구역 → 그 시 전체(「부산」), 제주도산지 → 제주도 전체(제주시·서귀포시에 걸침)
 *  · 울릉도.독도 → 그대로(기상청이 시·도와 따로 쓰는 섬 구역)
 *  · 도의 구역 → 「강원도(인제군산지)」 「경상북도(영천시)」 「전라남도(흑산도.홍도)」
 *  · 코드도 이름도 모르면 이름 그대로(전국으로 볼 때만 보인다)
 */
export function zoneArea(areaCode: string, areaName: string): string {
  const name = areaName.trim();
  const n = squeeze(name);
  if (isSeaCode(areaCode)) return name;
  const metro = METROS.find((m) => n.startsWith(m) && !/^(시|군)/.test(n.slice(m.length)));
  if (metro) return metro;
  if (/^제주도/.test(n)) return "제주도";
  if (n === "울릉도.독도") return n;
  if (/^달성/.test(n)) return `대구(${name})`;
  if (INCHEON.has(n)) return `인천(${name})`;
  const sido = PROVINCE[areaCode.slice(0, 4).toUpperCase()];
  return sido ? `${sido}(${name})` : name;
}

/** 상태이력 한 단계(개발 서버 WarningChange) — 발효 · 변경 · 해제, 그 단계의 시각(기상청이 적어 준 시각) */
export interface PwnChange {
  key: string;
  areaCode: string;
  /** 기상청 구역 이름 그대로 — 화면에 적는다 */
  areaName: string;
  /** 기준지역 맞추기 글(zoneArea) */
  area: string;
  kind: string;
  level: string;
  sea: boolean;
  state: "발효" | "변경" | "해제";
  /** ISO(+09:00) */
  at: string;
  /** 시연 시나리오 특보(R43·R54)에서 만든 단계 */
  scenario?: boolean;
}

/**
 * 장부 줄을 상태이력 단계로 펼친다(개발 서버 WeatherService.Steps) — 걸린 때(발효 시각, 없으면 발표 시각)와 풀린 때. 되짚는 창(since, 12자리) 밖은 버린다. 최신이 앞.
 * 개발 서버는 1분마다 현황으로 닫은 시각을 장부에 남기지만 여기는 부를 때마다 처음부터 되짚는다 — 현황으로 닫은 특보(해제(현황))는
 * 걸린 때가 창 안일 때만 해제 단계를 낸다(오래 묵은 특보가 부를 때마다 「방금 해제」로 보이지 않게)
 */
export function pwnSteps(ledger: PwnWarning[], since: string): PwnChange[] {
  const out: PwnChange[] = [];
  for (const w of ledger) {
    const base = { key: w.key, areaCode: w.areaCode, areaName: w.areaName, area: zoneArea(w.areaCode, w.areaName), kind: w.kind, level: w.level, sea: isSeaCode(w.areaCode) };
    const raised = w.effective ?? w.announced;
    const inWin = !!raised && raised >= since;
    if (inWin) out.push({ ...base, state: w.changeType === "변경" ? "변경" : "발효", at: pwnIso(raised)! });
    if (!w.active && w.ended && w.ended >= since && (w.endType !== "해제(현황)" || inWin)) out.push({ ...base, state: "해제", at: pwnIso(w.ended)! });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
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
