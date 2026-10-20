"use client";
/**
 * 연락망 (UFR-009-002-01·02) · 상황전파 이력 (UFR-009-001-02) — 서버 DB(Neon) 저장 (D37)
 *  · 규칙·타입은 contactsCore (서버와 같이 씀), 여기는 화면용 읽기·고치기 훅
 *  · 고치기 = 지금 연락망에서 바꾼 결과를 통째로 저장 (판 rev 가 다르면 다른 담당자가 먼저 고친 것 → 새로 불러옴)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Account } from "./config";
import { api, ApiError } from "./api";
import { canManage, fmtPhone, PHONE_RE, EMAIL_RE, type Bundle, type BundleRev, type Contact, type Dispatch, type DispatchRequest, type Unit, type UnitKind } from "./contactsCore";

export * from "./contactsCore";

export const EMPTY: Bundle = { units: [], contacts: [], groups: [] };
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const EVT = "sa:contacts";
const ping = (orgId: string) => window.dispatchEvent(new CustomEvent(EVT, { detail: orgId }));

/** 기관 연락망 + 고치기 — 고치기 함수는 오류 문장(실패) 또는 null(성공)을 돌려줌 */
export function useContacts(orgId: string | null, account: Account | null) {
  const [b, setB] = useState<BundleRev | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cur = useRef<BundleRev | null>(null);
  cur.current = b;
  const load = useCallback(async () => {
    if (!orgId) return setB(null);
    try {
      setB(await api<BundleRev>(`/api/contacts?org=${orgId}`));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [orgId]);
  useEffect(() => {
    setB(null);
    load();
    const on = (e: Event) => (e as CustomEvent).detail === orgId && load();
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, [orgId, load]);
  const can = !!orgId && canManage(account, orgId);
  const mut = useCallback(
    async (fn: (b: Bundle) => Bundle | string, what: string): Promise<string | null> => {
      const base = cur.current;
      if (!orgId || !can) return "관리 권한이 없습니다.";
      if (!base) return "연락망을 불러오는 중입니다.";
      const r = fn(base);
      if (typeof r === "string") return r;
      try {
        const next = await api<BundleRev>(`/api/contacts?org=${orgId}`, { method: "PUT", json: { bundle: r, rev: base.rev, what } });
        setB(next);
        ping(orgId);
        return null;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setB((e.body as { latest?: BundleRev }).latest ?? base);
        return (e as Error).message;
      }
    },
    [orgId, can],
  );
  const saveUnit = (u: Partial<Unit> & { name: string; kind: UnitKind; parentId: string | null }) =>
    mut((b) => {
      if (!u.name.trim()) return "조직명을 입력하세요.";
      if (u.id) return { ...b, units: b.units.map((x) => (x.id === u.id ? { ...x, name: u.name.trim(), kind: u.kind } : x)) };
      return { ...b, units: [...b.units, { id: uid("u"), orgId: orgId!, parentId: u.parentId, name: u.name.trim(), kind: u.kind, sort: 99 }] };
    }, `조직 ${u.id ? "수정" : "추가"} ${u.name.trim()}`);
  const deleteUnit = (id: string) =>
    mut((b) => (b.units.some((u) => u.parentId === id) || b.contacts.some((c) => c.unitId === id) ? "하위 조직이나 담당자가 있으면 삭제할 수 없습니다." : { ...b, units: b.units.filter((u) => u.id !== id) }),
      `조직 삭제 ${cur.current?.units.find((u) => u.id === id)?.name ?? id}`);
  const saveContact = (c: Omit<Contact, "id" | "orgId" | "sort"> & { id?: string }) =>
    mut((b) => {
      if (!c.name.trim()) return "이름을 입력하세요.";
      if (!b.units.some((u) => u.id === c.unitId)) return "소속 조직을 고르세요.";
      const phone = c.phone.trim();
      if (phone && !PHONE_RE.test(phone)) return "휴대전화는 010-0000-0000 형식으로 입력하세요.";
      const email = c.email.trim();
      if (email && !EMAIL_RE.test(email)) return "이메일 형식이 맞지 않습니다.";
      if (!phone && !email) return "휴대전화나 이메일 중 하나는 있어야 전파할 수 있습니다.";
      const v = { ...c, name: c.name.trim(), title: c.title.trim(), duty: c.duty.trim(), phone: fmtPhone(phone), email, office: c.office?.trim() ? fmtPhone(c.office.trim()) : "" };
      if (c.id) return { ...b, contacts: b.contacts.map((x) => (x.id === c.id ? { ...x, ...v } : x)) };
      return { ...b, contacts: [...b.contacts, { ...v, id: uid("c"), orgId: orgId!, sort: 99 }] };
    }, `담당자 ${c.id ? "수정" : "추가"} ${c.name.trim()}`);
  const deleteContact = (id: string) =>
    mut((b) => ({ ...b, contacts: b.contacts.filter((c) => c.id !== id), groups: b.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== id) })) }),
      `담당자 삭제 ${cur.current?.contacts.find((c) => c.id === id)?.name ?? id}`);
  const saveGroup = (g: { id?: string; name: string; memberIds: string[] }) =>
    mut((b) => {
      if (!g.name.trim()) return "그룹명을 입력하세요.";
      if (b.groups.some((x) => x.name === g.name.trim() && x.id !== g.id)) return "같은 이름의 전파그룹이 있습니다.";
      if (g.id) return { ...b, groups: b.groups.map((x) => (x.id === g.id ? { ...x, name: g.name.trim(), memberIds: g.memberIds } : x)) };
      return { ...b, groups: [...b.groups, { id: uid("g"), orgId: orgId!, name: g.name.trim(), memberIds: g.memberIds, sort: 99 }] };
    }, `전파그룹 ${g.id ? "수정" : "추가"} ${g.name.trim()}`);
  const deleteGroup = (id: string) => mut((b) => ({ ...b, groups: b.groups.filter((g) => g.id !== id) }), `전파그룹 삭제 ${cur.current?.groups.find((g) => g.id === id)?.name ?? id}`);
  /** 예시 연락망으로 되돌리기 — 서버가 아니라 화면에서 예시를 만들어 저장 (contactsSeed) */
  const resetSeed = async () => {
    const { seedBundle } = await import("./contactsSeed");
    return mut(() => seedBundle(orgId!), "예시 연락망으로 되돌리기");
  };
  /** 엑셀 일괄 등록 결과로 통째로 바꿈 */
  const replace = (nb: Bundle, what = "엑셀 일괄 등록") => mut(() => nb, what);
  return { bundle: b ?? EMPTY, loaded: !!b, error: err, rev: b?.rev, updatedAt: b?.updatedAt, updatedBy: b?.updatedBy, canManage: can, reload: load, saveUnit, deleteUnit, saveContact, deleteContact, saveGroup, deleteGroup, resetSeed, replace };
}

/* ---------------------------------------------------------------- 상황전파 */
const HEVT = "sa:dispatch";
/** 상황전파 이력 — 결과를 기다리는 건이 있으면 5초마다 새로 읽음 */
export function useDispatches(orgId: string | null) {
  const [l, setL] = useState<Dispatch[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!orgId) return setL([]);
    try {
      setL(await api<Dispatch[]>(`/api/dispatch?org=${orgId}`));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [orgId]);
  useEffect(() => {
    setL([]);
    load();
    const on = (e: Event) => (e as CustomEvent).detail === orgId && load();
    window.addEventListener(HEVT, on);
    return () => window.removeEventListener(HEVT, on);
  }, [orgId, load]);
  const waiting = l.some((d) => d.to.some((t) => Object.values(t.result).includes("요청 접수")));
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [waiting, load]);
  return { list: l, error: err, reload: load };
}

export async function sendDispatch(req: DispatchRequest): Promise<{ dispatch: Dispatch; duplicate: boolean }> {
  const r = await api<{ dispatch: Dispatch; duplicate: boolean }>("/api/dispatch", { method: "POST", json: req });
  window.dispatchEvent(new CustomEvent(HEVT, { detail: req.orgId }));
  return r;
}
export const newIdemKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : uid("k"));
