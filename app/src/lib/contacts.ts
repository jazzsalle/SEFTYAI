"use client";
/**
 * 연락망 (UFR-009-002-01·02) · 상황전파 이력 (UFR-009-001-02) — report4 연락망 구조를 따름
 *  · 조직(본부·실무반·부서·유관기관 계층) · 담당자 · 전파그룹 — 기관(지자체·정부기관)별
 *  · 권한: 지자체·정부기관 공무원 = 자기 기관만 조회·관리(같은 기관 사용자는 모두 같은 권한),
 *          시스템 운영자 = 모든 기관 조회만 (등록·수정·삭제·발송 불가)
 *  · 시연판이라 이 브라우저에 저장 (기관별). 처음 열면 예시 연락망으로 채움 (contactsSeed.ts)
 */
import { useCallback, useEffect, useState } from "react";
import type { Account } from "./config";
import { seedBundle } from "./contactsSeed";

export { seedBundle };

export type UnitKind = "hq" | "team" | "dept" | "agency";
export const UNIT_KIND: Record<UnitKind, string> = { hq: "본부", team: "실무반", dept: "부서", agency: "유관기관" };

export interface Unit { id: string; orgId: string; parentId: string | null; name: string; kind: UnitKind; sort: number }
export interface Contact { id: string; orgId: string; unitId: string; name: string; title: string; duty: string; phone: string; email: string; /** 사무실 전화 (기관·부서 대표번호) */ office?: string; sort: number }
export interface Group { id: string; orgId: string; name: string; memberIds: string[]; sort: number }
export interface Bundle { units: Unit[]; contacts: Contact[]; groups: Group[] }

export interface Org { id: string; name: string; kind: "지자체" | "정부기관" }
export const ORGS: Org[] = [
  { id: "busan", name: "부산광역시", kind: "지자체" },
  { id: "yeongcheon", name: "경상북도 영천시", kind: "지자체" },
  { id: "inje", name: "강원특별자치도 인제군", kind: "지자체" },
  { id: "central", name: "중앙정부(행정안전부·NIA)", kind: "정부기관" },
];
export const orgName = (id: string) => ORGS.find((o) => o.id === id)?.name ?? id;

/** 계정의 소속 기관 (시스템 운영자는 소속 기관 연락망이 없음) */
export function myOrg(a: Account | null | undefined): string | null {
  if (!a || a.role === "운영자") return null;
  if (a.role === "중앙정부") return "central"; // 행정안전부·NIA 담당자 공용
  return a.region === "national" ? null : a.region;
}
/** 조회 가능 기관 — 운영자는 전체, 그 외는 자기 기관만 */
export const viewableOrgs = (a: Account | null | undefined): Org[] => (a?.role === "운영자" ? ORGS : ORGS.filter((o) => o.id === myOrg(a)));
/** 등록·수정·삭제 — 자기 기관 사용자만 (운영자는 조회만) */
export const canManage = (a: Account | null | undefined, orgId: string) => !!a && a.role !== "운영자" && myOrg(a) === orgId;
/** 상황전파 발송 — 자기 기관 연락망으로, 운영자는 발송 불가 (이력 조회만) */
export const canSend = (a: Account | null | undefined) => !!a && a.role !== "운영자" && !!myOrg(a);

/* ---------------------------------------------------------------- 저장 (기관별, 이 브라우저) */
const KEY = (orgId: string) => `sa.contacts.v2.${orgId}`;
const HKEY = (orgId: string) => `sa.dispatch.v1.${orgId}`;
const EVT = "sa:contacts";
function read<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
  window.dispatchEvent(new Event(EVT));
}
export const loadBundle = (orgId: string): Bundle => read<Bundle | null>(KEY(orgId), null) ?? seedBundle(orgId);

export const EMPTY: Bundle = { units: [], contacts: [], groups: [] };
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 기관 연락망 + 고치기 (고칠 수 없는 계정이면 고치기 함수가 오류를 냄 — 화면에서도 버튼을 숨김) */
export function useContacts(orgId: string | null, account: Account | null) {
  const [b, setB] = useState<Bundle>(EMPTY);
  useEffect(() => {
    if (!orgId) return setB(EMPTY);
    const sync = () => setB(loadBundle(orgId));
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, [orgId]);
  const can = !!orgId && canManage(account, orgId);
  const mut = useCallback(
    (fn: (b: Bundle) => Bundle | string) => {
      if (!orgId || !can) return "관리 권한이 없습니다.";
      const r = fn(loadBundle(orgId));
      if (typeof r === "string") return r;
      write(KEY(orgId), r);
      return null;
    },
    [orgId, can],
  );
  const saveUnit = (u: Partial<Unit> & { name: string; kind: UnitKind; parentId: string | null }) =>
    mut((b) => {
      if (!u.name.trim()) return "조직명을 입력하세요.";
      if (u.id) return { ...b, units: b.units.map((x) => (x.id === u.id ? { ...x, name: u.name.trim(), kind: u.kind } : x)) };
      return { ...b, units: [...b.units, { id: uid("u"), orgId: orgId!, parentId: u.parentId, name: u.name.trim(), kind: u.kind, sort: 99 }] };
    });
  const deleteUnit = (id: string) =>
    mut((b) => (b.units.some((u) => u.parentId === id) || b.contacts.some((c) => c.unitId === id) ? "하위 조직이나 담당자가 있으면 삭제할 수 없습니다." : { ...b, units: b.units.filter((u) => u.id !== id) }));
  const saveContact = (c: Omit<Contact, "id" | "orgId" | "sort"> & { id?: string }) =>
    mut((b) => {
      if (!c.name.trim()) return "이름을 입력하세요.";
      if (!b.units.some((u) => u.id === c.unitId)) return "소속 조직을 고르세요.";
      const phone = c.phone.trim();
      if (phone && !/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(phone)) return "휴대전화는 010-0000-0000 형식으로 입력하세요.";
      const email = c.email.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "이메일 형식이 맞지 않습니다.";
      if (!phone && !email) return "휴대전화나 이메일 중 하나는 있어야 전파할 수 있습니다.";
      const v = { ...c, name: c.name.trim(), title: c.title.trim(), duty: c.duty.trim(), phone: fmtPhone(phone), email, office: c.office?.trim() ? fmtPhone(c.office.trim()) : "" };
      if (c.id) return { ...b, contacts: b.contacts.map((x) => (x.id === c.id ? { ...x, ...v } : x)) };
      return { ...b, contacts: [...b.contacts, { ...v, id: uid("c"), orgId: orgId!, sort: 99 }] };
    });
  const deleteContact = (id: string) =>
    mut((b) => ({ ...b, contacts: b.contacts.filter((c) => c.id !== id), groups: b.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== id) })) }));
  const saveGroup = (g: { id?: string; name: string; memberIds: string[] }) =>
    mut((b) => {
      if (!g.name.trim()) return "그룹명을 입력하세요.";
      if (b.groups.some((x) => x.name === g.name.trim() && x.id !== g.id)) return "같은 이름의 전파그룹이 있습니다.";
      if (g.id) return { ...b, groups: b.groups.map((x) => (x.id === g.id ? { ...x, name: g.name.trim(), memberIds: g.memberIds } : x)) };
      return { ...b, groups: [...b.groups, { id: uid("g"), orgId: orgId!, name: g.name.trim(), memberIds: g.memberIds, sort: 99 }] };
    });
  const deleteGroup = (id: string) => mut((b) => ({ ...b, groups: b.groups.filter((g) => g.id !== id) }));
  const resetSeed = () => mut(() => seedBundle(orgId!));
  /** 엑셀 일괄 등록 결과로 통째로 바꿈 */
  const replace = (nb: Bundle) => mut(() => nb);
  return { bundle: b, canManage: can, saveUnit, deleteUnit, saveContact, deleteContact, saveGroup, deleteGroup, resetSeed, replace };
}

export function fmtPhone(p: string) {
  const n = p.replace(/\D/g, "");
  if (n.length === 11) return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`;
  if (n.length === 10) return n.startsWith("02") ? `02-${n.slice(2, 6)}-${n.slice(6)}` : `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
  return p;
}
export const maskPhone = (p: string, show: boolean) => (show ? p : p.replace(/^(\d{2,3})-(\d{3,4})-(\d{4})$/, "$1-****-$3"));

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

/* ---------------------------------------------------------------- 상황전파 이력 */
export type Channel = "SMS" | "EMAIL";
export const CH_LABEL: Record<Channel, string> = { SMS: "문자", EMAIL: "이메일" };
export interface DispatchTo { id: string; name: string; title: string; unit: string; phone: string; email: string; result: Partial<Record<Channel, "요청 접수" | "연락처 없음">> }
export interface Dispatch { id: string; orgId: string; at: string; by: string; byId: string; channels: Channel[]; message: string; context?: string; to: DispatchTo[]; sel: Selection; resendOf?: string }

export const loadDispatches = (orgId: string): Dispatch[] => read<Dispatch[]>(HKEY(orgId), []);
export function addDispatch(d: Dispatch) {
  write(HKEY(d.orgId), [d, ...loadDispatches(d.orgId)].slice(0, 200));
}
export function useDispatches(orgId: string | null) {
  const [l, setL] = useState<Dispatch[]>([]);
  useEffect(() => {
    if (!orgId) return setL([]);
    const sync = () => setL(loadDispatches(orgId));
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, [orgId]);
  return l;
}
export const newDispatchId = () => uid("D");

/** 문자 길이 (EUC-KR 기준 바이트 — 한글 2, 그 외 1) · 90바이트 넘으면 장문(LMS) */
export function smsBytes(s: string) {
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 127 ? 2 : 1;
  return n;
}
export const SMS_MAX = 90;
export const LMS_MAX = 2000;
