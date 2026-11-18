/** 재난상황 조건의 발생기간 — 표기·읽기(개발서버 search/lib/conditions formatDate · formatTime · HourOptions · parseDateTime · defaultConditions) */

/** 「2026.07.25」(개발서버 formatDate) */
export function formatDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}
/** 「16:00」(개발서버 formatTime — 시 단위) */
export const formatTime = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:00`;
/** 시각 고르기 칸 00:00 ~ 23:00(개발서버 HourOptions) */
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
/** 「2026.07.25」 + 「16:00」 → 날짜. 꼴이 맞지 않으면 null(개발서버 parseDateTime) */
export function parseDateTime(date: string, time: string): Date | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(y, mo - 1, d, Number(time.slice(0, 2)), 0, 0, 0);
  if (at.getFullYear() !== y || at.getMonth() !== mo - 1 || at.getDate() !== d) return null;
  return at;
}
/**
 * 세션 조건의 발생기간 글 → 날짜. 조건 창은 ISO 시각(개발서버 toQueryContext period)으로 적고,
 * 질문 프리셋·예전 값은 「YYYY-MM-DD」(그날 0시로 읽는다). 못 읽으면 null
 */
export function parsePeriod(v?: string | null): Date | null {
  if (!v) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** 기본 발생기간 — 지금(정시)부터 최근 한 달(개발서버 defaultConditions) */
export function defaultPeriod() {
  const to = new Date();
  to.setMinutes(0, 0, 0);
  const from = new Date(to);
  from.setMonth(from.getMonth() - 1);
  return { from, to };
}
