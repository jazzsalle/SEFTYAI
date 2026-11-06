"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { DEMO_SHOW, SHOW_GROUPS, type ShowItem, demoAsk, dayItemsFor, fillText, libraryFor, presetLines, presetManual, type DayItem, type DemoItem, type LibraryQuestion, type Stage } from "@/lib/library";
import { baseQuestionPilot } from "@/lib/baseRegion";
import { useSession } from "@/lib/session";

/**
 * 질문 모음 (R11) — 개발서버 질문 모음(QuestionLibrary)과 같은 세 갈피(2026-11-06 맞춤):
 * ① 시연 — 미리 받아 둔 답만 바로 보인다. 받아 둔 답이 없는 질문은 회색으로 눌리지 않는다(개발서버: 시연 탭은 에이전트에 묻지 않음 · 받기 단추 없음).
 *    받아 둔 답은 계정과 상관없이 하나(sa_demo_pins — 개발서버 ai_demo_pin 도 계정 구분 없음). 받기는 운영관리 「시연 세트 예열」·가져오기 도구(harness/demo/import_pins.mjs)
 * ② 지역 질문 — 업무단계별 평소 질문(여러 개 골라 차례로)
 * ③ 한눈 요약 질의 — 질문마다 제 조건을 달고 다니는 묶음(lib/library DAY_ITEMS). 받아 둔 답이 있으면 그것을, 없으면 그 자리에서 조건을 얹어 묻는다. 받아 두기·다시 받기·지우기
 * 연속 질의·에이전트 추천 질문(T3Q-03 고정 목록) 탭은 2026-11-02 사용자 지시로 삭제 — 추천 질문은 대화에 따라 답 뒤에 나와야 하는데 T3Q 에 그런 API 가 없다.
 */
const STAGES: Stage[] = ["평시", "특보", "비상", "복구"];
type Tab = "show" | "lib" | "day";
type Pin = { at: string | null; jobId: string | null; pending: { id: string; state: string } | null };
/** 마지막으로 본 탭(서랍을 다시 열 때 — 이 화면을 연 동안만) */
let lastTab: Tab = "show";
const RUNNING = ["QUEUED", "SUBMITTED", "RUNNING"];

/** 「11.03 14:32」 — 받아 둔 답은 만료가 없어 며칠 묵을 수 있으니 날짜도 적는다(개발서버와 같은 꼴) */
function clock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(at.getMonth() + 1)}.${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}`;
}

export default function LibraryDrawer({ regionName, onClose, onAsk, onAskMany, onAskDemo, onAskShow }: {
  regionName: string;
  onClose: () => void;
  onAsk: (q: LibraryQuestion) => void;
  onAskMany: (qs: LibraryQuestion[]) => void;
  onAskDemo: (d: DemoItem) => void;
  onAskShow?: (ds: DemoItem[]) => void;
}) {
  const s = useSession();
  const [tab, setTabS] = useState<Tab>(onAskShow ? lastTab : lastTab === "show" ? "lib" : lastTab);
  const setTab = (t: Tab) => {
    lastTab = t;
    setTabS(t);
  };
  // 시·도까지만 골라도 인제·영천 질문(R48 — lib/baseRegion baseQuestionPilot)
  const qr = baseQuestionPilot(s.cond.base);
  const day = useMemo(() => dayItemsFor(qr), [qr]);
  const [sel, setSel] = useState<string[]>([]);
  const list = useMemo(() => libraryFor(qr === "national" ? "" : qr), [qr]);
  // 받아 둔 답 상태 — 「시연」·「한눈 요약 질의」를 열었을 때만, 5초마다(한 건이 40초~2분이라 끝나는 때를 알 길이 이것뿐)
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
      for (const d of ds) await s.submit({ ...demoAsk(d), pinId: d.id, pinFresh: true, warnings: (d as ShowItem).warnings ?? null }).catch((e) => s.toast((e as Error).message));
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
  /** 한눈 요약 질의 — 받아 둔 답이 있으면 그것을 바로, 없으면 그 자리에서 조건을 얹어 묻는다(개발서버 askDayItem) */
  const askDay = (d: DayItem) => (pinOf(d.id).at && onAskShow ? onAskShow([d]) : onAskDemo(d));
  const toggle = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]));
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
        {onAskShow && <button role="tab" aria-selected={tab === "show"} className={tab === "show" ? "on" : ""} onClick={() => setTab("show")}>시연</button>}
        <button role="tab" aria-selected={tab === "lib"} className={tab === "lib" ? "on" : ""} onClick={() => setTab("lib")}>지역 질문</button>
        <button role="tab" aria-selected={tab === "day"} className={tab === "day" ? "on" : ""} onClick={() => setTab("day")}>한눈 요약 질의</button>
      </div>
      {tab === "show" && onAskShow && (
        <div className="drawer-b">
          <p className="xs muted">미리 받아 둔 답을 그 자리에서 바로 보여 줍니다 — 상류가 준 글 그대로이고, 받은 시각을 함께 적습니다. 받아 둔 답이 있는 질문만 누를 수 있습니다(「저장된 답 없음」은 시연 준비 중).</p>
          {SHOW_GROUPS.map((g) => {
            const items = DEMO_SHOW.filter((d) => d.group === g.group && !d.hidden);
            const ready = items.filter((d) => pinOf(d.id).at);
            return (
              <section key={g.group} className="lib-sec" aria-label={g.title}>
                <div className="lib-st">{g.title}</div>
                <div className="xs muted" style={{ margin: "2px 0 6px" }}>{g.note}</div>
                {items.map((d) => {
                  const p = pinOf(d.id);
                  return (
                    <div key={d.id} className="lib-q day-q">
                      <span className="badge neutral">{d.scene}</span>
                      <div className="day-b">
                        <button className="lnk day-btn" disabled={!p.at} onClick={() => onAskShow([d])}><b>{d.title}</b><span>{d.text}</span></button>
                        <div className="xs muted">
                          {p.at ? <>저장된 답 · {p.at} 받음</> : <>저장된 답 없음</>}
                          {/* 가정 특보가 실리는 질문 — 이 표가 없으면 실제 특보로 읽힌다 */}
                          {d.warnings && <> <span className="badge neutral xs" title="실제 기상특보가 아니라 시연 장면이 가정한 특보입니다.">시연 시나리오(가상 특보)</span></>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="drawer-f">
                  <span className="sp" />
                  <button className="btn primary sm" disabled={!ready.length} onClick={() => onAskShow(ready)}>이 묶음 차례로 보내기</button>
                </div>
              </section>
            );
          })}
        </div>
      )}
      {tab === "day" && (
        <div className="drawer-b">
          <p className="xs muted">{regionName} 담당자의 하루를 장면 차례로 놓은 질문입니다. 질문에 붙은 조건만 그 질문에 싣고, 입력창의 재난상황 조건은 싣지도 바꾸지도 않습니다.</p>
          {day.length === 0 && <div className="xs muted">이 기준지역의 한눈 요약 질의가 없습니다. 부산·영천·인제를 기준지역으로 고르면 나옵니다.</div>}
          {day.map((d, i) => {
            const p = pinOf(d.id);
            return (
              <div key={d.id} className="lib-q day-q">
                <span className="badge neutral">{i + 1}</span>
                <div className="day-b">
                  <button className="lnk day-btn" disabled={p.busy} onClick={() => askDay(d)}><b>{d.title}</b><span>{d.text}</span></button>
                  <div className="xs muted">
                    붙는 조건 · {presetLines(d.cond).join(" · ") || "없음"}
                    {presetManual(d.cond) && <> <span className="badge neutral xs" title="사람이 적어 넣은 값입니다. 실시간 관측도 실제 특보도 아닙니다.">직접 입력 조건</span></>}
                  </div>
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
          <p className="xs muted">{regionName} 기준으로 보냅니다. 하나를 누르면 바로 묻고, 여러 개(최대 4개)를 골라 차례로 보낼 수도 있습니다.</p>
          {STAGES.map((st) => {
            const qs = list.filter((q) => q.stage === st && !q.after);
            if (!qs.length) return null;
            return (
              <section key={st} className="lib-sec">
                <div className="lib-st">{st}</div>
                {qs.map((q) => (
                  <div key={q.id} className="lib-q">
                    <input type="checkbox" checked={sel.includes(q.id)} disabled={!sel.includes(q.id) && sel.length >= 4} onChange={() => toggle(q.id)} aria-label={`${fillText(q, regionName)} 고르기`} />
                    <button className="lnk" onClick={() => onAsk(q)}>{fillText(q, regionName)}</button>
                    <span className="xs muted">{q.category}</span>
                  </div>
                ))}
              </section>
            );
          })}
          <div className="drawer-f">
            <span className="xs muted">{sel.length}개 고름</span>
            <span className="sp" />
            <button className="btn primary" disabled={!sel.length} onClick={() => { onAskMany(list.filter((q) => sel.includes(q.id))); setSel([]); }}>고른 질문 차례로 보내기</button>
          </div>
        </div>
      )}
    </div>
  );
}
