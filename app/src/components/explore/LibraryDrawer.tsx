"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { demoAsk, dayItemsFor, fillText, libraryFor, type DayItem, type DemoItem, type LibraryQuestion, type Stage } from "@/lib/library";
import { baseQuestionPilot } from "@/lib/baseRegion";
import { useSession } from "@/lib/session";

/**
 * 질문 모음 (R11) — 개발서버 질문 모음(QuestionLibrary, kjw 256e5ec·352a97c)과 같은 두 갈피(R62):
 * ① 지역 질문 — 업무단계별 평소 질문. 하나를 누르면 그 질문만 바로 묻는다(여러 개 골라 차례로 보내기는 없앰 — UFR-006-001-11). 글·순서는 개발서버 questionLibrary 그대로(R51)
 * ② 한눈 요약 질의 — lib/library DAY_ITEMS. 누르면 질문 글만 묻는다(가정 조건·받아 둔 답을 쓰지 않음 — UFR-006-001-11 I열). 받아 두기·다시 받기·지우기는 그대로(자동 시연·브리핑 시연이 쓴다)
 * 재난상황 조건은 싣지 않는다(explore askLib·askDemo — 기준지역만). 「시연」 갈피와 [이 묶음 차례로 보내기]는 지웠다(2026-11-12 개발서버 결정 · FUN-UFR-301006).
 * 받아 둔 답(sa_demo_pins)은 계정과 상관없이 하나 — 받기는 운영관리 「시연 세트 예열」·가져오기 도구(harness/demo/import_pins.mjs)
 * 연속 질의·에이전트 추천 질문(T3Q-03 고정 목록) 탭은 2026-11-02 사용자 지시로 삭제 — 추천 후속질문은 답 아래 「이어서 물어보기」(R62)
 */
const STAGES: Stage[] = ["평시", "특보", "비상", "복구"];
type Tab = "lib" | "day";
type Pin = { at: string | null; jobId: string | null; pending: { id: string; state: string } | null };
/** 마지막으로 본 탭(서랍을 다시 열 때 — 이 화면을 연 동안만) */
let lastTab: Tab = "lib";
const RUNNING = ["QUEUED", "SUBMITTED", "RUNNING"];

/** 「11.03 14:32」 — 받아 둔 답은 만료가 없어 며칠 묵을 수 있으니 날짜도 적는다(개발서버와 같은 꼴) */
function clock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(at.getMonth() + 1)}.${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}`;
}

export default function LibraryDrawer({ regionName, busy = false, onClose, onAsk, onAskDemo }: {
  regionName: string;
  /** 질문을 더 받을 수 없다(개별 질문 넷이 다 돌거나 브리핑 세트가 도는 중 — 개발서버 QuestionLibrary busy · R57). 보내는 단추를 막는다(받아 두기는 그대로) */
  busy?: boolean;
  onClose: () => void;
  onAsk: (q: LibraryQuestion) => void;
  /** 한눈 요약 질의 한 건 — 질문 글만 조건 없이 보낸다(정의서 UFR-006-001-11) */
  onAskDemo: (d: DemoItem) => void;
}) {
  const s = useSession();
  const [tab, setTabS] = useState<Tab>(lastTab);
  const setTab = (t: Tab) => {
    lastTab = t;
    setTabS(t);
  };
  // 시·도까지만 골라도 인제·영천 질문(R48 — lib/baseRegion baseQuestionPilot)
  const qr = baseQuestionPilot(s.cond.base);
  const day = useMemo(() => dayItemsFor(qr), [qr]);
  const list = useMemo(() => libraryFor(qr === "national" ? "" : qr), [qr]);
  // 받아 둔 답 상태 — 「한눈 요약 질의」를 열었을 때만, 5초마다(한 건이 40초~2분이라 끝나는 때를 알 길이 이것뿐)
  const [pins, setPins] = useState<Record<string, Pin>>({});
  const [pinTick, setPinTick] = useState(0);
  const [fetching, setFetching] = useState<string[]>([]);
  useEffect(() => {
    if (tab === "lib") return;
    let stop = false;
    const load = () => api<{ pins: Record<string, Pin> }>("/api/demo-pins").then((r) => !stop && setPins(r.pins)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [tab, pinTick]);
  const pinOf = (id: string) => {
    const p = pins[id];
    const busy = fetching.includes(id) || (!!p?.pending && RUNNING.includes(p.pending.state));
    return { busy, at: p?.at ? clock(p.at) : null, failed: !!p?.pending && !RUNNING.includes(p.pending.state) };
  };
  /** 받아 두기 — 대화에 넣지 않고 받기만(성공이면 고정). 하나씩 — 상류가 Agent 라 한꺼번에 던지면 멈춘다 */
  const fetchPins = async (ds: DemoItem[]) => {
    setFetching((f) => [...f, ...ds.map((d) => d.id)]);
    try {
      for (const d of ds) await s.submit({ ...demoAsk(d), pinId: d.id, pinFresh: true }).catch((e) => s.toast((e as Error).message));
    } finally {
      setFetching((f) => f.filter((id) => !ds.some((d) => d.id === id)));
      setPinTick((t) => t + 1);
    }
  };
  /** 받아 둔 답 지우기 — 질문은 남고 「응답 대기」로 */
  const clearPin = async (d: DemoItem) => {
    await api(`/api/demo-pins?id=${encodeURIComponent(d.id)}`, { method: "DELETE" }).catch((e) => s.toast((e as Error).message));
    setPinTick((t) => t + 1);
  };
  /** 한눈 요약 질의 — 받아 둔 답을 보여 주지 않고 질문 글만 묻는다(개발서버 askDayItem · 정의서 UFR-006-001-11 I열) */
  const askDay = (d: DayItem) => onAskDemo(d);
  const dayPinned = day.filter((d) => pinOf(d.id).at).length;
  const dayMissing = day.filter((d) => !pinOf(d.id).at && !pinOf(d.id).busy);
  return (
    <div className="drawer" role="dialog" aria-label="질문 모음">
      <div className="drawer-h">
        <b>질문 모음</b>
        <span className="sp" />
        <button className="lnk" onClick={onClose} aria-label="닫기">×</button>
      </div>
      <div className="subtabs" role="tablist" aria-label="질문 갈래">
        <button role="tab" aria-selected={tab === "lib"} className={tab === "lib" ? "on" : ""} onClick={() => setTab("lib")}>지역 질문</button>
        <button role="tab" aria-selected={tab === "day"} className={tab === "day" ? "on" : ""} onClick={() => setTab("day")}>한눈 요약 질의</button>
      </div>
      {tab === "day" && (
        <div className="drawer-b">
          <p className="xs muted">{regionName} 담당자의 하루를 장면 차례로 놓은 질문입니다. 질문 글만 보내며, 입력창의 재난상황 조건은 싣지도 바꾸지도 않습니다.</p>
          {day.length === 0 && <div className="xs muted">이 기준지역의 한눈 요약 질의가 없습니다. 부산·영천·인제를 기준지역으로 고르면 나옵니다.</div>}
          {day.map((d, i) => {
            const p = pinOf(d.id);
            return (
              <div key={d.id} className="lib-q day-q">
                <span className="badge neutral">{i + 1}</span>
                <div className="day-b">
                  <button className="lnk day-btn" disabled={busy || p.busy} onClick={() => askDay(d)}><b>{d.title}</b><span>{d.text}</span></button>
                  <div className="xs muted">
                    {p.busy ? "답 받는 중…" : p.at ? <>응답 · {p.at} 받음</> : "응답 대기"}
                    {p.failed && <> · 마지막 받기 실패</>}
                    {" · "}
                    <button className="lnk" disabled={p.busy} onClick={() => fetchPins([d])}>{p.at ? "다시 받기" : "받아 두기"}</button>
                    {p.at && !p.busy && (
                      <>
                        {" · "}
                        <button className="lnk" onClick={() => clearPin(d)}>지우기</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {day.length > 0 && (
            <div className="drawer-f">
              <span className="xs muted">응답 {dayPinned}/{day.length}</span>
              <span className="sp" />
              <button className="btn sm" disabled={!dayMissing.length} onClick={() => fetchPins(dayMissing)}>없는 답 받아 두기({dayMissing.length})</button>
            </div>
          )}
        </div>
      )}
      {tab === "lib" && (
        <div className="drawer-b">
          <p className="xs muted">{regionName} 기준으로 보냅니다. 질문을 하나 누르면 그 질문만 바로 묻습니다.</p>
          {list.length === 0 && <p className="xs muted">이 기준지역에서 쓸 수 있는 질문이 없습니다.</p>}
          {STAGES.map((st) => {
            const qs = list.filter((q) => q.stage === st);
            if (!qs.length) return null;
            return (
              <section key={st} className="lib-sec">
                <div className="lib-st">{st}</div>
                {qs.map((q) => (
                  <div key={q.id} className="lib-q">
                    <button className="lnk" disabled={busy} onClick={() => onAsk(q)}>{fillText(q, regionName)}</button>
                    <span className="xs muted">{q.category}</span>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
