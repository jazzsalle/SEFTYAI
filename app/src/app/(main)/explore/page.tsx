"use client";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { manualPanel, useManualPanel } from "@/lib/manualPanel";
import { useSession, uid, type Conversation, type SubmitArgs, type Turn } from "@/lib/session";
import { useSop } from "@/lib/sopState";
import { useBriefingSet } from "@/lib/briefing";
import { briefRequest, DAY_ITEMS, DEMO_SHOW, fillText, type DemoItem, type LibraryQuestion } from "@/lib/library";
import { activityOf, BARE_COND, condReset, hasInputCond, baseFromSaved, baseProvince, convProvince, defaultTitleOf, LEAVE_OK, LEAVE_TITLE, leaveMessage, openConvBus, REGION_BREAK_EVENT, regionBreakText, restoreCond, type RegionBreak } from "@/lib/dialogue";
import { Dialog } from "@/components/account/Dialog";
import "@/components/explore/dialogue.css";
import { REGIONS } from "@/lib/config";
import { api } from "@/lib/api";
import type { Citation } from "@/lib/contract/agent";
import { activeAdvisories, aimWarningsPayload, latestBulletinKeys, toRefBulletin, toRefInfo, warningsPayload } from "@/lib/wxref";
import type { WxBulletin, WxInfo } from "@/lib/wxBulletin";
import { baseKey, baseName, basePilot, baseTarget, type BaseRegion } from "@/lib/baseRegion";
import { detailIdOf, entityKey, objectIdOf, type RefLike } from "@/lib/mapRef";
import { capDetailTabs, isClosable } from "@/lib/panelTabs";
import { isFloodTrace } from "@/lib/floodTrace";
import { WX_ASK_EVENT, takeWxAsk, wxAskQuestion, type WxAskRequest } from "@/lib/wxAsk";
import { receivedAt, type JobSummary, type T3qRef } from "@/lib/jobTypes";
import type { AskEntry } from "@/lib/queueList";
import { basisTime } from "@/lib/summary";
import { ExploreContext, type ExploreApi, type PanelTab } from "@/components/explore/ExploreCtx";
import RightPanel from "@/components/explore/RightPanel";
import Composer, { fillQuery } from "@/components/explore/Composer";
import { isExpired } from "@/lib/convList";
import StartScreen from "@/components/explore/StartScreen";
import LibraryDrawer from "@/components/explore/LibraryDrawer";
import BriefBoard, { showBriefItem, type BriefGroup } from "@/components/explore/BriefBoard";
import QueuePanel from "@/components/queue/QueuePanel";
import AnswerCard, { AnswerError, AnswerWait } from "@/components/answer/AnswerCard";
import "@/components/answer/thread.css";
import type { MapFeature } from "@/components/map/MapView";
import { IcChevL, IcPlus } from "@/components/Icons";
import { AutoDemoBar } from "@/components/autodemo/AutoDemoBar";
import AimPrep from "@/components/autodemo/AimPrep";
import { ScenarioPicker } from "@/components/autodemo/ScenarioPicker";
import { useExploreAutoDemo } from "@/components/autodemo/useExploreAutoDemo";
import { askLockBus, askLockOf, countRunning } from "@/lib/askLock";

const SOP_TAB: PanelTab = { key: "sop", kind: "sop", title: "대응절차", pinned: true };
const MAP_TAB: PanelTab = { key: "map", kind: "map", title: "지도" };
/** 답변 한눈 요약(개발 서버 시안 2) — 지도 다음 붙박이 탭 */
const SUMMARY_TAB: PanelTab = { key: "summary", kind: "summary", title: "한눈 요약" };
/** 지도에서 집어 둔 참조 객체(개발 서버 useObjectRefs) — eid = lib/mapRef entityKey */
interface PickedRef { eid: string; ref: RefLike }
type AskArgs = Omit<SubmitArgs, "convId" | "turnNo">;
/**
 * 대화를 시작한 기준지역과 지금 기준지역의 시·도가 다른가 — 대화 하나는 시·도 하나(R62, 개발서버 352a97c: 같은 시·도 안에서 바꾸면 대화 유지).
 * 전에는 기준지역이 조금만 달라도 새 대화였다(R32). 시·도 코드가 없는 예전 대화는 이름으로 견준다. 이름도 없으면 따지지 않는다
 */
const otherBase = (c: Conversation | null | undefined, now: BaseRegion | null) => {
  const p = convProvince(c?.baseCode);
  if (p !== undefined) return p !== baseProvince(now);
  return !!c?.baseName && c.baseName !== baseName(now);
};

export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <Explore />
    </Suspense>
  );
}

/** 질문 현황 펼침 — 이 탭 메모리(개발서버 asksOpen 은 라우터 위 상태, 기본 접힘) */
let queueOpenMem = false;

function Explore() {
  const s = useSession();
  const sop = useSop();
  const sp = useSearchParams();
  const router = useRouter();
  const { checked: briefItems, loaded: briefLoaded } = useBriefingSet();
  const [conv, setConv] = useState<Conversation | null>(null);
  // 질문 현황은 접고 시작한다(개발서버 SearchSessionProvider asksOpen — 지도를 넓게). 펼침 상태는 개발서버처럼 저장소에 두지 않고
  // 이 탭이 살아 있는 동안만 기억한다(그쪽은 라우터 위 Provider 상태 — 다른 화면에 다녀와도 그대로, 새로고침하면 접힘)
  const [queueOpen, setQueueOpenS] = useState(() => queueOpenMem);
  const setQueueOpen = useCallback((v: boolean) => {
    queueOpenMem = v;
    setQueueOpenS(v);
  }, []);
  const [libOpen, setLibOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // 대화 ↔ 지도 패널 너비 — 대화 칸 비율(%). 가운데 막대를 끌거나 버튼으로 바꾼다(사용자 지시 2026-11-02). 이 브라우저에 기억
  const [chatW, setChatWS] = useState(52);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("sa_chat_w"));
      if (v >= 22 && v <= 78) setChatWS(v);
    } catch {
      /* 저장소를 못 쓰면 기본값 */
    }
  }, []);
  const setChatW = useCallback((v: number) => {
    const w = Math.round(Math.min(78, Math.max(22, v)));
    setChatWS(w);
    try {
      localStorage.setItem("sa_chat_w", String(w));
    } catch {
      /* 무시 */
    }
  }, []);
  const mainRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  const startDrag = (e: React.PointerEvent) => {
    const main = mainRef.current;
    const box = main?.parentElement;
    if (!main || !box) return;
    e.preventDefault();
    const left = main.getBoundingClientRect().left;
    const total = box.getBoundingClientRect().right - left;
    setDragging(true);
    const move = (ev: PointerEvent) => setChatW(((ev.clientX - left) / total) * 100);
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const [tabs, setTabs] = useState<PanelTab[]>([MAP_TAB]);
  const [active, setActive] = useState("map");
  const [sopFocus, setSopFocus] = useState<{ id: string; n: number } | undefined>(undefined);
  const [mapJob, setMapJob] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  /**
   * 「객체 참조」(개발 서버 useObjectRefs) — 켜 둔 동안 지도 누르기 = 집기. 집은 것은 질문 칸 위 이름표로 남고, 어느 길로 물어도
   * (질문·브리핑·질문 모음) 함께 간다(reference.object_ids + 이름 키워드). 새 대화·기준지역 변경·계정 변경이면 모두 놓고 끈다.
   */
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PickedRef[]>([]);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const resetPicks = useCallback(() => {
    setPicked([]);
    setPicking(false);
  }, []);
  const togglePick = useCallback((eid: string, ref: RefLike) => {
    setPicked((list) => (list.some((x) => x.eid === eid) ? list.filter((x) => x.eid !== eid) : [...list, { eid, ref }]));
  }, []);
  const pickedIds = useMemo(() => new Set(picked.map((x) => x.eid)), [picked]);
  // 집어 둔 것은 그 지역·그 사람의 객체다 — 두면 부산 질문에 강원도 지구가 딸려 간다
  const baseK = baseKey(s.cond.base);
  useEffect(() => resetPicks(), [baseK, s.account?.id, resetPicks]);
  // 기준지역을 옮기면 앞 지역 대상 상세 탭(예: 부산 「만덕동 산100」)은 닫고, 한눈 요약 등을 보고 있었어도 지도 탭으로(대응절차만 그대로) — 지도는 새 기준지역 경계로 맞춰진다(MapView baseCode)
  const baseSeenK = useRef(baseK);
  useEffect(() => {
    if (baseSeenK.current === baseK) return;
    baseSeenK.current = baseK;
    setTabs((p) => p.filter((t) => t.kind !== "detail" && t.kind !== "evidence"));
    setActive((a) => (a === "sop" ? a : "map"));
  }, [baseK]);
  /** 보낼 질의에 집어 둔 것을 얹는다 — 접수 본문 objectRefs(서버 lib/server/jobInput objectRefsOf 가 reference·키워드로) */
  const withRefs = useCallback(
    (a: AskArgs): AskArgs =>
      pickedRef.current.length && a.source !== "AI_MODE"
        ? ({ ...a, objectRefs: pickedRef.current.map((x) => ({ id: objectIdOf(x.ref), name: x.ref.display_name ?? null })) } as AskArgs)
        : a,
    [],
  );
  // 지금 보고 있는 대화 + 대화별 최신본(연달아 보낼 때 앞선 턴이 지워지지 않게 — 항상 최신본에 붙인다)
  const convRef = useRef<Conversation | null>(null);
  convRef.current = conv;
  const latest = useRef(new Map<string, Conversation>());
  const sRef = useRef(s);
  sRef.current = s;
  // 지금 보는 대화를 머리줄(기준지역 변경 창)·다음에 열 대화와 나눈다(lib/dialogue openConvBus). 빈 화면으로 처음 열 때는 마지막으로 본 대화를 그대로 둔다 — 비우는 것은 [새 대화]뿐
  useEffect(() => {
    if (conv) openConvBus.set({ convId: conv.id, turns: conv.turns });
  }, [conv]);

  // 기준지역(R32) — 이름(질문의 {지역})·특보 맞추기는 지금 고른 기준지역으로
  const regionName = baseName(s.cond.base);
  const wxTarget = baseTarget(s.cond.base);

  /**
   * 앞 대화에서 연 상세 탭(대상 상세·근거 문서·원문)은 그 대화의 것이다 — 새 대화·다른 대화를 열면 비우고 지도 탭으로, 지도의 고른 표시도 푼다
   * (개발서버 usePanel.reset · 96c419a UFR-006-001-02). 붙박이 탭(지도·한눈 요약·대응절차)은 남는다
   */
  const resetPanel = useCallback(() => {
    setTabs((p) => p.filter((t) => !isClosable(t)));
    setActive("map");
    setSelectedKey(null);
  }, []);

  /** 새 대화 — 빈 대화(시작 화면)로. [＋ 새 대화] 단추와 머리줄 기준지역 변경(sa:new-conv)이 함께 쓴다 */
  const newConv = useCallback(() => {
    openConvBus.reset();
    setConv(null);
    resetPicks();
    resetPanel();
    router.replace("/explore");
  }, [router, resetPicks, resetPanel]);
  useEffect(() => {
    window.addEventListener("sa:new-conv", newConv);
    return () => window.removeEventListener("sa:new-conv", newConv);
  }, [newConv]);

  /*
    대화 전환 중지 안내창(개발서버 SearchSessionProvider requestLeave · FUN-UFR-306004 — R62).
    떠날 대화(지금 보는 대화, 다른 화면에 다녀왔으면 마지막으로 본 대화 — lib/dialogue openConvBus)에 답변 생성 중·대기 중인 질문이 있으면 먼저 묻는다.
    확인하면 답변 생성 중인 질문은 상류에서도 멈추고(취소), 대기 중·보내는 중인 질문은 보내지 않는다. 질문이 없으면 묻지 않고 바로 한다
  */
  const [leave, setLeave] = useState<{ kind: "new" | "open"; action: () => void; onCancel?: () => void } | null>(null);
  const leaving = () => {
    const cur = openConvBus.get();
    return { cur, act: activityOf(cur.turns, (id) => sRef.current.jobs[id]?.state) };
  };
  const requestLeave = (kind: "new" | "open", action: () => void, onCancel?: () => void) => {
    const { act } = leaving();
    if (act.running === 0 && act.waiting === 0) return action();
    setLeave({ kind, action, onCancel });
  };
  const confirmLeave = () => {
    const next = leave;
    setLeave(null);
    if (!next) return;
    const { cur, act } = leaving();
    openConvBus.markLeft(cur.convId);
    for (const id of act.jobIds) void sRef.current.cancel(id).catch(() => {});
    next.action();
  };
  const cancelLeave = () => {
    leave?.onCancel?.();
    setLeave(null);
  };
  const leaveAct = leave ? leaving().act : null;

  /** 대화를 열면 화면 상단 기준지역·재난유형·발생기간을 그 대화의 조건(마지막으로 답을 받았을 때)으로(개발서버 SearchPage · FUN-UFR-307004). 새 대화를 만들지 않고 알림도 없다 */
  const restoreTop = useCallback(async (c: Conversation) => {
    const ss = sRef.current;
    const b = baseFromSaved(c.baseCode, c.baseName);
    if (b !== undefined && baseKey(b) !== baseKey(ss.cond.base)) ss.setBase(b);
    const last = [...c.turns].reverse().find((t) => t.jobId);
    const f = last ? await ss.loadFull(last.jobId) : null;
    const qc = (f?.request as { query_context?: Record<string, unknown> | null } | undefined)?.query_context ?? null;
    sRef.current.setCond(restoreCond(qc));
  }, []);

  // 이력에서 연 대화 (?c=) — 그 id 로 한 번만 연다(이후 새 대화를 시작해도 되돌아가지 않게)
  const openedC = useRef<string | null>(null);
  useEffect(() => {
    const id = sp.get("c");
    if (!id || openedC.current === id) return;
    const c = s.convs.find((x) => x.id === id);
    if (c && c.v === 2) {
      openedC.current = id;
      const prev = openConvBus.get().convId;
      const open = () => {
        // 앞 대화에서 연 상세 탭도 닫는다 — 열린 대화의 객체가 아니다(개발서버 SearchPage panel.reset · UFR-006-001-02)
        resetPanel();
        setConv(latest.current.get(c.id) ?? c);
        void restoreTop(c);
      };
      // 같은 대화를 다시 여는 것이면 묻지 않는다. 취소하면 하던 대화에 머문다(주소만 치움)
      if (prev === c.id) return open();
      requestLeave("open", open, () => {
        const back = prev ? latest.current.get(prev) ?? sRef.current.convs.find((x) => x.id === prev) : null;
        if (back) setConv(back);
        router.replace("/explore");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, s.convs]);

  /*
    같은 시·도 안 기준지역 변경 구분선(개발서버 useConversation breaks · AnswerPanel BreakLine — 정의서 UFR-001-001-01 G).
    대화마다 화면에만 둔다(개발서버도 저장하지 않음 — 대화를 다시 열면 없다). 대화가 없으면(시작 화면) 남기지 않는다
  */
  const [breaks, setBreaks] = useState<Record<string, RegionBreak[]>>({});
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ from: string; to: string }>).detail;
      const c = convRef.current;
      if (!c || !d) return;
      const afterTurnId = c.turns.length ? c.turns[c.turns.length - 1].id : null;
      setBreaks((m) => ({ ...m, [c.id]: [...(m[c.id] ?? []), { afterTurnId, from: d.from, to: d.to, at: new Date().toISOString() }] }));
    };
    window.addEventListener(REGION_BREAK_EVENT, on);
    return () => window.removeEventListener(REGION_BREAK_EVENT, on);
  }, []);

  // 대응절차 탭 켜고 끄기(특보 줄 [대응절차] — 개발서버 usePanel.showManual). 켜면 그 탭으로, 끄면 한눈 요약(없으면 지도)으로
  const manualOn = useManualPanel();
  const manualFirst = useRef(true);
  useEffect(() => {
    if (manualFirst.current) {
      manualFirst.current = false;
      if (!manualOn) return;
    }
    if (manualOn) {
      setPanelOpen(true);
      setActive("sop");
    } else {
      // 끄면 대응절차에서 연 원문 탭도 함께 닫는다(개발서버 usePanel.showManual)
      setActive((a) => (a === "sop" || a.startsWith("doc:") ? (summary?.refs.length ? "summary" : "map") : a));
      setTabs((p) => p.filter((t) => t.kind !== "doc"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualOn]);

  // 대응절차 탭 열기 요청(대응 단계 바)
  useEffect(() => {
    if (!sop.openReq || !sop.enabled) return;
    manualPanel.set(true);
    setPanelOpen(true);
    setActive("sop");
    const f = sop.openReq.focus;
    if (f) setSopFocus((p) => ({ id: f, n: (p?.n ?? 0) + 1 }));
    sop.clearOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sop.openReq, sop.enabled]);

  // 대화의 작업 상태 따라가기 + 완료되면 원응답 받기
  useEffect(() => {
    for (const t of conv?.turns ?? []) {
      if (!t.jobId) continue;
      const j = s.jobs[t.jobId];
      if (!j) s.watch(t.jobId);
      else if (!["QUEUED", "SUBMITTED", "RUNNING"].includes(j.state) && (!s.full[t.jobId] || s.full[t.jobId].state !== j.state)) s.loadFull(t.jobId);
      else if (j.hasPreview && !s.full[t.jobId]) s.loadFull(t.jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv, s.jobs]);

  /*
    질문 칸 잠금(개발서버 SearchPage askLocked — R57). 개별 질문은 넷까지 함께 돌고, 브리핑 세트가 도는 동안은 개별 질문을 받지 않는다.
    특보 상세 창·머리줄 [자동 시연](AppShell)도 같은 값을 본다(lib/askLock).
  */
  const lock = useMemo(() => askLockOf(countRunning(conv?.turns ?? [], (id) => s.jobs[id]?.state)), [conv?.turns, s.jobs]);
  useEffect(() => askLockBus.set(lock), [lock]);
  useEffect(() => () => askLockBus.reset(), []);

  /*
    가운데 칸(개발서버 SearchPage 524-575) — 브리핑이 있는 대화는 브리핑 화면만, 질문 현황에서 대화 질문을 고르거나 새로 물을 때만 대화(턴 목록).
    convSel = 가운데에 대화를 보일 때 고른 턴(개발서버 asks.selected — kind 'turn'). null 이면 브리핑(없으면 대화)
  */
  const blocks = useMemo(() => {
    const out: { group?: Turn["group"]; turns: Turn[] }[] = [];
    for (const t of conv?.turns ?? []) {
      const last = out[out.length - 1];
      if (t.group && last?.group?.id === t.group.id) last.turns.push(t);
      else out.push({ group: t.group, turns: [t] });
    }
    return out;
  }, [conv]);
  const lastBrief = [...blocks].reverse().find((b) => b.group)?.group;
  const convTurns = useMemo(() => (conv?.turns ?? []).filter((t) => !t.group), [conv]);
  const [convSel, setConvSel] = useState<string | null>(null);
  const showConv = !!conv && (!lastBrief || (convSel !== null && convTurns.some((t) => t.id === convSel)));
  /*
    새로 물으면 그 질문으로(개발서버 useAskList — 보낸 사람은 그 답을 기다린다) · 새 턴이 붙으면 그 턴으로 굴린다(개발서버 AnswerPanel — 여럿이면 그 가운데 첫 턴).
    대화가 바뀌면(새 대화·브리핑·이력에서 열기) 고른 것을 놓는다
  */
  const seenTurns = useRef<{ id: string | null; n: number }>({ id: null, n: 0 });
  useEffect(() => {
    const prev = seenTurns.current;
    const id = conv?.id ?? null;
    const n = convTurns.length;
    seenTurns.current = { id, n };
    if (prev.id !== id) {
      setConvSel(null);
      return;
    }
    if (n <= prev.n) return;
    setConvSel(convTurns[n - 1].id);
    const first = convTurns[prev.n].id;
    window.setTimeout(() => document.querySelector(`[data-turn-id="${first}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [conv?.id, convTurns]);

  /** 대화 저장 — 최신본 갱신, 보고 있는 대화면 화면에도 반영 */
  const commit = useCallback((c: Conversation, show: boolean) => {
    latest.current.set(c.id, c);
    if (show || convRef.current?.id === c.id) {
      convRef.current = c;
      setConv(c);
    }
    sRef.current.saveConv(c);
    return c;
  }, []);
  const current = (id: string) => latest.current.get(id) ?? (convRef.current?.id === id ? convRef.current : null) ?? sRef.current.convs.find((c) => c.id === id) ?? null;

  // 첫 답에서 상류가 제목(conversation_title)을 주면 그것으로 — 사람이 고친 제목은 덮지 않는다(개발서버 ConversationService.RecordTurn)
  useEffect(() => {
    if (!conv || conv.renamed || conv.turns.length !== 1) return;
    const jid = conv.turns[0].jobId;
    const t: unknown = jid ? s.full[jid]?.raw?.result?.conversation_title : null;
    const given = typeof t === "string" ? t.trim() : "";
    if (!given || given === conv.title) return;
    const c = current(conv.id) ?? conv;
    commit({ ...c, title: given.slice(0, 200) }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv, s.full]);


  /** 턴 붙이기 — baseId 가 없으면 새 대화. area = 새 대화의 기준지역(이 질문에만 실은 기준지역 — 「이 특보로 질의」, 없으면 세션 기준지역) */
  const appendTurns = useCallback(
    (title: string, add: Turn[], baseId: string | null, area?: BaseRegion | null) => {
      const now = new Date().toISOString();
      const base = baseId ? current(baseId) : null;
      const own = area !== undefined;
      const c: Conversation = base
        ? { ...base, turns: [...base.turns, ...add], updatedAt: now }
        : {
            // 새 대화 기본 제목 = 첫 질문 앞 30자(개발서버 defaultTitleOf · FUN-UFR-306005 — 전에는 200자). 첫 답의 T3Q 대화 제목·사람이 고친 제목이 앞선다
            id: uid("c"), title: defaultTitleOf(title), region: own ? basePilot(area) : sRef.current.cond.region, baseName: baseName(own ? area : sRef.current.cond.base), baseCode: baseKey(own ? area : sRef.current.cond.base),
            disasterType: sRef.current.cond.disasterType, createdAt: now, updatedAt: now, turns: add, v: 2,
          };
      return commit(c, !baseId);
    },
    [commit],
  );
  /** 턴 고치기(접수 결과 반영 등) — 그 대화의 최신본에서 */
  const patchTurn = useCallback(
    (convId: string, turnId: string, patch: Partial<Turn>) => {
      const c = current(convId);
      if (!c) return;
      commit({ ...c, turns: c.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)), updatedAt: new Date().toISOString() }, false);
    },
    [commit],
  );

  /** 접수 — 자리(보내는 중) 턴을 먼저 붙이고, 응답이 오면 작업 ID 를, 실패하면 실패 문구를 채운다 */
  const submitInto = useCallback(
    async (convId: string, turnId: string, a: AskArgs, turnNo: number) => {
      try {
        const job = await sRef.current.submit({ ...a, convId, turnNo });
        patchTurn(convId, turnId, { jobId: job.id, pending: undefined, error: undefined });
        // 보내는 사이 이 대화를 떠났다(중지 안내창에서 확인 — 대기 중인 질문은 보내지 않는다) — 받은 작업을 바로 멈춘다
        if (openConvBus.isLeft(convId)) void sRef.current.cancel(job.id).catch(() => {});
        return job;
      } catch (e) {
        patchTurn(convId, turnId, { pending: undefined, error: (e as Error).message });
        throw e;
      }
    },
    [patchTurn],
  );

  /**
   * 질문 보내기 — 이 대화를 시작한 시·도와 지금 기준지역의 시·도가 다르면 새 대화로(질문은 지금 기준지역으로 가므로).
   * bare = 질문 모음 — 재난상황 조건·집어 둔 참조 객체 없이 질문 문장 그대로(개발서버 bareConditions · UFR-006-001-11, R62)
   */
  const ask = useCallback(
    async (a0: AskArgs, extra?: Partial<Turn>, newConv = false, bare = false) => {
      const a = bare ? { ...a0, condPatch: { ...BARE_COND, ...a0.condPatch } } : withRefs(a0);
      const open = convRef.current;
      // 이 질문에만 실은 기준지역(「이 특보로 질의」 — a.base)이 있으면 그 지역으로 대화를 가린다(대화 하나는 시·도 하나 — R62)
      const area = a.base !== undefined ? a.base : sRef.current.cond.base;
      const moved = !newConv && otherBase(open, area);
      if (moved) sRef.current.toast(`기준지역이 이 대화(${open?.baseName})와 달라 새 대화로 보냅니다.`);
      const tid = uid("t");
      const t: Turn = { id: tid, jobId: "", pending: true, q: a.question, source: a.source, libraryId: a.libraryId ?? null, at: new Date().toISOString(), args: a, ...extra };
      const c = appendTurns(a.question, [t], newConv || moved ? null : open?.id ?? null, a.base);
      return submitInto(c.id, tid, a, c.turns.length);
    },
    [appendTurns, submitInto, withRefs],
  );
  const toastErr = (e: unknown) => s.toast((e as Error).message);

  /**
   * AI 모드 창에서 보내는 브리핑 세트·개별 질문에만 싣는 특보 — 지금 기준지역에서 발효 중인 모든 특보를 질의 1건에 한 번에, 없으면 싣지 않는다(개발서버 aiModeWarnings · 810fe49).
   * 일반 창 질의(시작 화면·질의 줄 브리핑)는 AI 모드를 켜 두었어도 싣지 않는다. 시연 시나리오를 켠 시연 계정은 서버가 준 시나리오 특보만(R45 — 기상청 실시간 끊음)
   */
  const aimWarnings = () => aimWarningsPayload(s.weather, activeAdvisories(s.weather, wxTarget));

  /**
   * 시작 화면 브리핑 항목 타일로 넣은 글 — 그 글 그대로 보내면 출처 BRIEFING(개발서버 StartGuide onPick → setSource('BRIEFING')).
   * 사람이 글을 고치면 직접 질문(개발서버 QueryBox onChange → USER)
   */
  const tilePick = useRef<string | null>(null);
  const pickTile = (q: string) => {
    tilePick.current = q.trim();
    fillQuery(q);
  };
  const askText = async (q: string) => {
    const fromTile = tilePick.current !== null && tilePick.current === q.trim();
    tilePick.current = null;
    const ref = s.wxRef;
    // 참조 특보가 그사이 해제됐으면 떼고 보낸다(해제된 특보를 현재 특보로 보내지 않게)
    const still = ref ? activeAdvisories(s.weather, wxTarget).find((a) => a.id === ref.id) : undefined;
    if (ref && !still) {
      s.setWxRef(null);
      s.toast("참조한 특보가 해제되어 특보 참조 없이 보냅니다.");
    }
    await ask(
      { question: q, source: fromTile ? "BRIEFING" : still ? "QUICK" : "USER", warnings: still ? warningsPayload(s.weather, [still]) : null },
      still ? { refAdv: { type: still.type, level: still.level, area: still.area, issuedAt: still.issuedAt, ...(still.scenario ? { scenario: true } : {}) } } : undefined,
    );
  };
  /**
   * 특보 상세 「이 특보로 질의」(lib/wxAsk · 개발서버 askAlert 1c4ea03·0247dbf·810fe49·74974d2) — 재난상황 조건을 기본으로 되돌리고(되돌릴 입력이 있었으면 알림)
   * 기준지역은 그대로 둔 채 묻는다. 특보종류·단계는 조건에 넣지 않는다. 그 특보 1건과 기준지역 관할 통보문 본문 전문(관서별 최신 한 장)·기상정보문(「기상정보(예보)」)을
   * weather_warnings 참조로 함께 싣는다 — 가져오지 못한 것은 빼고 간다(질의를 막을 일이 아니다)
   */
  const askWx = async (r: WxAskRequest) => {
    const a = r.adv;
    const reset = condReset();
    if (hasInputCond(sRef.current.cond)) s.toast("특보 기준으로 묻기 위해 재난상황 조건을 기본으로 되돌렸습니다.");
    s.setCond(reset);
    const sido = sRef.current.cond.base?.sido.code;
    const [loaded, infos] = await Promise.all([
      Promise.all(latestBulletinKeys(r.bulletins ?? []).map((key) => api<WxBulletin>(`/api/weather/bulletin?key=${encodeURIComponent(key)}`).catch(() => null))),
      api<{ items: WxInfo[] }>(`/api/weather/infos${sido ? `?sido=${sido}` : ""}`).then((x) => x.items ?? []).catch(() => [] as WxInfo[]),
    ]);
    const bulletins = loaded.filter((b): b is WxBulletin => !!b).map(toRefBulletin);
    return ask(
      { question: wxAskQuestion(a), source: "QUICK", warnings: warningsPayload(s.weather, [a], { bulletins, weatherInfo: infos.map(toRefInfo) }), condPatch: reset },
      { refAdv: { type: a.type, level: a.level, area: a.area, issuedAt: a.issuedAt, ...(a.scenario ? { scenario: true } : {}) } },
    ).catch(toastErr);
  };
  /** 질문 모음 「지역 질문」 하나 — 재난상황 조건 없이 질문 문장 그대로(기준지역만 따라간다 — {지역} 자리, 개발서버 askLibrary · FUN-UFR-301007). 출처 QUICK(개발서버 askLibrary — 전 LIBRARY) */
  const askLib = (q: LibraryQuestion) =>
    ask({ question: fillText(q, regionName), source: "QUICK", libraryId: q.id, quickQueryId: q.quickQueryId ?? null, warnings: null }, undefined, false, true).catch(toastErr);
  /** 질문 모음 「추천 질문」 하나 — T3Q-03 이 기준지역에 맞춰 준 글 그대로(출처 SUGGEST). 재난상황 조건은 싣지 않는다(지역 질문과 같음) */
  const askSuggest = (text: string) => ask({ question: text, source: "SUGGEST", warnings: null }, undefined, false, true).catch(toastErr);
  /** 브리핑 항목 하나 질의 (시작 화면 타일 · 질의 줄 메뉴 · AI 모드 타일) — q 는 질의문 원형. 개발서버처럼 질의문 그대로(출처 BRIEFING). aim = AI 모드 창에서 보냄(특보를 싣는다) */
  const askBrief = (q: string, aim = false) =>
    ask({ question: q.replaceAll("{지역}", regionName), source: "BRIEFING", warnings: aim ? aimWarnings() : null, ...showPin(q, 0) }, undefined, true).catch(toastErr);
  /**
   * 브리핑 항목 글이 질문 모음 「시연」 질문과 같으면 그 항목의 고정 답을 쓴다 — 받아 둔 답을 몇 초 뒤 차례로 보인다(사용자 지시 2026-11-02).
   * 「한눈 요약 질의」 항목도 찾는다(개발서버 useBriefing storedAnswer — 질문 글로 받아 둔 답을 찾음). 받아 둔 답은 시연 모드일 때만 쓰고, 아니면 실시간(서버 판단 — R52)
   */
  const showPin = (q: string, i: number) => {
    const d = DEMO_SHOW.find((x) => x.text === q.trim()) ?? DAY_ITEMS.find((x) => x.text === q.trim());
    return d ? { pinId: d.id, revealMs: 3000 + i * 1500 } : {};
  };
  /**
   * 질문 모음 「한눈 요약 질의」 한 건 — 질문 글만 조건 없이(개발서버 askDay · UFR-006-001-11 I열). 전에는 항목의 가정 조건(프리셋)을 얹고 받아 둔 답이 있으면 그것을 세웠다.
   * 자동 조회(질문 모음 경로)는 그대로. 받아 두기·받아 둔 답(sa_demo_pins)은 자동 시연·브리핑 시연이 쓴다
   */
  // 한눈 요약 질의는 시연용 — 받아 둔 답(sa_demo_pins)이 있으면 시연 모드와 상관없이 늘 그 답을 놓는다(2026-11-19 사용자 지시 · 개발서버는 늘 실시간).
  // 받아 둔 답이 없으면 새로 받아 그 답을 받아 둔다(질문 모음 「받아 두기」와 같은 길)
  // 받아 둔 답은 시연 모드(대상 계정)일 때만 — 평소에는 개발서버 askDay 처럼 질문 글만 실시간으로(사용자 결정 2026-11-24). 자동 시연은 따로 늘 받아 둔 답(useExploreAutoDemo)
  const askDemo = (d: DemoItem) => ask({ question: d.text, source: "QUICK", libraryId: d.id, quickQueryId: d.quickQueryId ?? null, pinId: d.id, pinDemo: true, revealMs: 3000 }, undefined, false, true).catch(toastErr);
  /** 「이어서 물어보기」 추천 후속질문 — 질문 글 그대로 이 대화에 이어 묻는다(개발서버 onFollowUp: FOLLOW_UP · 지금 조건 · FUN-UFR-301003) */
  const askSuggested = (text: string) => ask({ question: text, source: "FOLLOW_UP" }).catch(toastErr);
  /** 자동 시연(개발서버 features/demoMode — R54) — 받아 둔 답을 대본대로 놓고 음성으로 안내. 시연 배치 = 질의 목록 접고 대화 55% */
  const autoDemo = useExploreAutoDemo({
    newConv,
    ask: (a) => ask(a),
    layout: () => { setQueueOpen(false); setLibOpen(false); setChatW(55); },
    open: (what) => { setPanelOpen(true); setActive(what); },
  });

  /**
   * 브리핑 세트 — 항목마다 자리 턴을 먼저 만들고(실패해도 자리 유지) 동시에 보낸다(R2). aim = AI 모드 창에서 시작(발효 특보를 싣는다 — 개발서버 startBriefing(aiModeWarnings())).
   * 단추 onClick 에 그대로 물리지 않는다 — 클릭 이벤트가 aim 자리로 들어간다(개발서버 8fe1980). 참·거짓만 받는다
   */
  const startBriefing = async (aim?: boolean) => {
    const items = briefItems;
    if (!items.length) return s.toast("브리핑 항목이 없습니다. [브리핑 항목 설정]에서 사용할 항목을 고르세요.");
    const gid = uid("b");
    const now = new Date().toISOString();
    const warnings = aim === true ? aimWarnings() : null;
    const plan = items.map((it, i) => {
      // 질문 글·briefing 칸(lib/library briefRequest — 질의문 그대로)
      const a: AskArgs = withRefs({ ...briefRequest(it, i, items.length, regionName), source: "BRIEFING", warnings, ...showPin(it.question, i) });
      // 현황판(D1)용 — 브리핑 설정의 항목 이름·보낸 기준지역 이름을 턴에 함께 둔다(요청에는 넣지 않음)
      const group: BriefGroup = { id: gid, no: i + 1, total: items.length, title: "현재 상황 브리핑", label: it.label?.trim() || undefined, region: regionName };
      const t: Turn = { id: uid("t"), jobId: "", pending: true, q: a.question, source: "BRIEFING", libraryId: a.libraryId ?? null, at: now, args: a, group };
      return { a, t };
    });
    const c = appendTurns("현재 상황 브리핑", plan.map((p) => p.t), null);
    await Promise.all(plan.map((p, i) => submitInto(c.id, p.t.id, p.a, i + 1).catch(() => null)));
  };

  /** 실패한 턴 다시 보내기 — 접수 실패면 같은 내용으로, 답 실패·유실이면 서버가 같은 요청(문맥 포함)을 다시 보낸다 */
  const retryTurn = useCallback(
    async (convId: string, t: Turn) => {
      if (!t.jobId) {
        if (!t.args) return;
        const c = current(convId);
        // 지금 기준지역으로 보내게 되므로 — 이 대화를 시작한 기준지역과 다르면 다시 보내지 않는다(R32 대화 하나는 기준지역 하나)
        if (otherBase(c, t.args.base !== undefined ? t.args.base : sRef.current.cond.base)) return sRef.current.toast(`기준지역이 이 대화(${c?.baseName})와 달라 다시 보낼 수 없습니다.`);
        patchTurn(convId, t.id, { pending: true, error: undefined });
        await submitInto(convId, t.id, t.args, (c?.turns.findIndex((x) => x.id === t.id) ?? 0) + 1).catch(toastErr);
        return;
      }
      try {
        const r = await api<{ job: JobSummary }>(`/api/agent/jobs/${t.jobId}/retry`, { method: "POST" });
        sRef.current.watch(r.job.id);
        patchTurn(convId, t.id, { jobId: r.job.id });
      } catch (e) {
        toastErr(e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchTurn, submitInto],
  );

  // AI 모드 창의 [브리핑 시작]·브리핑 타일 (AiModeModal → 이벤트), 도움말 예시 질문·다른 화면에서 온 요청(?q= · ?brief=1)
  const briefRef = useRef(startBriefing);
  briefRef.current = startBriefing;
  const askBriefRef = useRef(askBrief);
  askBriefRef.current = askBrief;
  const askRef = useRef(ask);
  askRef.current = ask;
  const askWxRef = useRef(askWx);
  askWxRef.current = askWx;
  useEffect(() => {
    // sa:briefing 은 AI 모드 창만 보낸다 — 발효 특보를 싣는다
    const onBrief = () => briefRef.current(true).catch(toastErr);
    const onAsk = (e: Event) => { const d = (e as CustomEvent<{ q: string; aim?: boolean }>).detail; askBriefRef.current(d.q, d.aim === true); };
    // 특보 상세 「이 특보로 질의」 — 다른 화면에서 맡기고 옮겨 왔으면 처음 그릴 때 받아 간다
    const onWx = () => { const r = takeWxAsk(); if (r) void askWxRef.current(r); };
    onWx();
    window.addEventListener("sa:briefing", onBrief);
    window.addEventListener("sa:ask-brief", onAsk);
    window.addEventListener(WX_ASK_EVENT, onWx);
    return () => { window.removeEventListener("sa:briefing", onBrief); window.removeEventListener("sa:ask-brief", onAsk); window.removeEventListener(WX_ASK_EVENT, onWx); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handledQ = useRef<string | null>(null);
  useEffect(() => {
    if (!s.account) return;
    const q = sp.get("q"), brief = sp.get("brief"), bq = sp.get("bq");
    const key = `${q}|${brief}|${bq}`;
    if ((!q && !brief && !bq) || handledQ.current === key) return;
    // 브리핑 세트는 이 계정의 브리핑 세트를 서버에서 다 읽은 뒤에 — 읽기 전 기본 항목이 나가지 않게
    if (brief && !q && !briefLoaded) return;
    handledQ.current = key;
    if (q) askRef.current({ question: q, source: "USER" }, undefined, true).catch(toastErr);
    // ?brief=1 · ?bq= 는 다른 화면에서 연 AI 모드 창이 보낸다(components/explore/AiModeModal) — 발효 특보를 싣는다
    else if (brief) briefRef.current(true).catch(toastErr);
    else if (bq) askBriefRef.current(bq, true);
    router.replace("/explore");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, s.account, briefLoaded]);

  // ── 지도: 지금 보는 답(턴 기준 표시 — 개발 서버 mapRefs)의 refs + 서버가 미리 받은 도형(geo) ──
  // 새 턴이 붙으면 고른 답을 놓고 마지막 답을 따라간다
  const nTurns = conv?.turns.length ?? 0;
  useEffect(() => setMapJob(null), [conv?.id, nTurns]);
  const answered = useCallback((jobId: string) => !!s.full[jobId]?.raw, [s.full]);
  /**
   * 지도가 그릴 답 — 고른 답(답 글·대상·카드에서 짚은 것)이 있으면 그 답만, 없으면 마지막 묶음이 브리핑이면 그 브리핑 항목 전부,
   * 아니면 마지막으로 답이 온 턴. 대화는 마지막 턴만 — 앞 턴 대상까지 찍히면 지도가 「여태 물은 것 전부」가 된다
   */
  const mapScope = useMemo(() => {
    const turns = (conv?.turns ?? []).filter((t) => t.jobId);
    if (mapJob && turns.some((t) => t.jobId === mapJob)) return { key: mapJob, jobs: [mapJob], summaryJob: mapJob };
    const last = turns[turns.length - 1];
    const bg = !showConv && lastBrief ? lastBrief : last?.group;
    if (bg) {
      const jobs = turns.filter((t) => t.group?.id === bg.id).map((t) => t.jobId);
      return { key: `b:${bg.id}`, jobs, summaryJob: null as string | null };
    }
    for (let i = turns.length - 1; i >= 0; i--) if (answered(turns[i].jobId)) return { key: turns[i].jobId, jobs: [turns[i].jobId], summaryJob: turns[i].jobId };
    return { key: "", jobs: [] as string[], summaryJob: null as string | null };
  }, [conv, mapJob, answered, showConv, lastBrief]);
  const mapData = useMemo(() => {
    const out: MapFeature[] = [];
    const seen = new Set<string>();
    let missing = 0;
    const missingItems: { key: string; jobId: string; name: string; entityType: string }[] = [];
    let loading = false;
    let failed = false;
    for (const jobId of mapScope.jobs) {
      const f = s.full[jobId];
      if (!f) {
        if (s.jobs[jobId]?.state === "DONE") loading = true;
        continue;
      }
      const refs = (f.raw?.result?.refs ?? []) as T3qRef[];
      const feats = f.geo?.result?.features ?? [];
      // 도형을 아직 받는 중(geo 없음 — 서버가 답 직후 받아 저장한다)이면 실패가 아니라 불러오는 중
      if (refs.some((r) => r.map?.value)) {
        if (!f.geo) loading = true;
        else if (f.geo.status !== "SUCCESS" && f.geo.status !== "PARTIAL_SUCCESS") failed = true;
      }
      // EXT-01 은 같은 key·value 를 한 번만 돌려준다(마지막 ref 로) — 같은 대상을 가리키는 ref 모두에 그 도형을 쓴다
      const byKV = new Map(feats.map((ft) => [`${ft.properties.key}|${ft.properties.value}`, ft]));
      for (const r of refs) {
        const eid = entityKey(r);
        // 같은 대상을 여러 항목(브리핑)이 가리키면 한 번만 — 핀이 겹쳐 쌓이면 수가 부풀어 보인다
        if (seen.has(eid)) continue;
        seen.add(eid);
        const ft = r.map ? byKV.get(`${r.map.key}|${r.map.value}`) : undefined;
        if (!ft) {
          missing += 1;
          missingItems.push({ key: `${jobId}:${r.ref}`, jobId, name: r.display_name ?? r.ref, entityType: r.entity_type ?? "" });
          continue;
        }
        out.push({ key: `${jobId}:${r.ref}`, ref: r.ref, jobId, entityType: r.entity_type, displayName: r.display_name, draw: r.map.draw, precision: ft.properties.precision ?? null, geometry: ft.geometry, eid, mapValue: r.map.value, t3qRef: r });
      }
    }
    return { features: out, missing, missingItems, status: failed ? ("failed" as const) : loading ? ("loading" as const) : null };
  }, [mapScope, s.full, s.jobs]);
  const features = mapData.features;
  /** 「한눈 요약」이 그릴 답 — 지도와 같은 턴(브리핑 묶음 전체를 볼 때는 없음). 개발 서버 summaryOf */
  const summary = useMemo(() => {
    const id = mapScope.summaryJob;
    const f = id ? s.full[id] : undefined;
    if (!id || !f?.raw) return null;
    const refs = (f.raw.result?.refs ?? []) as T3qRef[];
    return { jobId: id, refs, regionName: conv?.baseName, basisAt: basisTime(receivedAt(f, f) ?? f.created_at) };
  }, [mapScope, s.full, conv?.baseName]);
  // 고른 답에 한눈 요약이 없으면 「한눈 요약」 탭에 머물지 않고 지도로 — 고른 답이 바뀐 순간에만(사람이 탭을 직접 누르면 막지 않는다)
  const lastSummaryJob = useRef(summary?.jobId ?? null);
  useEffect(() => {
    const id = summary?.jobId ?? null;
    if (lastSummaryJob.current === id) return;
    lastSummaryJob.current = id;
    if (active === "summary" && !summary?.refs.length) setActive("map");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary?.jobId]);

  const showOnMap = (jobId: string, ref?: string) => {
    setMapJob(jobId);
    setSelectedKey(ref ? `${jobId}:${ref}` : null);
    setFocusToken((n) => n + 1);
    setActive("map");
    setPanelOpen(true);
  };
  // 상세 탭은 최대 8개 — 넘치면 가장 먼저 연 것부터 닫고 막 연 탭은 남긴다(개발서버 panelTabs.capDetailTabs · 96c419a)
  const openTab = (t: PanelTab) => {
    setTabs((p) => (p.some((x) => x.key === t.key) ? p : capDetailTabs([...p, t], t.key)));
    setActive(t.key);
    setPanelOpen(true);
  };
  const x: ExploreApi = {
    openCitation: (c: Citation) => openTab({ key: `doc:${c.docId}:${c.page ?? ""}`, kind: "doc", title: c.title, citation: c }),
    openDetail: (api, id, label, ctx) => openTab({ key: `d:${api}:${id}`, kind: "detail", title: label, detail: { api, id, label, ctx } }),
    showOnMap: (jobId, ref) => showOnMap(jobId, ref),
    openEntity: (jobId, r) => {
      // 개발서버 usePanel.openEntity — 탭은 만들되(열쇠가 없어도 — 상세 탭이 「지역 단위로 가리킨 것」을 알린다) 보이는 것은 지도
      const id = detailIdOf(r);
      const label = r.display_name ?? r.ref;
      // 침수흔적은 T3Q-15 에 없다 — 침수흔적 조회(T3Q-30)로(개발서버 a4cb228)
      const apiId = isFloodTrace(r) ? "T3Q-30" : "T3Q-15";
      const key = `d:${apiId}:${id ?? `${jobId}:${r.ref}`}`;
      const tab: PanelTab = { key, kind: "detail", title: label, detail: { api: apiId, id: id ?? "", label, ctx: { mapJob: jobId, mapRef: r.ref }, entityType: r.entity_type ?? null } };
      setTabs((p) => (p.some((t) => t.key === key) ? p : capDetailTabs([...p, tab], key)));
      showOnMap(jobId, r.ref);
    },
    selectOnMap: (key) => {
      // 지도에서 누름 — 고른 표시만(지도는 MapView 가 배율 그대로 가운데로 옮긴다)
      setMapJob(key.split(":")[0]);
      setSelectedKey(key);
    },
    openEvidence: (jobId, row, rows, view) => {
      // 탭은 하나 — 다른 근거를 누르면 그 자리에서 내용만 바뀐다(탭이 근거 수만큼 늘지 않게)
      // 이미 있으면 그 자리에서 바꾸고, 새로 열면 상세 탭 수 제한 안으로(개발서버 usePanel.openEvidence · capDetailTabs)
      setTabs((p) => {
        const tab: PanelTab = { key: "evidence", kind: "evidence", title: "근거 문서", evidence: { jobId, row, rows, view } };
        return p.some((t) => t.kind === "evidence") ? p.map((t) => (t.kind === "evidence" ? tab : t)) : capDetailTabs([...p, tab], tab.key);
      });
      setActive("evidence");
      setPanelOpen(true);
    },
    activeEvidence: (() => {
      const e = active === "evidence" ? tabs.find((t) => t.kind === "evidence")?.evidence : undefined;
      return e?.row.doc ? { jobId: e.jobId, doc: e.row.doc } : null;
    })(),
    showSummary: (jobId) => {
      setMapJob(jobId);
      setActive("summary");
      setPanelOpen(true);
    },
    selectedKey,
    retry: (jobId) => {
      const c = convRef.current;
      const t = c?.turns.find((x) => x.jobId === jobId);
      if (c && t) retryTurn(c.id, t);
    },
    askSuggested,
  };

  /**
   * 질문 현황에서 고름 — 그 질문 위치로(답변 생성 중인 대화 질문도 · 개발서버 selectAsk · FUN-UFR-301010). 브리핑 항목이면 그 항목(없으면 브리핑 묶음)으로.
   * 질문 현황은 지금 대화의 질문만 올리므로 대화를 옮기는 일은 없다(개발서버 useAskList). 답이 있는 줄이면 지도·한눈 요약도 그 답으로(개발서버 asks.select → mapTurnOf)
   */
  const pickFromQueue = (e: AskEntry) => {
    if (e.jobId) setMapJob(e.jobId);
    // 대화 질문이면 대화로, 브리핑 항목이면 브리핑으로(개발서버 SearchPage 가운데 칸 전환)
    setConvSel(e.groupId ? null : e.id);
    // 브리핑 항목이면 그 항목을 크게 보기로(개발서버 BriefingAnswer) — 브리핑 화면이 서고 나서
    if (e.groupId) setTimeout(() => showBriefItem(e.id), 30);
    setTimeout(
      () =>
        (document.querySelector(`[data-turn-id="${e.id}"]`) ?? document.getElementById(`job-${e.jobId}`) ?? (e.groupId ? document.getElementById(`brief-${e.groupId}`) : null))?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      50,
    );
  };
  // 질문 현황에서 고른 줄 — 지도가 따라가는 답(mapJob)의 턴
  const pickedTurnId = mapJob ? conv?.turns.find((t) => t.jobId === mapJob)?.id ?? null : null;

  /** 구분선 — 이 턴 뒤에 설 것(턴 id 로 짚는다). afterTurnId 가 null 이면 첫 턴 앞 */
  const convBreaks = conv ? breaks[conv.id] ?? [] : [];
  const breaksAfter = (t: Turn) => convBreaks.filter((b) => b.afterTurnId === t.id);
  const breakLine = (b: RegionBreak, i: number) => (
    <div key={`rb-${b.at}-${i}`} className="answer-region-break" role="note" aria-label="기준지역 변경">
      <span>{regionBreakText(b.from, b.to, new Date(b.at))}</span>
    </div>
  );

  /** 대화 머리줄 — 제목·[수정]·[새 대화](개발서버 AnswerPanel answer-head) */
  const convHead = conv ? (
    <header className="thread-h answer-head">
      <TitleEdit
        title={conv.title}
        onSave={(title) => {
          const c = current(conv.id) ?? conv;
          // 사람이 고친 제목 — 상류가 준 제목으로 덮지 않는다(개발서버 RecordTurn). 대화 이력 목록에도 바로 반영
          commit({ ...c, title: title.slice(0, 100), renamed: true, updatedAt: new Date().toISOString() }, true);
        }}
      />
      {/* [새 대화] — 도는 질문이 있으면 중지 안내창을 먼저(개발서버 startNewConversation · FUN-UFR-306004) */}
      <button type="button" className="answer-new" onClick={() => requestLeave("new", newConv)}><IcPlus size={16} /> 새 대화</button>
    </header>
  ) : null;

  const fixedTabs = manualOn ? [MAP_TAB, SUMMARY_TAB, SOP_TAB] : [MAP_TAB, SUMMARY_TAB];
  const panelTabs = [...fixedTabs, ...tabs.filter((t) => t.kind !== "map" && t.kind !== "sop" && t.kind !== "summary")];

  // 질문 목록 맨 위 「(브리핑 이름) 전체 보기」 — 이 대화의 마지막 브리핑 묶음으로(개발서버 AskList briefingTitle)
  const briefRow = lastBrief
    ? {
        title: lastBrief.title || "현재 상황 브리핑",
        // 브리핑 전체로 — 고른 답을 놓는다(지도도 브리핑 묶음 전체로 · 개발서버 asks.clear)
        onShow: () => {
          setMapJob(null);
          setConvSel(null);
          showBriefItem(null);
          setTimeout(() => document.getElementById(`brief-${lastBrief.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        },
        shown: mapScope.key === `b:${lastBrief.id}`,
      }
    : null;

  return (
    <ExploreContext.Provider value={x}>
      <div id="main-content" tabIndex={-1} className={`explore ${panelOpen ? "with-panel" : ""} ${queueOpen && conv?.turns.length ? "with-queue" : ""} ${dragging ? "dragging" : ""}`} style={{ "--chat-w": `${chatW}%` } as React.CSSProperties}>
        {/* 질문 현황 — 지금 대화의 질문만, 질문이 하나라도 있을 때(개발서버 SearchPage asks.any) */}
        {conv && conv.turns.length > 0 && (
          <QueuePanel open={queueOpen} setOpen={setQueueOpen} turns={conv.turns} selectedId={pickedTurnId} onPick={pickFromQueue} briefing={briefRow} />
        )}
        <main className="ex-main" ref={mainRef}>
          {!panelOpen && (
            <button className="btn panel-open" onClick={() => setPanelOpen(true)}><IcChevL size={14} /> 패널 펼치기</button>
          )}
          {conv && !showConv ? (
            /* 브리핑 화면(개발서버 BriefingPanel) — 안쪽 모양은 BriefBoard 가 맡는다. 머리줄까지 함께 구른다 */
            <div className="thread thread--brief">
              {convHead}
              {blocks.filter((b) => b.group).slice(-1).map((b) => (
                <section key={b.group!.id} className="brief-block" id={`brief-${b.group!.id}`}>
                  <div className="qbubble">
                    <ol>{b.turns.map((t) => <li key={t.id}>{t.q}</li>)}</ol>
                  </div>
                  {/* 기준지역 — 보낼 때 남긴 이름(group.region)이 없는 예전 브리핑은 이 대화의 기준지역(지금 고른 지역이 아니라) */}
                  <BriefBoard
                    turns={b.turns}
                    regionName={conv.baseName ?? (conv.region === "national" ? "전국" : (REGIONS[conv.region]?.name ?? regionName))}
                    renderBody={(t, large) => <TurnBody t={t} compact={!large} inBrief onRetry={() => retryTurn(conv.id, t)} />}
                    onRetry={(t) => retryTurn(conv.id, t)}
                    onNew={() => requestLeave("new", newConv)}
                    disasterType={conv.disasterType}
                  />
                </section>
              ))}
            </div>
          ) : conv && convTurns.length > 0 ? (
            /* 대화(개발서버 AnswerPanel) — 머리줄은 붙박이, 턴 목록만 구른다 */
            <div className="thread thread--conv">
              {convHead}
              <div className="thread-turns">
                {convBreaks.filter((b) => b.afterTurnId === null).map(breakLine)}
                {conv.turns.map((t) => (
                  <Fragment key={t.id}>
                    {!t.group && (
                      <section
                        className={`turn${convTurns.length > 1 && t.jobId && t.jobId === mapScope.key ? " answer-turn--on-map" : ""}`}
                        data-turn-id={t.id}
                        id={t.jobId ? `job-${t.jobId}` : undefined}
                        // 버블링으로 받는다 — 답 속 이름을 눌러도 이 턴이 지도의 기준이 된다(개발서버 onSelectTurn)
                        onClick={() => t.jobId && setMapJob(t.jobId)}
                      >
                        {/* 보낸 질문 말풍선 — 굴러도 제 턴이 끝날 때까지 맨 위에 붙어 있는다(개발서버 answer-ask-row) */}
                        <div className="answer-ask-row">
                          <p className="qbubble">{t.q}</p>
                        </div>
                        <TurnBody t={t} onRetry={() => retryTurn(conv.id, t)} />
                      </section>
                    )}
                    {breaksAfter(t).map(breakLine)}
                  </Fragment>
                ))}
              </div>
            </div>
          ) : (
            <StartScreen
              regionName={regionName}
              onBriefing={() => startBriefing().catch(toastErr)}
              onPick={pickTile}
            />
          )}
          <Composer
            onAsk={askText}
            onBriefing={() => startBriefing().catch(toastErr)}
            onLibrary={() => setLibOpen((v) => !v)}
            libraryOpen={libOpen}
            objectRefs={picked.map((x) => ({ id: x.eid, name: x.ref.display_name ?? x.ref.ref }))}
            onDropRef={(eid) => setPicked((list) => list.filter((x) => x.eid !== eid))}
            expired={isExpired(conv)}
            locked={lock.locked}
            briefDisabled={lock.running || lock.briefingRunning}
          />
        </main>
        {panelOpen && (
          <div className="ex-split" role="separator" aria-orientation="vertical" aria-label="대화와 지도 너비 조절" aria-valuenow={chatW} aria-valuemin={22} aria-valuemax={78} tabIndex={0}
            onPointerDown={startDrag}
            onKeyDown={(e) => { if (e.key === "ArrowLeft") setChatW(chatW - 4); if (e.key === "ArrowRight") setChatW(chatW + 4); }}>
            <button className="ex-split-btn" title="지도 넓게" aria-label="지도 넓게" onPointerDown={(e) => e.stopPropagation()} onClick={() => setChatW(chatW > 40 ? 35 : 25)}>◀</button>
            <span className="grip" />
            <button className="ex-split-btn" title="기본 너비" aria-label="기본 너비" onPointerDown={(e) => e.stopPropagation()} onClick={() => setChatW(52)}>↔</button>
            <span className="grip" />
            <button className="ex-split-btn" title="대화 넓게" aria-label="대화 넓게" onPointerDown={(e) => e.stopPropagation()} onClick={() => setChatW(chatW < 60 ? 65 : 75)}>▶</button>
          </div>
        )}
        {panelOpen && (
          <RightPanel
            tabs={panelTabs}
            active={panelTabs.some((t) => t.key === active) ? active : "map"}
            setActive={setActive}
            close={(k) => { setTabs((p) => p.filter((t) => t.key !== k)); if (active === k) setActive("map"); }}
            closeAll={() => setPanelOpen(false)}
            closeTabs={() => {
              // [모두 닫기] — 상세 탭만 닫고 붙박이 탭(지도·한눈 요약·대응절차)은 남긴다. 보던 탭이 닫히면 지도로(개발서버 usePanel.closeAll)
              setTabs((p) => p.filter((t) => !isClosable(t)));
              setActive((a) => (a === "map" || a === "summary" || a === "sop" ? a : "map"));
            }}
            features={features}
            activeJobId={null}
            mapScope={mapScope.key}
            missing={mapData.missing}
            missingItems={mapData.missingItems}
            resultStatus={mapData.status}
            focusToken={focusToken}
            sopFocus={sopFocus}
            summary={summary}
            picking={picking}
            onPicking={setPicking}
            pickedIds={pickedIds}
            onTogglePick={(f) => {
              const r = (s.full[f.jobId]?.raw?.result?.refs as T3qRef[] | undefined)?.find((x) => x.ref === f.ref);
              if (r) togglePick(f.eid ?? entityKey(r), r);
            }}
          />
        )}
        {libOpen && autoDemo.phase === "idle" && (
          <LibraryDrawer
            regionName={regionName}
            busy={lock.locked}
            onClose={() => setLibOpen(false)}
            onAsk={(q) => { setLibOpen(false); askLib(q); }}
            onAskDemo={(d) => { setLibOpen(false); askDemo(d); }}
            onAskSuggest={(t) => { setLibOpen(false); askSuggest(t); }}
          />
        )}
        <AutoDemoBar demo={autoDemo}><AimPrep /></AutoDemoBar>
        {autoDemo.picking && <ScenarioPicker onPick={autoDemo.choose} onClose={autoDemo.cancelPick} />}
        {/* 대화 전환 확인 — 제목·단추는 개발서버 글자 그대로, 본문은 상황별 짧은 문구(leaveMessage) · 모양은 개발서버 Modal(role dialog) */}
        {leave && leaveAct && (
          <Dialog
            title={LEAVE_TITLE[leave.kind]}
            desc={leaveMessage(leaveAct.running, leaveAct.waiting)}
            onClose={cancelLeave}
            footer={
              <>
                <button type="button" className="acm-btn" onClick={cancelLeave}>취소</button>
                <button type="button" className="acm-btn pri" onClick={confirmLeave}>{LEAVE_OK[leave.kind]}</button>
              </>
            }
          />
        )}
      </div>
    </ExploreContext.Provider>
  );
}

/** 한 턴의 본문 — 보내는 중 · 접수 실패 · 에이전트 답 */
function TurnBody({ t, compact, inBrief, onRetry }: { t: Turn; compact?: boolean; inBrief?: boolean; onRetry: () => void }) {
  const s = useSession();
  // 접수 실패 — 답 실패와 같은 알럿 한 덩이(개발서버 answer-error). 브리핑 항목은 머리의 [다시 시도]로
  if (t.error) return <AnswerError text={t.error} onRetry={inBrief ? undefined : onRetry} />;
  // 보내는 중 — 개발서버는 보내는 즉시 「답변을 만들고 있습니다…」(브리핑 항목은 「확인하고 있습니다…」)로 센다. 작업 번호를 받기 전이라 취소 단추는 없다
  if (t.pending || !t.jobId) return <AnswerWait text={inBrief ? "확인하고 있습니다…" : "답변을 만들고 있습니다…"} since={t.at} brief={inBrief} />;
  const job = s.jobs[t.jobId];
  const full = s.full[t.jobId];
  if (!job) return <AnswerWait text="불러오는 중…" brief={inBrief} />;
  return <AnswerCard job={job} full={full} compact={compact} noActions={inBrief} brief={inBrief} />;
}

/** 대화 제목 보기·수정 — 개발서버 AnswerPanel 제목 · [수정](연필) · TitleEditor(Enter 저장 · Esc 취소). 빈 제목은 「새 대화」, 비운 채 저장하면 그대로 둔다 */
function TitleEdit({ title, onSave }: { title: string; onSave: (t: string) => void }) {
  const [edit, setEdit] = useState(false);
  if (!edit)
    return (
      <>
        <h2 className="answer-title">{title || "새 대화"}</h2>
        <button type="button" className="answer-title-edit" onClick={() => setEdit(true)} aria-label="대화 제목 수정">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M11.5 2.5 13.5 4.5 5.5 12.5 2.5 13.5 3.5 10.5z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          수정
        </button>
      </>
    );
  return (
    <TitleEditor
      title={title}
      onSave={(v) => {
        if (v.trim()) onSave(v.trim());
        setEdit(false);
      }}
      onCancel={() => setEdit(false)}
    />
  );
}

function TitleEditor({ title, onSave, onCancel }: { title: string; onSave: (t: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(title);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="answer-title-edit-box">
      <input
        ref={ref}
        className="answer-title-input"
        value={draft}
        maxLength={100}
        aria-label="대화 제목"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(draft);
          if (e.key === "Escape") onCancel();
        }}
      />
      <button type="button" className="answer-title-save" onClick={() => onSave(draft)}>저장</button>
      <button type="button" className="answer-title-cancel" onClick={onCancel}>취소</button>
    </div>
  );
}
