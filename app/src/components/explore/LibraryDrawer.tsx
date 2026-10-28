"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fillText, LIBRARY, libraryFor, type LibraryQuestion, type Stage } from "@/lib/library";
import { useSession } from "@/lib/session";

/**
 * 질문 모음 (R11) — ① 지역 질문(업무단계별, 역량질문 템플릿으로 만든 질문) ② 연속 질의 ③ T3Q 추천 질문(T3Q-03 고정 목록 그대로)
 * 출처를 탭으로 구분한다. 여러 개를 골라 한꺼번에 보낼 수 있다.
 */
const STAGES: Stage[] = ["평시", "특보", "비상", "복구"];
type Sug = { question_id: string; group_label: string; text: string; data_api?: string };

export default function LibraryDrawer({ regionName, onClose, onAsk, onAskMany, onAskT3q }: {
  regionName: string;
  onClose: () => void;
  onAsk: (q: LibraryQuestion) => void;
  onAskMany: (qs: LibraryQuestion[]) => void;
  onAskT3q: (text: string) => void;
}) {
  const s = useSession();
  const [tab, setTab] = useState<"lib" | "flow" | "t3q">("lib");
  const [sel, setSel] = useState<string[]>([]);
  const [sug, setSug] = useState<Sug[] | null>(null);
  const [sugErr, setSugErr] = useState<string | null>(null);
  const list = useMemo(() => libraryFor(s.cond.region === "national" ? "" : s.cond.region), [s.cond.region]);
  const flows = list.filter((q) => q.after).map((q) => ({ first: LIBRARY.find((x) => x.id === q.after)!, next: q }));
  useEffect(() => {
    if (tab !== "t3q" || sug) return;
    api<{ envelope: { result?: { items?: Sug[] } } }>("/api/t3q/suggested").then((r) => setSug(r.envelope.result?.items ?? [])).catch((e) => setSugErr((e as Error).message));
  }, [tab, sug]);
  const toggle = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]));
  return (
    <div className="drawer" role="dialog" aria-label="질문 모음">
      <div className="drawer-h">
        <b>질문 모음</b>
        <span className="sp" />
        <button className="lnk" onClick={onClose} aria-label="닫기">×</button>
      </div>
      <div className="subtabs">
        <button className={tab === "lib" ? "on" : ""} onClick={() => setTab("lib")}>지역 질문(업무단계)</button>
        <button className={tab === "flow" ? "on" : ""} onClick={() => setTab("flow")}>연속 질의</button>
        <button className={tab === "t3q" ? "on" : ""} onClick={() => setTab("t3q")}>에이전트 추천 질문</button>
      </div>
      {tab === "lib" && (
        <div className="drawer-b">
          <p className="xs muted">{regionName} 기준 질문입니다. 여러 개(최대 4개)를 골라 한꺼번에 보낼 수 있습니다. 질문과 함께 관련 데이터를 먼저 조회해 보여 드립니다.</p>
          {STAGES.map((st) => {
            const qs = list.filter((q) => q.stage === st && !q.after);
            if (!qs.length) return null;
            return (
              <section key={st} className="lib-sec">
                <div className="lib-st">{st}</div>
                {qs.map((q) => (
                  <div key={q.id} className="lib-q">
                    <input type="checkbox" checked={sel.includes(q.id)} onChange={() => toggle(q.id)} aria-label="고르기" />
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
            <button className="btn primary" disabled={!sel.length} onClick={() => onAskMany(sel.map((id) => LIBRARY.find((q) => q.id === id)!))}>고른 질문 한꺼번에 보내기</button>
          </div>
        </div>
      )}
      {tab === "flow" && (
        <div className="drawer-b">
          <p className="xs muted">앞 질문의 답을 받은 뒤 이어서 묻는 흐름입니다. 첫 질문을 보내고, 답이 오면 그 답의 [이어서 묻기]로 다음 질문을 보내세요.</p>
          {flows.length === 0 && <div className="xs muted">이 지역의 연속 질의가 없습니다.</div>}
          {flows.map(({ first, next }) => (
            <div key={next.id} className="flow">
              <div className="flow-1"><span className="badge neutral">1</span> <button className="lnk" onClick={() => onAsk(first)}>{fillText(first, regionName)}</button></div>
              <div className="flow-2"><span className="badge neutral">2</span> {fillText(next, regionName)}</div>
            </div>
          ))}
        </div>
      )}
      {tab === "t3q" && (
        <div className="drawer-b">
          <p className="xs muted">에이전트 쪽에서 제공하는 추천 질문입니다(지역과 무관한 고정 목록, 원문 그대로).</p>
          {sugErr && <div className="notice danger">{sugErr}</div>}
          {!sug && !sugErr && <div className="xs muted">불러오는 중…</div>}
          {sug?.map((q) => (
            <div key={q.question_id} className="lib-q">
              <button className="lnk" onClick={() => onAskT3q(q.text)}>{q.text}</button>
              <span className="xs muted">{q.group_label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
