/**
 * 연락망·상황전파 공통 규칙 (서버·화면 함께 사용) — 타입 · 기관 · 권한 · 조직 트리 · 수신자 계산 · 입력 검사
 *  · 권한: 지자체·정부기관 공무원 = 자기 기관만 조회·관리(같은 기관 사용자는 모두 같은 권한),
 *          시스템 운영자 = 모든 기관 조회만 (등록·수정·삭제·발송 불가)
 */
import type { Account } from "./config";

export type UnitKind = "hq" | "team" | "dept" | "agency";
export const UNIT_KIND: Record<UnitKind, string> = { hq: "본부", team: "실무반", dept: "부서", agency: "유관기관" };

export interface Unit { id: string; orgId: string; parentId: string | null; name: string; kind: UnitKind; sort: number }
export interface Contact { id: string; orgId: string; unitId: string; name: string; title: string; duty: string; phone: string; email: string; /** 사무실 전화 (기관·부서 대표번호) */ office?: string; sort: number }
export interface Group { id: string; orgId: string; name: string; memberIds: string[]; sort: number }
export interface Bundle { units: Unit[]; contacts: Contact[]; groups: Group[] }
/** 서버 연락망 + 판(rev) — 고칠 때 rev 가 다르면 다른 담당자가 먼저 고친 것 */
export interface BundleRev extends Bundle { rev: number; updatedAt?: string | null; updatedBy?: string | null }

export interface Org { id: string; name: string; kind: "지자체" | "정부기관" }
export const ORGS: Org[] = [
  { id: "busan", name: "부산광역시", kind: "지자체" },
  { id: "yeongcheon", name: "경상북도 영천시", kind: "지자체" },
  { id: "inje", name: "강원특별자치도 인제군", kind: "지자체" },
  { id: "central", name: "중앙정부(행정안전부·NIA)", kind: "정부기관" },
];
export const orgName = (id: string) => ORGS.find((o) => o.id === id)?.name ?? id;
export const isOrg = (id: unknown): id is string => typeof id === "string" && ORGS.some((o) => o.id === id);

/** 계정의 소속 기관 (시스템 운영자는 소속 기관 연락망이 없음) */
export function myOrg(a: Account | null | undefined): string | null {
  if (!a || a.role === "운영자") return null;
  if (a.role === "중앙정부") return "central"; // 행정안전부·NIA 담당자 공용
  return a.region === "national" ? null : a.region;
}
/** 조회 가능 기관 — 운영자는 전체, 그 외는 자기 기관만 */
export const viewableOrgs = (a: Account | null | undefined): Org[] => (a?.role === "운영자" ? ORGS : ORGS.filter((o) => o.id === myOrg(a)));
export const canView = (a: Account | null | undefined, orgId: string) => !!a && (a.role === "운영자" || myOrg(a) === orgId);
/** 등록·수정·삭제 — 자기 기관 사용자만 (운영자는 조회만) */
export const canManage = (a: Account | null | undefined, orgId: string) => !!a && a.role !== "운영자" && myOrg(a) === orgId;
/** 상황전파 발송 — 자기 기관 연락망으로, 운영자는 발송 불가 (이력 조회만) */
export const canSend = (a: Account | null | undefined) => !!a && a.role !== "운영자" && !!myOrg(a);

export function fmtPhone(p: string) {
  const n = p.replace(/\D/g, "");
  if (n.length === 11) return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`;
  if (n.length === 10) return n.startsWith("02") ? `02-${n.slice(2, 6)}-${n.slice(6)}` : `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
  return p;
}
export const maskPhone = (p: string, show: boolean) => (show ? p : p.replace(/^(\d{2,3})-(\d{3,4})-(\d{4})$/, "$1-****-$3"));
export const PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------------------------------------------------------------- 조직 트리·수신자 */
export function childrenMap(units: Unit[]) {
  const m = new Map<string | null, Unit[]>();
  [...units].sort((a, b) => a.sort - b.sort).forEach((u) => m.set(u.parentId, [...(m.get(u.parentId) ?? []), u]));
  return m;
}
/** 조직 트리 순서 (본부 → 반 → 과) */
export function treeRank(units: Unit[]) {
  const kids = childrenMap(units);
  const rank = new Map<string, number>();
  const walk = (pid: string | null) => (kids.get(pid) ?? []).forEach((u) => (rank.set(u.id, rank.size), walk(u.id)));
  walk(null);
  return rank;
}
export const byTree = (list: Contact[], rank: Map<string, number>) =>
  list.map((c, i) => ({ c, i })).sort((a, b) => (rank.get(a.c.unitId) ?? 1e9) - (rank.get(b.c.unitId) ?? 1e9) || a.c.sort - b.c.sort || a.i - b.i).map((x) => x.c);
/** 조직과 하위 조직 전체 id */
export function subtree(units: Unit[], id: string): string[] {
  const kids = childrenMap(units);
  const out: string[] = [];
  const walk = (x: string) => (out.push(x), (kids.get(x) ?? []).forEach((k) => walk(k.id)));
  walk(id);
  return out;
}

export interface Selection { groupIds: string[]; unitIds: string[]; contactIds: string[] }
export const EMPTY_SEL: Selection = { groupIds: [], unitIds: [], contactIds: [] };
/** 전파그룹 ∪ 조직(하위 포함) ∪ 개별 담당자 — 같은 사람은 한 번만 */
export function recipientIds(b: Bundle, s: Selection) {
  const ids = new Set<string>(s.contactIds);
  b.groups.filter((g) => s.groupIds.includes(g.id)).forEach((g) => g.memberIds.forEach((m) => ids.add(m)));
  s.unitIds.forEach((u) => {
    const sub = new Set(subtree(b.units, u));
    b.contacts.filter((c) => sub.has(c.unitId)).forEach((c) => ids.add(c.id));
  });
  return ids;
}
export function resolveRecipients(b: Bundle, s: Selection): Contact[] {
  const ids = recipientIds(b, s);
  return byTree(b.contacts.filter((c) => ids.has(c.id)), treeRank(b.units));
}

/**
 * 연락망 전체 검사 (서버 저장 전) — 소속 기관 강제, 조직·담당자·그룹 연결 확인, 연락처 형식
 * 문제 있으면 오류 문장, 없으면 정리한 연락망
 */
export function checkBundle(orgId: string, b: Bundle): Bundle | string {
  if (!b || !Array.isArray(b.units) || !Array.isArray(b.contacts) || !Array.isArray(b.groups)) return "연락망 형식이 맞지 않습니다.";
  if (b.contacts.length > 5000 || b.units.length > 2000) return "연락망이 너무 큽니다.";
  const unitIds = new Set(b.units.map((u) => u.id));
  if (unitIds.size !== b.units.length) return "조직 아이디가 겹칩니다.";
  for (const u of b.units) {
    if (!u.name?.trim()) return "이름 없는 조직이 있습니다.";
    if (u.parentId && !unitIds.has(u.parentId)) return `「${u.name}」의 상위 조직이 없습니다.`;
    if (!(u.kind in UNIT_KIND)) return `「${u.name}」의 조직 종류가 맞지 않습니다.`;
  }
  const cIds = new Set(b.contacts.map((c) => c.id));
  if (cIds.size !== b.contacts.length) return "담당자 아이디가 겹칩니다.";
  for (const c of b.contacts) {
    if (!c.name?.trim()) return "이름 없는 담당자가 있습니다.";
    if (!unitIds.has(c.unitId)) return `「${c.name}」의 소속 조직이 없습니다.`;
  }
  const names = new Set<string>();
  for (const g of b.groups) {
    if (!g.name?.trim()) return "이름 없는 전파그룹이 있습니다.";
    if (names.has(g.name.trim())) return `같은 이름의 전파그룹이 있습니다: ${g.name}`;
    names.add(g.name.trim());
  }
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    units: b.units.map((u, i) => ({ id: u.id, orgId, parentId: u.parentId ?? null, name: s(u.name), kind: u.kind, sort: Number.isFinite(u.sort) ? u.sort : i })),
    contacts: b.contacts.map((c, i) => ({ id: c.id, orgId, unitId: c.unitId, name: s(c.name), title: s(c.title), duty: s(c.duty), phone: s(c.phone), email: s(c.email), office: s(c.office), sort: Number.isFinite(c.sort) ? c.sort : i })),
    groups: b.groups.map((g, i) => ({ id: g.id, orgId, name: s(g.name), memberIds: [...new Set((g.memberIds ?? []).filter((m) => cIds.has(m)))], sort: Number.isFinite(g.sort) ? g.sort : i })),
  };
}

/* ---------------------------------------------------------------- 상황전파 */
export type Channel = "SMS" | "EMAIL";
export const CH_LABEL: Record<Channel, string> = { SMS: "문자", EMAIL: "이메일" };
/** 수신자·채널별 상태 — 요청 접수(모듈에 요청함) → 발송 성공 / 발송 실패 / 결과 미확인(결과 알림이 오지 않음) */
export type SendStatus = "요청 접수" | "발송 성공" | "발송 실패" | "결과 미확인" | "연락처 없음";
export interface DispatchTo {
  id: string; name: string; title: string; unit: string; phone: string; email: string;
  result: Partial<Record<Channel, SendStatus>>;
  reason?: Partial<Record<Channel, string>>;
}
export interface Dispatch {
  id: string; orgId: string; at: string; by: string; byId: string; channels: Channel[]; message: string; context?: string;
  to: DispatchTo[]; sel: Selection; resendOf?: string; provider?: string;
}
/** 발송 요청 (화면 → 서버) — idemKey: 한 번 누른 [전파]의 고유값, force: 같은 내용 재발송을 사용자가 확인함 */
export interface DispatchRequest { orgId: string; message: string; channels: Channel[]; sel: Selection; context?: string; resendOf?: string; idemKey: string; force?: boolean }

/** 문자 길이 (EUC-KR 기준 바이트 — 한글 2, 그 외 1) · 90바이트 넘으면 장문(LMS) */
export function smsBytes(s: string) {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 127 ? 2 : 1;
  return n;
}
export const SMS_MAX = 90;
export const LMS_MAX = 2000;
/** 같은 내용·대상·채널을 다시 보내면 확인을 받는 시간 (초) */
export const DUP_WINDOW_SEC = 120;
export const reachable = (c: Pick<Contact, "phone" | "email">, ch: Channel) => (ch === "SMS" ? !!c.phone : !!c.email);
