"use client";
/**
 * 대응절차 화면 상태 — 단계 바(AppShell)와 우측 「대응절차」 탭(탐색 화면)이 함께 쓴다.
 *  · 계정의 관할 지역 매뉴얼만 (개발서버 useManual — 관할 지역이 없는 전국 계정은 NO_REGION)
 *  · 불러오기 실패 문구 세 갈래(개발서버 sopState failMsg): NO_REGION 「관할 지역이 없는 계정이라 대응절차가 없습니다.」,
 *    NOT_BUILT 「{지역}의 행동매뉴얼은 아직 준비되지 않았습니다.」, 그 밖은 서버 문구(없으면 「대응절차를 불러오지 못했습니다.」)
 *    특보 줄 [대응절차]로 패널을 열면 매뉴얼이 없는 계정에도 이 문구가 보인다
 *  · 단계 = 사용자가 고른 단계, 없으면 1단계 (특보 연동 추천은 2026-11-03 사용자 지시로 뺌)
 *  · 체크 = 세션 checks (기관 공용 서버 저장, D39)
 *  · 수정본 = 담당자가 매뉴얼 개정을 반영해 고친 내용 (기관·매뉴얼별 서버 저장 D39 — scope org:지역, key sopEdits:매뉴얼ID, 판 rev 로 충돌 확인. 원문 추출본은 그대로)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "./session";
import { REGIONS } from "./config";
import { api, ApiError } from "./api";
import { applyEdits, emptyEdits, type SopEdits, type SopManual, type SopStep } from "./sop";

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
  /** 매뉴얼을 보일 수 없음(관할 지역 없음·미구축·불러오기 실패) — 문구는 failMsg */
  failed: boolean;
  failMsg: string;
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
  const { account, toast } = useSession();
  // 관할 지역 — 전국 계정(중앙정부·운영자)은 없다(개발서버 NO_REGION)
  const region = account && account.region !== "national" ? account.region : null;
  const [base, setBase] = useState<SopManual | null>(null);
  const [edits, setEditsS] = useState<SopEdits | null>(null);
  const [editing, setEditing] = useState(false);
  /** 매뉴얼을 못 보이는 까닭 — null 이면 불러오는 중이거나 불러옴 */
  const [fail, setFail] = useState<{ kind: "NOT_BUILT" | "FAILED"; msg?: string } | null>(null);
  const [pick, setPick] = useState<{ step: SopStep; rec: string } | null>(null);
  const [scope, setScopeS] = useState<SopScope>("mine");
  const [openReq, setOpenReq] = useState<{ n: number; focus?: string } | null>(null);

  useEffect(() => {
    setBase(null);
    setFail(null);
    setEditing(false);
    if (!region) return;
    const hit = cache.get(region);
    if (hit) return setBase(hit);
    let alive = true;
    fetch(`/api/sop?region=${region}`)
      .then(async (r) => {
        if (r.ok) return (await r.json()) as SopManual;
        // 404 = 이 지역 매뉴얼을 아직 뽑지 않음(NOT_BUILT), 그 밖은 서버 문구 그대로
        const msg = ((await r.json().catch(() => null)) as { error?: string } | null)?.error;
        throw { kind: r.status === 404 ? "NOT_BUILT" : "FAILED", msg };
      })
      .then((m: SopManual) => {
        cache.set(region, m);
        if (alive) setBase(m);
      })
      .catch((e: { kind?: "NOT_BUILT" | "FAILED"; msg?: string }) => alive && setFail({ kind: e?.kind ?? "FAILED", msg: e?.msg }));
    return () => {
      alive = false;
    };
  }, [region]);

  // 담당자 수정본 (기관·매뉴얼별, 서버) — 이 브라우저에 예전 수정본이 있으면 처음 한 번 서버로 옮김
  const editKey = base ? `sa.sopEdits.${base.id}` : null;
  const kvScope = base ? `org:${base.region}` : null;
  const kvKey = base ? `sopEdits:${base.id}` : null;
  const [rev, setRev] = useState(0);
  const revRef = useRef(0);
  revRef.current = rev;
  const loadEdits = useCallback(async () => {
    if (!kvScope || !kvKey || !editKey) return;
    try {
      const kv = await api<Record<string, { value: SopEdits; rev: number }>>(`/api/kv?scope=${kvScope}`);
      let it = kv[kvKey];
      const old = LS.get<SopEdits | null>(editKey, null);
      if (!it && old && account?.role === "지자체") {
        const r = await api<{ item: { value: SopEdits; rev: number } }>("/api/kv", { method: "PUT", json: { scope: kvScope, key: kvKey, value: old, rev: 0 } });
        it = r.item;
      }
      if (old) try { localStorage.removeItem(editKey); } catch {}
      setEditsS(it?.value ?? null);
      setRev(it?.rev ?? 0);
    } catch {
      setEditsS(null);
    }
  }, [kvScope, kvKey, editKey, account]);
  useEffect(() => {
    setEditsS(null);
    setRev(0);
    loadEdits();
  }, [loadEdits]);
  /** 서버 저장 — 판이 다르면 다른 담당자가 먼저 고친 것 → 최신본으로 바꾸고 안내 */
  const persist = useCallback(
    async (next: SopEdits | null) => {
      if (!kvScope || !kvKey) return;
      try {
        const r = await api<{ item: { rev: number } | null }>("/api/kv", { method: "PUT", json: { scope: kvScope, key: kvKey, value: next, rev: next ? revRef.current : undefined } });
        setRev(r.item?.rev ?? 0);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const latest = (e.body as { latest?: { value: SopEdits; rev: number } | null }).latest;
          setEditsS(latest?.value ?? null);
          setRev(latest?.rev ?? 0);
          toast("다른 담당자가 먼저 수정본을 고쳤습니다. 최신 수정본을 불러왔으니 확인 후 다시 고치세요.");
        } else {
          toast("수정본을 서버에 저장하지 못했습니다.");
          loadEdits();
        }
      }
    },
    [kvScope, kvKey, toast, loadEdits],
  );
  const manual = useMemo(() => (base ? applyEdits(base, edits) : null), [base, edits]);
  const editView = useMemo(() => (base && editing ? applyEdits(base, edits, true) : null), [base, edits, editing]);
  const canEdit = !!region && !!base && account?.role === "지자체" && account.region === base.region;

  const editsRef = useRef<SopEdits | null>(null);
  editsRef.current = edits;
  const saveEdits = useCallback(
    (fn: (e: SopEdits) => SopEdits | void, what: string) => {
      if (!base) return;
      const draft: SopEdits = structuredClone(editsRef.current ?? emptyEdits(base));
      const next = fn(draft) ?? draft;
      next.log = [{ at: new Date().toISOString(), by: account?.name ?? "", what }, ...(next.log ?? [])].slice(0, 300);
      editsRef.current = next;
      setEditsS(next);
      persist(next);
    },
    [base, account, persist],
  );
  const replaceEdits = useCallback(
    (e: SopEdits | null, what: string) => {
      if (!base) return;
      const next = e ? { ...e, log: [{ at: new Date().toISOString(), by: account?.name ?? "", what }, ...(e.log ?? [])].slice(0, 300) } : null;
      editsRef.current = next;
      setEditsS(next);
      persist(next);
    },
    [base, account, persist],
  );

  useEffect(() => {
    if (!account) return;
    setPick(LS.get(`sa.sopStep.${account.id}`, null));
    setScopeS(LS.get<SopScope>("sa.sopScope", "mine"));
  }, [account]);

  // 특보 연동 단계 추천은 뺐다(2026-11-03 사용자 지시) — 직접 고른 단계, 없으면 첫 단계
  const picked = !!pick && pick.step !== "SIGN_DETECTION";
  const step: SopStep = picked ? pick!.step : "SIGN_DETECTION";

  const setStep = useCallback(
    (s: SopStep | null) => {
      const v = s ? { step: s, rec: "none" } : null;
      setPick(v);
      if (account) LS.set(`sa.sopStep.${account.id}`, v);
    },
    [account],
  );
  const setScope = useCallback((s: SopScope) => {
    setScopeS(s);
    LS.set("sa.sopScope", s);
  }, []);
  const requestOpen = useCallback((focus?: string) => setOpenReq((p) => ({ n: (p?.n ?? 0) + 1, focus })), []);
  const clearOpen = useCallback(() => setOpenReq(null), []);

  const failed = !!account && (!region || !!fail);
  const failMsg = !region
    ? "관할 지역이 없는 계정이라 대응절차가 없습니다."
    : fail?.kind === "NOT_BUILT"
      ? `${REGIONS[region]?.name || "이 지역"}의 행동매뉴얼은 아직 준비되지 않았습니다.`
      : (fail?.msg ?? "대응절차를 불러오지 못했습니다.");

  const value = useMemo<SopState>(
    () => ({
      enabled: !!region && !!manual, manual, base, editView, edits, canEdit, editing, setEditing, saveEdits, replaceEdits,
      failed, failMsg, step, picked, setStep, scope, setScope, openReq, requestOpen, clearOpen,
    }),
    [region, manual, base, editView, edits, canEdit, editing, saveEdits, replaceEdits, failed, failMsg, step, picked, setStep, scope, setScope, openReq, requestOpen, clearOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSop() {
  const v = useContext(Ctx);
  if (!v) throw new Error("SopProvider 누락");
  return v;
}

/** SopProvider 밖에서도 부를 수 있는 판 — 없으면 null(특보 줄 [대응절차] 단추 — 시험 화면 등) */
export function useSopOptional() {
  return useContext(Ctx);
}
