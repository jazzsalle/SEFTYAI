"use client";
import "./qlib.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { demoAsk, dayItemsFor, type DayItem, type DemoItem } from "@/lib/library";
import { baseDayRegion, baseKey } from "@/lib/baseRegion";
import { useSession } from "@/lib/session";

/**
 * 질문 모음 (화면 오른쪽 서랍) — 개발서버 QuestionLibrary 의 「한눈 요약 질의」(②)에 우리가 ③을 더했다.
 * ① 지역 질문 갈피는 사용자 지시(2026-11-24)로 뺐다 — 개발서버와 다른 점(docs/devserver-sync/ours-better.md). 질문 글(lib/library LIBRARY)은 시작 화면·브리핑이 그대로 쓴다
 * ② 한눈 요약 질의 — lib/library DAY_ITEMS. 누르면 질문 글만 묻는다(가정 조건 없음 — UFR-006-001-11 I열). 받아 둔 답은 시연 모드(대상 계정)일 때만 쓴다(사용자 결정 2026-11-24). 받아 두기·다시 받기·지우기는 그대로(자동 시연·브리핑 시연이 쓴다)
 * ③ 추천 질문 — T3Q-03(/api/t3q/suggested). 기준지역 코드를 넘겨 T3Q 가 시·도 이름으로 맞춘 질문을 받은 그대로, 받은 묶음 차례로(v0.4.9 · 11/20). 누르면 그 글만 묻는다(출처 SUGGEST).
 *    화면 설계: 디자인 캔버스 ④ 「지역 맞춤 추천 질문·후속질문」
 * 재난상황 조건은 싣지 않는다(explore askLib·askDemo — 기준지역만). 서랍은 뒤 화면을 덮지 않아 바깥 누르기로 닫지 않고 Esc·✕ 로 닫는다.
 * 열 때마다 「한눈 요약 질의」 갈피로 연다. 받아 둔 답(sa_demo_pins)은 계정과 상관없이 하나
 */
type Tab = "day" | "sug";
/** T3Q-03 추천 질문 한 건 — 글·묶음 이름만 쓴다 */
export type SuggestItem = { question_id: string; group_label: string; text: string };
type SugState = { key: string; items: SuggestItem[] | null; error: string | null };

/** 받은 차례 그대로 묶음 이름별로 모은다(글이 빈 것은 뺀다) */
export function suggestGroups(items: SuggestItem[]): { label: string; items: SuggestItem[] }[] {
  const out: { label: string; items: SuggestItem[] }[] = [];
  for (const q of items) {
    if (!q || typeof q.text !== "string" || !q.text.trim()) continue;
    const label = typeof q.group_label === "string" ? q.group_label : "";
    const g = out.find((x) => x.label === label);
    if (g) g.items.push(q);
    else out.push({ label, items: [q] });
  }
  return out;
}
type Pin = { at: string | null; jobId: string | null; pending: { id: string; state: string } | null };
const RUNNING = ["QUEUED", "SUBMITTED", "RUNNING"];
/** 받아 둔 답 목록을 다시 읽는 간격 — 한 건이 40초~2분이라 끝나는 때를 알 길이 이것뿐 */
const PIN_POLL_MS = 5000;
/** 한 건 받기를 기다리는 한도 — 넘으면 이 화면은 손을 떼고 「지난 받기가 끝나지 않음」으로 남긴다 */
const PIN_WAIT_MS = 5 * 60_000;

/** 「11.03 14:32」 — 받아 둔 답은 만료가 없어 며칠 묵을 수 있으니 날짜도 적는다(개발서버와 같은 꼴) */
function clock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(at.getMonth() + 1)}.${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}`;
}

export default function LibraryDrawer({ regionName, busy = false, onClose, onAskDemo, onAskSuggest }: {
  regionName: string;
  /** 질문을 더 받을 수 없다(개별 질문 넷이 다 돌거나 브리핑 세트가 도는 중 — 개발서버 QuestionLibrary busy · R57). 보내는 단추를 막는다(받아 두기는 그대로) */
  busy?: boolean;
  onClose: () => void;
  /** 한눈 요약 질의 한 건 — 질문 글만 조건 없이 보낸다(정의서 UFR-006-001-11) */
  onAskDemo: (d: DemoItem) => void;
  /** 추천 질문 한 건 — T3Q 가 준 글 그대로 보낸다 */
  onAskSuggest?: (text: string) => void;
}) {
  const s = useSession();
  const [tab, setTab] = useState<Tab>("day");
  const box = useRef<HTMLElement>(null);
  // 한눈 요약 질의 — 시·도까지만 골라도 인제·영천(R48), 대전·서울도(lib/baseRegion baseDayRegion)
  const dr = baseDayRegion(s.cond.base);
  const day = useMemo(() => dayItemsFor(dr), [dr]);

  // Esc 로 닫는다. 바깥 누르기로는 닫지 않는다 — 답을 읽으면서 다음 질문을 고르는 자리라, 글을 긁다가 닫히면 곤란하다
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => box.current?.focus(), []);

  // 받아 둔 답 상태 — null = 받아 둘 자리를 읽지 못함(서버 DB 없음 등 · 개발서버 demo 목록 빈 배열)
  const [pins, setPins] = useState<Record<string, Pin> | null>(null);
  const [fetching, setFetching] = useState<string[]>([]);
  const load = useCallback(async () => {
    try {
      const r = await api<{ pins: Record<string, Pin> }>("/api/demo-pins");
      setPins(r.pins);
      return r.pins;
    } catch {
      // 시연 표가 없는 서버도 있다. 갈피만 비어 보이고 나머지는 멀쩡해야 한다
      setPins(null);
      return null;
    }
  }, []);
  // 갈피를 열었을 때만 읽는다
  useEffect(() => {
    if (tab !== "day") return;
    void load();
    const t = setInterval(() => void load(), PIN_POLL_MS);
    return () => clearInterval(t);
  }, [tab, load]);

  // 추천 질문 — 갈피를 열었을 때, 기준지역이 바뀌었을 때만 받는다. 지역 코드는 화면 값 그대로(시·도로 맞추는 것은 T3Q)
  const sugKey = baseKey(s.cond.base);
  const sugName = s.cond.base?.sido.name ?? "전국";
  const [sug, setSug] = useState<SugState | null>(null);
  useEffect(() => {
    if (tab !== "sug") return;
    let off = false;
    api<{ envelope?: { result?: { items?: SuggestItem[] } } }>(`/api/t3q/suggested${sugKey ? `?region=${sugKey}` : ""}`).then(
      (r) => { if (!off) setSug({ key: sugKey, items: Array.isArray(r.envelope?.result?.items) ? r.envelope.result.items : [], error: null }); },
      (e: unknown) => { if (!off) setSug({ key: sugKey, items: null, error: (e as Error).message }); },
    );
    return () => { off = true; };
  }, [tab, sugKey]);
  const sugNow = sug && sug.key === sugKey ? sug : null;
  const sugList = useMemo(() => suggestGroups(sugNow?.items ?? []), [sugNow]);

  /** 그 항목의 받아 둘 자리 — 목록을 못 읽었으면 null(「저장 자리 없음」). 아직 한 번도 받지 않은 항목은 빈 자리 */
  const pinOf = (id: string): Pin | null => (pins === null ? null : pins[id] ?? { at: null, jobId: null, pending: null });
  /** 지금 이 화면이 받고 있는 항목인가 */
  const busyPin = (id: string) => fetching.includes(id);
  /** 서버에는 받는 중인데 이 화면은 받고 있지 않다 — 지난 받기가 끝나지 않고 멈춘 것(개발서버 stalePin) */
  const stalePin = (id: string, p: Pin) => !!p.pending && RUNNING.includes(p.pending.state) && !busyPin(id);
  const failedPin = (p: Pin) => !!p.pending && !RUNNING.includes(p.pending.state);

  /** 받아 두기 — 대화에 넣지 않고 받기만(성공이면 고정). 하나씩, 끝날 때까지 기다렸다가 다음 것 — 상류가 Agent 라 한꺼번에 던지면 멈춘다 */
  const fetchPins = async (ds: DemoItem[]) => {
    setFetching((f) => [...f, ...ds.map((d) => d.id)]);
    try {
      for (const d of ds) {
        const ok = await s.submit({ ...demoAsk(d), pinId: d.id, pinFresh: true }).then(() => true, (e: unknown) => {
          s.toast((e as Error).message);
          return false;
        });
        if (!ok) continue;
        const until = Date.now() + PIN_WAIT_MS;
        for (;;) {
          const now = await load();
          const p = now?.[d.id];
          if (!now || !p?.pending || !RUNNING.includes(p.pending.state) || Date.now() > until) break;
          await new Promise((r) => setTimeout(r, PIN_POLL_MS));
        }
      }
    } finally {
      setFetching((f) => f.filter((id) => !ds.some((d) => d.id === id)));
      void load();
    }
  };
  /** 받아 둔 답 지우기 — 질문은 남고 「응답 대기」로 */
  const clearPin = async (d: DemoItem) => {
    await api(`/api/demo-pins?id=${encodeURIComponent(d.id)}`, { method: "DELETE" }).catch((e) => s.toast((e as Error).message));
    void load();
  };
  /** 한눈 요약 질의 — 질문 글만 묻는다(개발서버 askDayItem · 정의서 UFR-006-001-11 I열). 받아 둔 답은 시연 모드일 때만(explore askDemo pinDemo) */
  const askDay = (d: DayItem) => onAskDemo(d);
  /** 이 질문이 기대하는 기준지역 이름(개발서버 DayItem.baseName) */
  const baseOf = (d: DayItem) => d.base?.sigungu?.name ?? d.base?.sido.name;

  return (
    <aside className="qlib" role="dialog" aria-label="질문 모음" tabIndex={-1} ref={box}>
      <div className="qlib-head">
        <h2 className="qlib-title">질문 모음</h2>
        <button type="button" className="qlib-close" onClick={onClose} aria-label="질문 모음 닫기">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div className="qlib-tabs" role="tablist" aria-label="질문 갈래">
        <button type="button" role="tab" aria-selected={tab === "day"} className={tab === "day" ? "is-on" : undefined} onClick={() => setTab("day")}>한눈 요약 질의</button>
        {onAskSuggest && <button type="button" role="tab" aria-selected={tab === "sug"} className={tab === "sug" ? "is-on" : undefined} onClick={() => setTab("sug")}>추천 질문</button>}
      </div>

      <p className="qlib-note">
        {tab === "day" && <>{regionName} 담당자의 하루를 장면 차례로 놓은 질문입니다. 질문 글만 보내며, 입력창의 재난상황 조건은 싣지도 바꾸지도 않습니다.</>}
        {tab === "sug" && <>{sugName} 기준으로 받은 추천 질문입니다.{sugKey ? " 지역 이름은 시·도 단위로 맞춰 옵니다." : ""} 질문을 하나 누르면 그 질문만 바로 묻습니다.</>}
      </p>

      {tab === "day" && (
        <div className="qlib-scroll">
          {day.length === 0 ? (
            <p className="qlib-empty">이 기준지역의 한눈 요약 질의가 없습니다. 부산·영천·인제·대전·서울을 기준지역으로 고르면 나옵니다.</p>
          ) : (
            day.map((d, i) => {
              const p = pinOf(d.id);
              const want = baseOf(d);
              return (
                <div key={d.id} className="qlib-day">
                  <span className="qlib-scene">{i + 1}</span>
                  <div className="qlib-day-body">
                    <button type="button" className="qlib-day-btn" disabled={busy || busyPin(d.id)} onClick={() => askDay(d)}>
                      <b>{d.title}</b>
                      <span>{d.text}</span>
                    </button>
                    <p className="qlib-day-meta">
                      {p === null ? (
                        "저장 자리 없음 · 누르면 실시간으로 묻습니다"
                      ) : (
                        <>
                          {busyPin(d.id) ? "답 받는 중…" : p.at ? <>응답 · {clock(p.at)} 받음</> : "응답 대기"}
                          {failedPin(p) && <> · 마지막 받기 실패</>}
                          {stalePin(d.id, p) && <> · 지난 받기가 끝나지 않음</>}
                          {" · "}
                          <button type="button" className="qlib-link" disabled={busyPin(d.id)} onClick={() => void fetchPins([d])}>{p.at ? "다시 받기" : "받아 두기"}</button>
                          {p.at && !busyPin(d.id) && (
                            <>
                              {" · "}
                              <button type="button" className="qlib-link" onClick={() => void clearPin(d)}>지우기</button>
                            </>
                          )}
                        </>
                      )}
                    </p>
                    {want !== undefined && want !== regionName && <p className="qlib-day-meta">기준지역 {want}에서 묻는 질문입니다. 지금은 {regionName}입니다.</p>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "day" && day.length > 0 && (() => {
        const held = day.filter((d) => pinOf(d.id) !== null);
        const missing = held.filter((d) => !pinOf(d.id)!.at && !busyPin(d.id));
        return (
          <div className="qlib-foot">
            <span className="qlib-count">응답 {held.filter((d) => pinOf(d.id)!.at).length}/{day.length}</span>
            <button type="button" className="qlib-sub" disabled={missing.length === 0} onClick={() => void fetchPins(missing)}>없는 답 받아 두기({missing.length})</button>
          </div>
        );
      })()}

      {tab === "sug" && (
        <div className="qlib-scroll">
          {!sugNow ? (
            <p className="qlib-empty">추천 질문을 불러오는 중입니다…</p>
          ) : sugNow.error ? (
            <p className="qlib-empty">{sugNow.error}</p>
          ) : sugList.length === 0 ? (
            <p className="qlib-empty">이 기준지역으로 받은 추천 질문이 없습니다.</p>
          ) : (
            sugList.map((g) => (
              <section key={g.label} className="qlib-sec" aria-label={g.label}>
                <h3 className="qlib-stage">{g.label}</h3>
                {g.items.map((q) => (
                  <div key={q.question_id} className="qlib-row">
                    <button type="button" className="qlib-q" disabled={busy} onClick={() => onAskSuggest?.(q.text.trim())}>{q.text.trim()}</button>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      )}
      {tab === "sug" && sugKey && sugList.length > 0 && (
        <div className="qlib-foot">
          <span className="qlib-count">지역에 따라 해당 자료가 없으면 「지정된 곳이 없다」는 답이 올 수 있습니다.</span>
        </div>
      )}

    </aside>
  );
}
