"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, uid, type Conversation, type SubmitArgs, type Turn } from "@/lib/session";
import { useSop } from "@/lib/sopState";
import { useBriefState } from "@/lib/briefing";
import { briefRequest, demoAsk, fillText, libById, presetLines, presetManual, type DemoItem, type LibraryQuestion } from "@/lib/library";
import { REGIONS } from "@/lib/config";
import { api } from "@/lib/api";
import type { Citation } from "@/lib/contract/agent";
import { activeAdvisories, advName, warningsPayload } from "@/lib/wxref";
import { baseName, baseTarget, type BaseRegion } from "@/lib/baseRegion";
import { SOURCE_LABEL, type JobSummary, type T3qRef } from "@/lib/jobTypes";
import { ExploreContext, type ExploreApi, type PanelTab } from "@/components/explore/ExploreCtx";
import RightPanel from "@/components/explore/RightPanel";
import Composer from "@/components/explore/Composer";
import StartScreen from "@/components/explore/StartScreen";
import LibraryDrawer from "@/components/explore/LibraryDrawer";
import BriefBoard, { type BriefGroup } from "@/components/explore/BriefBoard";
import QueuePanel from "@/components/queue/QueuePanel";
import AnswerCard from "@/components/answer/AnswerCard";
import DataCard from "@/components/answer/DataCard";
import type { MapFeature } from "@/components/map/MapView";
import { IcChevL } from "@/components/Icons";

const SOP_TAB: PanelTab = { key: "sop", kind: "sop", title: "대응절차", pinned: true };
const MAP_TAB: PanelTab = { key: "map", kind: "map", title: "지도" };
type AskArgs = Omit<SubmitArgs, "convId" | "turnNo">;
/** 대화를 시작한 기준지역(이름)이 지금 기준지역과 다른가(R32 — 대화 하나는 기준지역 하나). 이름이 없는 예전 대화는 따지지 않는다 */
const otherBase = (c: Conversation | null | undefined, now: BaseRegion | null) => !!c?.baseName && c.baseName !== baseName(now);

export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <Explore />
    </Suspense>
  );
}

function Explore() {
  const s = useSession();
  const sop = useSop();
  const sp = useSearchParams();
  const router = useRouter();
  const { items: briefItems, loaded: briefLoaded } = useBriefState();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [queueOpen, setQueueOpen] = useState(true);
  const [libOpen, setLibOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tabs, setTabs] = useState<PanelTab[]>([MAP_TAB]);
  const [active, setActive] = useState("map");
  const [sopFocus, setSopFocus] = useState<{ id: string; n: number } | undefined>(undefined);
  const [mapJob, setMapJob] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [follow, setFollow] = useState<{ jobId: string; refs: T3qRef[]; label: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // 지금 보고 있는 대화 + 대화별 최신본(연달아 보낼 때 앞선 턴이 지워지지 않게 — 항상 최신본에 붙인다)
  const convRef = useRef<Conversation | null>(null);
  convRef.current = conv;
  const latest = useRef(new Map<string, Conversation>());
  const sRef = useRef(s);
  sRef.current = s;

  // 기준지역(R32) — 이름(질문의 {지역})·특보 맞추기는 지금 고른 기준지역으로
  const regionName = baseName(s.cond.base);
  const wxTarget = baseTarget(s.cond.base);

  /** 새 대화 — 빈 대화(시작 화면)로. [＋ 새 대화] 단추와 머리줄 기준지역 변경(sa:new-conv)이 함께 쓴다 */
  const newConv = useCallback(() => {
    setConv(null);
    setFollow(null);
    router.replace("/explore");
  }, [router]);
  useEffect(() => {
    window.addEventListener("sa:new-conv", newConv);
    return () => window.removeEventListener("sa:new-conv", newConv);
  }, [newConv]);

  // 질문이 있는 대화가 열려 있는지 머리줄에 알린다(기준지역을 바꾸면 새 대화로 시작할지 묻도록) — 화면을 떠나면 닫힌 것으로
  const { setConvOpen } = s;
  const hasTurns = !!conv?.turns.length;
  useEffect(() => setConvOpen(hasTurns), [hasTurns, setConvOpen]);
  useEffect(() => () => setConvOpen(false), [setConvOpen]);

  // 이력에서 연 대화 (?c=) — 그 id 로 한 번만 연다(이후 새 대화를 시작해도 되돌아가지 않게)
  const openedC = useRef<string | null>(null);
  useEffect(() => {
    const id = sp.get("c");
    if (!id || openedC.current === id) return;
    const c = s.convs.find((x) => x.id === id);
    if (c && c.v === 2) {
      openedC.current = id;
      setConv(latest.current.get(c.id) ?? c);
    }
  }, [sp, s.convs]);

  // 대화를 바꾸면 이어서 묻기 해제
  useEffect(() => {
    setFollow((f) => (f && !(conv?.turns ?? []).some((t) => t.jobId === f.jobId) ? null : f));
  }, [conv?.id, conv?.turns]);

  // 대응절차 탭 열기 요청(대응 단계 바)
  useEffect(() => {
    if (!sop.openReq || !sop.enabled) return;
    setPanelOpen(true);
    setActive("sop");
    const f = sop.openReq.focus;
    if (f) setSopFocus((p) => ({ id: f, n: (p?.n ?? 0) + 1 }));
    sop.clearOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sop.openReq, sop.enabled]);

  // 대화의 작업 상태 따라가기 + 완료되면 원응답 받기
  const turnJobIds = useMemo(() => new Set((conv?.turns ?? []).map((t) => t.jobId).filter(Boolean)), [conv]);
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conv?.turns.length]);

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

  /** 턴 붙이기 — baseId 가 없으면 새 대화 */
  const appendTurns = useCallback(
    (title: string, add: Turn[], baseId: string | null) => {
      const now = new Date().toISOString();
      const base = baseId ? current(baseId) : null;
      const c: Conversation = base
        ? { ...base, turns: [...base.turns, ...add], updatedAt: now }
        : {
            id: uid("c"), title: title.slice(0, 60), region: sRef.current.cond.region, baseName: baseName(sRef.current.cond.base),
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
        return job;
      } catch (e) {
        patchTurn(convId, turnId, { pending: undefined, error: (e as Error).message });
        throw e;
      }
    },
    [patchTurn],
  );

  /** 질문 보내기 — 이력에서 다시 연 대화의 기준지역이 지금과 다르면 새 대화로(질문은 지금 기준지역으로 가므로) */
  const ask = useCallback(
    async (a: AskArgs, extra?: Partial<Turn>, newConv = false) => {
      const open = convRef.current;
      const moved = !newConv && otherBase(open, sRef.current.cond.base);
      if (moved) sRef.current.toast(`기준지역이 이 대화(${open?.baseName})와 달라 새 대화로 보냅니다.`);
      const tid = uid("t");
      const t: Turn = { id: tid, jobId: "", pending: true, q: a.question, source: a.source, libraryId: a.libraryId ?? null, at: new Date().toISOString(), args: a, ...extra };
      const c = appendTurns(a.question, [t], newConv || moved ? null : open?.id ?? null);
      return submitInto(c.id, tid, a, c.turns.length);
    },
    [appendTurns, submitInto],
  );
  const toastErr = (e: unknown) => s.toast((e as Error).message);

  /** 지금 기준지역에서 발효 중인 특보(AI 모드 질의·브리핑에 원문 그대로) — 시연 시나리오를 켠 시연 계정은 서버가 준 시나리오 특보만(R45 — 기상청 실시간 끊음). 「시연 세트 예열」 lib/server/warmPlan briefWarningsOf 와 같은 계산 */
  const liveWarnings = () => warningsPayload(s.weather, activeAdvisories(s.weather, wxTarget));

  const askText = async (q: string) => {
    if (follow) {
      await ask({ question: q, source: "FOLLOW_UP", followUp: { jobId: follow.jobId, refs: follow.refs.map((r) => ({ display_name: r.display_name, entity_type: r.entity_type })) } });
      setFollow(null);
      return;
    }
    const ref = s.wxRef;
    // 참조 특보가 그사이 해제됐으면 떼고 보낸다(해제된 특보를 현재 특보로 보내지 않게)
    const still = ref ? activeAdvisories(s.weather, wxTarget).find((a) => a.id === ref.id) : undefined;
    if (ref && !still) {
      s.setWxRef(null);
      s.toast("참조한 특보가 해제되어 특보 참조 없이 보냅니다.");
    }
    await ask(
      { question: q, source: still ? "QUICK" : "USER", warnings: still ? warningsPayload(s.weather, [still]) : null },
      still ? { refAdv: { type: still.type, level: still.level, area: still.area, issuedAt: still.issuedAt, ...(still.scenario ? { scenario: true } : {}) } } : undefined,
    );
  };
  const askLib = (q: LibraryQuestion, source: "LIBRARY" | "BRIEFING" = "LIBRARY") =>
    ask({ question: fillText(q, regionName), source, libraryId: q.id, quickQueryId: q.quickQueryId ?? null, warnings: source === "BRIEFING" && s.aimOn ? liveWarnings() : null }, undefined, source === "BRIEFING").catch(toastErr);
  /** 브리핑 항목 하나 질의 (시작 화면 타일 · AI 모드 타일) — q 는 질의문 원형 */
  const askBrief = (q: string, preset?: string) => {
    const lib = preset ? libById(preset) : undefined;
    if (lib && lib.text === q) return askLib(lib, "BRIEFING");
    return ask({ question: q.replaceAll("{지역}", regionName), source: "BRIEFING", warnings: s.aimOn ? liveWarnings() : null }, undefined, true).catch(toastErr);
  };
  /** 질문 모음 「재난담당자의 하루」 — 질문 모음 질문과 같은 경로(자동 조회 먼저), 항목의 조건 프리셋은 이 질문에만 싣는다(세션 조건 그대로) */
  const askDemo = (d: DemoItem) => ask(demoAsk(d)).catch(toastErr);

  /** 브리핑 세트 — 항목마다 자리 턴을 먼저 만들고(실패해도 자리 유지) 동시에 보낸다(R2) */
  const startBriefing = async () => {
    const items = briefItems;
    if (!items.length) return s.toast("브리핑 항목이 없습니다. 브리핑 항목 설정에서 고르세요.");
    const gid = uid("b");
    const now = new Date().toISOString();
    const warnings = s.aimOn ? liveWarnings() : null;
    const plan = items.map((it, i) => {
      // 질문 글·문항·briefing 칸 — 「시연 세트 예열」과 같은 함수(lib/library briefRequest)
      const a: AskArgs = { ...briefRequest(it, i, items.length, regionName), source: "BRIEFING", warnings };
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
        if (otherBase(c, sRef.current.cond.base)) return sRef.current.toast(`기준지역이 이 대화(${c?.baseName})와 달라 다시 보낼 수 없습니다.`);
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
  useEffect(() => {
    const onBrief = () => briefRef.current().catch(toastErr);
    const onAsk = (e: Event) => { const d = (e as CustomEvent<{ q: string; preset?: string }>).detail; askBriefRef.current(d.q, d.preset); };
    window.addEventListener("sa:briefing", onBrief);
    window.addEventListener("sa:ask-brief", onAsk);
    return () => { window.removeEventListener("sa:briefing", onBrief); window.removeEventListener("sa:ask-brief", onAsk); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handledQ = useRef<string | null>(null);
  useEffect(() => {
    if (!s.account) return;
    const q = sp.get("q"), brief = sp.get("brief"), bq = sp.get("bq");
    const key = `${q}|${brief}|${bq}`;
    if ((!q && !brief && !bq) || handledQ.current === key) return;
    // 브리핑 세트는 이 계정의 「내 브리핑 항목」을 서버에서 다 읽은 뒤에 — 읽기 전 기본 4문항이 나가지 않게
    if (brief && !q && !briefLoaded) return;
    handledQ.current = key;
    if (q) askRef.current({ question: q, source: "USER" }, undefined, true).catch(toastErr);
    else if (brief) briefRef.current().catch(toastErr);
    else if (bq) askBriefRef.current(bq, sp.get("bp") ?? undefined);
    router.replace("/explore");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, s.account, briefLoaded]);

  const askMany = async (qs: LibraryQuestion[]) => {
    setLibOpen(false);
    for (const q of qs) await askLib(q);
  };

  // ── 지도: 대화의 완료 답 refs + 서버가 미리 받은 도형(geo) ──
  const features = useMemo(() => {
    const out: MapFeature[] = [];
    for (const t of conv?.turns ?? []) {
      if (!t.jobId) continue;
      const f = s.full[t.jobId];
      const refs = (f?.raw?.result?.refs ?? []) as T3qRef[];
      const feats = f?.geo?.result?.features ?? [];
      // EXT-01 은 같은 key·value 를 한 번만 돌려준다(마지막 ref 로) — 같은 대상을 가리키는 ref 모두에 그 도형을 쓴다
      const byKV = new Map(feats.map((ft) => [`${ft.properties.key}|${ft.properties.value}`, ft]));
      for (const r of refs) {
        const ft = byKV.get(`${r.map.key}|${r.map.value}`);
        if (!ft) continue;
        out.push({ key: `${t.jobId}:${r.ref}`, ref: r.ref, jobId: t.jobId, entityType: r.entity_type, displayName: r.display_name, draw: r.map.draw, precision: ft.properties.precision ?? null, geometry: ft.geometry });
      }
    }
    return out;
  }, [conv, s.full]);

  const openTab = (t: PanelTab) => {
    setTabs((p) => (p.some((x) => x.key === t.key) ? p : [...p, t]));
    setActive(t.key);
    setPanelOpen(true);
  };
  const x: ExploreApi = {
    openCitation: (c: Citation) => openTab({ key: `doc:${c.docId}:${c.page ?? ""}`, kind: "doc", title: c.title, citation: c }),
    openDetail: (api, id, label, ctx) => openTab({ key: `d:${api}:${id}`, kind: "detail", title: label, detail: { api, id, label, ctx } }),
    showOnMap: (jobId, ref) => {
      setMapJob(jobId);
      setSelectedKey(ref ? `${jobId}:${ref}` : null);
      setFocusToken((n) => n + 1);
      setActive("map");
      setPanelOpen(true);
    },
    selectedKey,
    followUp: (jobId, refs) => {
      const j = s.jobs[jobId];
      setFollow({ jobId, refs, label: `"${(j?.question_user ?? "").slice(0, 40)}"${refs.length ? ` · 참조 대상 ${refs.map((r) => r.display_name ?? r.ref).join(", ")}` : ""}` });
    },
    retry: (jobId) => {
      const c = convRef.current;
      const t = c?.turns.find((x) => x.jobId === jobId);
      if (c && t) retryTurn(c.id, t);
    },
  };

  const pickFromQueue = (j: JobSummary) => {
    const c = convRef.current?.turns.some((t) => t.jobId === j.id) ? convRef.current : s.convs.find((cv) => cv.turns.some((t) => t.jobId === j.id));
    if (c) setConv(latest.current.get(c.id) ?? c);
    // 대화에 없는 작업(다른 기기·운영자 예열 등) — 그 질문 하나로 새 대화를 연다
    else appendTurns(j.question_user, [{ id: uid("t"), jobId: j.id, q: j.question_user, source: j.source, libraryId: j.library_id, at: j.created_at }], null);
    setTimeout(() => document.getElementById(`job-${j.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const panelTabs = sop.enabled ? [MAP_TAB, SOP_TAB, ...tabs.filter((t) => t.kind !== "map" && t.kind !== "sop")] : tabs.filter((t) => t.kind !== "sop");

  // 턴을 브리핑 묶음 단위로
  const blocks = useMemo(() => {
    const out: { group?: Turn["group"]; turns: Turn[] }[] = [];
    for (const t of conv?.turns ?? []) {
      const last = out[out.length - 1];
      if (t.group && last?.group?.id === t.group.id) last.turns.push(t);
      else out.push({ group: t.group, turns: [t] });
    }
    return out;
  }, [conv]);

  return (
    <ExploreContext.Provider value={x}>
      <div className={`explore ${panelOpen ? "with-panel" : ""} ${queueOpen ? "with-queue" : ""}`}>
        <QueuePanel open={queueOpen} setOpen={setQueueOpen} onPick={pickFromQueue} currentJobIds={turnJobIds} />
        <main className="ex-main">
          {!panelOpen && (
            <button className="btn panel-open" onClick={() => setPanelOpen(true)}><IcChevL size={14} /> 패널 펼치기</button>
          )}
          {conv ? (
            <div className="thread">
              <div className="thread-h">
                <TitleEdit
                  title={conv.title}
                  onSave={(title) => {
                    const c = current(conv.id) ?? conv;
                    commit({ ...c, title: title.slice(0, 60), updatedAt: new Date().toISOString() }, true);
                  }}
                />
                <span className="sp" />
                <button className="btn sm" onClick={newConv}>＋ 새 대화</button>
              </div>
              {blocks.map((b, bi) =>
                b.group ? (
                  <section key={`${b.group.id}:${bi}`} className="brief-block">
                    <div className="qbubble">
                      <ol>{b.turns.map((t) => <li key={t.id}>{t.q}</li>)}</ol>
                    </div>
                    {/* 기준지역 — 보낼 때 남긴 이름(group.region)이 없는 예전 브리핑은 이 대화의 기준지역(지금 고른 지역이 아니라) */}
                    <BriefBoard
                      turns={b.turns}
                      regionName={conv.baseName ?? (conv.region === "national" ? "전국" : (REGIONS[conv.region]?.name ?? regionName))}
                      renderBody={(t) => <TurnBody t={t} compact onRetry={() => retryTurn(conv.id, t)} />}
                    />
                  </section>
                ) : (
                  b.turns.map((t) => (
                    <section key={t.id} className="turn" id={t.jobId ? `job-${t.jobId}` : undefined}>
                      <div className="qbubble">
                        <div className="qb-meta xs">{SOURCE_LABEL[t.source]}{t.refAdv ? ` · 참조 특보 ${t.refAdv.area} ${advName(t.refAdv)}` : ""}</div>
                        {t.q}
                        {t.args?.cond && (
                          <div className="qb-cond xs">
                            이 질문에 붙인 조건 · {presetLines(t.args.cond).join(" · ") || "없음"}
                            {presetManual(t.args.cond) && <> <span className="badge neutral xs" title="사용자가 직접 입력한 조건입니다(실시간 관측·특보 아님)">사용자 입력 조건</span></>}
                          </div>
                        )}
                        {t.jobId && <SentQuestion jobId={t.jobId} shown={t.q} />}
                      </div>
                      <TurnBody t={t} onRetry={() => retryTurn(conv.id, t)} />
                    </section>
                  ))
                ),
              )}
              <div ref={endRef} />
            </div>
          ) : (
            <StartScreen
              regionName={regionName}
              onBriefing={() => startBriefing().catch(toastErr)}
              onAskBrief={askBrief}
              onAskLib={askLib}
            />
          )}
          <Composer
            onAsk={askText}
            onBriefing={() => startBriefing().catch(toastErr)}
            onLibrary={() => setLibOpen(true)}
            followUpLabel={follow?.label}
            clearFollowUp={() => setFollow(null)}
          />
        </main>
        {panelOpen && (
          <RightPanel
            tabs={panelTabs}
            active={panelTabs.some((t) => t.key === active) ? active : "map"}
            setActive={setActive}
            close={(k) => { setTabs((p) => p.filter((t) => t.key !== k)); if (active === k) setActive("map"); }}
            closeAll={() => setPanelOpen(false)}
            features={features}
            activeJobId={mapJob}
            focusToken={focusToken}
            sopFocus={sopFocus}
          />
        )}
        {libOpen && (
          <LibraryDrawer
            regionName={regionName}
            onClose={() => setLibOpen(false)}
            onAsk={(q) => { setLibOpen(false); askLib(q); }}
            onAskMany={askMany}
            onAskDemo={(d) => { setLibOpen(false); askDemo(d); }}
            onAskT3q={(text) => { setLibOpen(false); ask({ question: text, source: "SUGGEST" }).catch(toastErr); }}
          />
        )}
      </div>
    </ExploreContext.Provider>
  );
}

/** 한 턴의 본문 — 보내는 중 · 접수 실패 · 자동 조회 데이터(있으면) + 에이전트 답 */
function TurnBody({ t, compact, onRetry }: { t: Turn; compact?: boolean; onRetry: () => void }) {
  const s = useSession();
  if (t.error)
    return (
      <div className="acard err">
        <div className="acard-h"><b>재난안전 AI</b> <span className="badge danger">접수 실패</span></div>
        <div className="s" style={{ marginTop: 8 }}>{t.error}</div>
        <div className="row" style={{ marginTop: 10 }}><button className="btn sm primary" onClick={onRetry}>다시 보내기</button></div>
      </div>
    );
  if (t.pending || !t.jobId) return <div className="acard loading" aria-busy="true"><span className="ai-dot spin" /> 질문을 보내는 중…</div>;
  const job = s.jobs[t.jobId];
  const full = s.full[t.jobId];
  if (!job) return <div className="acard loading" aria-busy="true"><span className="ai-dot spin" /> 불러오는 중…</div>;
  return (
    <>
      {full?.preview && full.preview.length > 0 && <DataCard items={full.preview} />}
      <AnswerCard job={job} full={full} compact={compact} />
    </>
  );
}

/** 대화 제목 보기·수정 (Figma 203001 대화 제목 수정) */
function TitleEdit({ title, onSave }: { title: string; onSave: (t: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(title);
  useEffect(() => setV(title), [title]);
  if (!edit)
    return (
      <>
        <b>{title}</b>
        <button className="lnk xs" onClick={() => setEdit(true)}>수정</button>
      </>
    );
  const save = () => {
    if (v.trim()) onSave(v.trim());
    setEdit(false);
  };
  return (
    <span className="row" style={{ gap: 6 }}>
      <input className="input" value={v} maxLength={60} autoFocus onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEdit(false); }} aria-label="대화 제목" />
      <button className="btn xs primary" onClick={save}>저장</button>
      <button className="btn xs" onClick={() => setEdit(false)}>취소</button>
    </span>
  );
}

/** 이어서 묻기 등으로 실제 전송 질문이 화면 질문과 다를 때 공개 (R4) */
function SentQuestion({ jobId, shown }: { jobId: string; shown: string }) {
  const s = useSession();
  const sent = s.jobs[jobId]?.question_sent;
  const [open, setOpen] = useState(false);
  if (!sent || sent === shown) return null;
  return (
    <div className="sentq">
      <button className="lnk xs" onClick={() => setOpen((v) => !v)}>{open ? "실제 전송 질문 닫기" : "실제 전송 질문 보기"}</button>
      {open && <pre className="xs">{sent}</pre>}
    </div>
  );
}
