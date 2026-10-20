"use client";
/**
 * 대응절차 화면 상태 — 단계 바(AppShell)와 우측 「대응절차」 탭(탐색 화면)이 함께 쓴다.
 *  · 지자체 계정만, 자기 지역 매뉴얼만 (중앙정부·운영자 계정은 숨김)
 *  · 단계 = 특보로 추천한 단계 (사용자가 바꾸면 그 단계, 특보가 바뀌면 다시 추천 단계)
 *  · 체크 = 세션 checks (계정별 브라우저 저장)
 *  · 수정본 = 담당자가 매뉴얼 개정을 반영해 고친 내용 (지역 매뉴얼별 브라우저 저장, 원문 추출본은 그대로)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "./session";
import { applyEdits, emptyEdits, recommendStep, type SopEdits, type SopManual, type SopRec, type SopStep } from "./sop";

export type SopScope = "mine" | "all";

interface SopState {
  enabled: boolean;
  /** 수정본을 적용한 매뉴얼 (화면 기준) */
  manual: SopManual | null;
  /** 원문 추출본 (매뉴얼 PDF에서 뽑은 그대로) */
  base: SopManual | null;
  /** 편집 화면용 — 지운 조치·임무도 표시 */
  editView: SopManual | null;
  edits: SopEdits | null;
  /** 담당자 수정 — 자기 지역 지자체 계정 */
  canEdit: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  /** 수정 반영 + 이력 남김 (what = 이력에 남길 한 줄) */
  saveEdits: (fn: (e: SopEdits) => SopEdits | void, what: string) => void;
  /** 가져온 수정본으로 바꿈 (다른 PC·담당자에게서 받은 파일) */
  replaceEdits: (e: SopEdits | null, what: string) => void;
  failed: boolean;
  rec: SopRec | null;
  step: SopStep;
  /** 사용자가 추천과 다른 단계를 직접 골랐는지 */
  picked: boolean;
  setStep: (s: SopStep | null) => void;
  scope: SopScope;
  setScope: (s: SopScope) => void;
  /** 단계 바 → 우측 탭 열기 요청 (focus = 펼쳐 보일 조치 id) */
  openReq: { n: number; focus?: string } | null;
  requestOpen: (focus?: string) => void;
  clearOpen: () => void;
}

const Ctx = createContext<SopState | null>(null);
const cache = new Map<string, SopManual>();
const LS = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

export function SopProvider({ children }: { children: React.ReactNode }) {
  const { account, weather } = useSession();
  const region = account?.role === "지자체" && account.region !== "national" ? account.region : null;
  const [base, setBase] = useState<SopManual | null>(null);
  const [edits, setEditsS] = useState<SopEdits | null>(null);
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<{ step: SopStep; rec: string } | null>(null);
  const [scope, setScopeS] = useState<SopScope>("mine");
  const [openReq, setOpenReq] = useState<{ n: number; focus?: string } | null>(null);

  useEffect(() => {
    setBase(null);
    setFailed(false);
    setEditing(false);
    if (!region) return;
    const hit = cache.get(region);
    if (hit) return setBase(hit);
    let alive = true;
    fetch(`/api/sop?region=${region}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((m: SopManual) => {
        cache.set(region, m);
        if (alive) setBase(m);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [region]);

  // 담당자 수정본 (지역 매뉴얼별)
  const editKey = base ? `sa.sopEdits.${base.id}` : null;
  useEffect(() => {
    setEditsS(editKey ? LS.get<SopEdits | null>(editKey, null) : null);
  }, [editKey]);
  const manual = useMemo(() => (base ? applyEdits(base, edits) : null), [base, edits]);
  const editView = useMemo(() => (base && editing ? applyEdits(base, edits, true) : null), [base, edits, editing]);
  const canEdit = !!region && !!base && account?.role === "지자체" && account.region === base.region;

  const saveEdits = useCallback(
    (fn: (e: SopEdits) => SopEdits | void, what: string) => {
      if (!base || !editKey) return;
      setEditsS((prev) => {
        const draft: SopEdits = structuredClone(prev ?? emptyEdits(base));
        const next = fn(draft) ?? draft;
        next.log = [{ at: new Date().toISOString(), by: account?.name ?? "", what }, ...(next.log ?? [])].slice(0, 300);
        LS.set(editKey, next);
        return next;
      });
    },
    [base, editKey, account],
  );
  const replaceEdits = useCallback(
    (e: SopEdits | null, what: string) => {
      if (!base || !editKey) return;
      const next = e ? { ...e, log: [{ at: new Date().toISOString(), by: account?.name ?? "", what }, ...(e.log ?? [])].slice(0, 300) } : null;
      setEditsS(next);
      try {
        if (next) localStorage.setItem(editKey, JSON.stringify(next));
        else localStorage.removeItem(editKey);
      } catch {}
    },
    [base, editKey, account],
  );

  useEffect(() => {
    if (!account) return;
    setPick(LS.get(`sa.sopStep.${account.id}`, null));
    setScopeS(LS.get<SopScope>("sa.sopScope", "mine"));
  }, [account]);

  const rec = useMemo(() => (manual ? recommendStep(manual, weather?.advisories) : null), [manual, weather]);
  const recKey = rec ? rec.level : "none";
  // 직접 고른 단계는 그때의 추천이 그대로일 때만 유지 — 특보가 바뀌면 새 추천 단계로
  const picked = !!pick && pick.rec === recKey && pick.step !== (rec?.step ?? "SIGN_DETECTION");
  const step: SopStep = picked ? pick!.step : rec?.step ?? "SIGN_DETECTION";

  const setStep = useCallback(
    (s: SopStep | null) => {
      const v = s ? { step: s, rec: recKey } : null;
      setPick(v);
      if (account) LS.set(`sa.sopStep.${account.id}`, v);
    },
    [account, recKey],
  );
  const setScope = useCallback((s: SopScope) => {
    setScopeS(s);
    LS.set("sa.sopScope", s);
  }, []);
  const requestOpen = useCallback((focus?: string) => setOpenReq((p) => ({ n: (p?.n ?? 0) + 1, focus })), []);
  const clearOpen = useCallback(() => setOpenReq(null), []);

  const value = useMemo<SopState>(
    () => ({
      enabled: !!region && !!manual, manual, base, editView, edits, canEdit, editing, setEditing, saveEdits, replaceEdits,
      failed, rec, step, picked, setStep, scope, setScope, openReq, requestOpen, clearOpen,
    }),
    [region, manual, base, editView, edits, canEdit, editing, saveEdits, replaceEdits, failed, rec, step, picked, setStep, scope, setScope, openReq, requestOpen, clearOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSop() {
  const v = useContext(Ctx);
  if (!v) throw new Error("SopProvider 누락");
  return v;
}
