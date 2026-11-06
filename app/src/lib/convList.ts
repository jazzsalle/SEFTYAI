/**
 * 대화 이력 목록(SCR-UNE-203002)·대화 만료(SCR-UNE-203001) 규칙 — 개발서버 useConversationList·ConversationService·ConversationRepository 그대로.
 *  · 처음 조건 = 최근 일주일(오늘 포함 7일). 기간도 조건이라 처음부터 「적용된 조건 1」
 *  · 칸에 적은 값(form)과 조회에 쓴 값(applied)을 나눈다 — [조회]·Enter·딱지 ✕·초기화 때만 applied 가 바뀐다
 *  · 키워드는 대화 제목만(질문·답 본문은 보지 않음), 기간은 최종 대화일시(끝날은 그날 끝까지)
 *  · 지역: 시·도 전체(빈 값) = 조건 없음, 「전국」(NATION) = 기준지역이 전국이었던 대화만, 그 밖은 코드 앞자리 — 시·도만 고르면 그 아래 시·군·구 대화까지
 *  · 최근 대화가 위(최종 대화일시 내림차순), 한 쪽 10줄
 *  · 만료: 상류(T3Q-25)가 대화 문맥을 마지막 활동으로부터 24시간만 들고 있다 — 우리 시계로 센다(상류에 묻지 않음)
 */
import type { Conversation } from "./session";

export const PAGE_SIZE = 10;
/** 「전국」 — 지역 조건 없음과 다르다. 기준지역이 전국이었던 대화만 고른다 */
export const NATION = "NATION";
/** 상류가 대화 문맥을 들고 있는 시간(T3Q-25 「마지막 활동 24시간 뒤 EXPIRED」) */
export const CONTEXT_TTL_MS = 24 * 3600_000;

export interface ConvForm {
  keyword: string;
  from: string;
  to: string;
  sido: string;
  sigungu: string;
  emd: string;
}
export const EMPTY_FORM: ConvForm = { keyword: "", from: "", to: "", sido: "", sigungu: "", emd: "" };

const p2 = (n: number) => String(n).padStart(2, "0");
/** 시안이 정한 입력 꼴 — 2026.07.25 */
export const dotted = (d: Date) => `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`;

/** 처음 조건 — 최근 일주일(오늘을 포함한 7일) */
export function initialForm(now = new Date()): ConvForm {
  const from = new Date(now);
  from.setDate(from.getDate() - 6);
  return { ...EMPTY_FORM, from: dotted(from), to: dotted(now) };
}

/** 2026.07.25 → 2026-07-25. 알아볼 수 없으면 그대로(거르지 못하면 아무것도 걸리지 않게 — 아래 dayStart) */
export function toIsoDate(text: string) {
  const m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/.exec(text.trim());
  if (!m) return text.trim();
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}
/** 그날 0시(이 화면의 시간대). 날짜 꼴이 아니면 NaN */
function dayStart(text: string): number {
  const iso = toIsoDate(text);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
}

/** 마지막 활동 시각 — 마지막 턴을 보낸 때(제목 고치기는 활동이 아니다). 턴이 없으면 updatedAt */
export function lastTurnAt(c: Conversation): string {
  let best = "";
  for (const t of c.turns ?? []) if (t.at && t.at > best) best = t.at;
  return best || c.updatedAt;
}

/** 이어서 물을 수 없는 대화인지 — 마지막 활동으로부터 24시간이 지났으면. 질문이 없는 대화는 만료가 아니다 */
export function isExpired(c: Conversation | null | undefined, now = Date.now()): boolean {
  if (!c || !c.turns?.length) return false;
  const at = new Date(lastTurnAt(c)).getTime();
  return Number.isFinite(at) && now - at > CONTEXT_TTL_MS;
}

/** 대화의 기준지역 코드 — 「」 = 전국, null = 모름(예전 대화) */
export function convRegionCode(c: Conversation): string | null {
  if (typeof c.baseCode === "string") return c.baseCode;
  if (c.baseName === "전국" || c.region === "national") return "";
  return null;
}

/** 조회 조건의 지역 — 가장 아래 단계 하나. 고르지 않았으면 undefined */
export function regionOf(f: ConvForm): string | undefined {
  if (f.sido === NATION) return NATION;
  return f.emd || f.sigungu || f.sido || undefined;
}

/** 조회 — 걸러서 최근 순으로 */
export function filterConvs(list: Conversation[], f: ConvForm): Conversation[] {
  const kw = f.keyword.trim();
  const from = f.from.trim() ? dayStart(f.from) : null;
  // 끝날은 그날 끝까지(다음 날 0시 앞까지)
  const to = f.to.trim() ? dayStart(f.to) + 864e5 : null;
  const region = regionOf(f);
  return list
    .filter((c) => {
      if (kw && !(c.title ?? "").includes(kw)) return false;
      const at = new Date(lastTurnAt(c)).getTime();
      if (from !== null && !(at >= from)) return false;
      if (to !== null && !(at < to)) return false;
      if (region) {
        const code = convRegionCode(c);
        if (region === NATION) return code === "";
        if (!code || !code.startsWith(region)) return false;
      }
      return true;
    })
    .sort((a, b) => lastTurnAt(b).localeCompare(lastTurnAt(a)) || b.id.localeCompare(a.id));
}

export interface AppliedTag {
  key: keyof ConvForm;
  label: string;
}
/** 지금 걸려 있는 조건 딱지 — 지역은 가장 아래 단계 하나만 */
export function appliedTags(f: ConvForm, nameOf: (key: "sido" | "sigungu" | "emd", code: string) => string): AppliedTag[] {
  const out: AppliedTag[] = [];
  if (f.keyword.trim()) out.push({ key: "keyword", label: f.keyword.trim() });
  if (f.from || f.to) out.push({ key: "from", label: `${f.from || "처음"} ~ ${f.to || "지금"}` });
  if (f.sido === NATION) out.push({ key: "sido", label: "전국" });
  else if (f.emd) out.push({ key: "emd", label: nameOf("emd", f.emd) });
  else if (f.sigungu) out.push({ key: "sigungu", label: nameOf("sigungu", f.sigungu) });
  else if (f.sido) out.push({ key: "sido", label: nameOf("sido", f.sido) });
  return out;
}

/** 딱지 하나 떼기 — 기간 딱지는 시작·끝 둘 다, 위 단계를 떼면 아래 단계도 */
export function dropTag(f: ConvForm, key: keyof ConvForm): ConvForm {
  const next = { ...f, [key]: "" };
  if (key === "from") next.to = "";
  if (key === "sido") {
    next.sigungu = "";
    next.emd = "";
  }
  if (key === "sigungu") next.emd = "";
  return next;
}

/** 시안의 「오늘 HH:MM」 · 「YYYY.MM.DD」 */
export function whenLabel(value: string | null | undefined, now = new Date()): string {
  if (!value) return "-";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "-";
  const same = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  return same ? `오늘 ${p2(at.getHours())}:${p2(at.getMinutes())}` : dotted(at);
}

/** 쪽 번호 — 지금 자리 둘레 다섯 개만 */
export function pagerPages(at: number, count: number): number[] {
  const from = Math.max(1, Math.min(at - 2, count - 4));
  return Array.from({ length: Math.min(5, count) }, (_, i) => from + i);
}
