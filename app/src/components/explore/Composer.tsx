"use client";
import { useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { REGIONS, DISASTER_TYPES } from "@/lib/config";
import type { DisasterType } from "@/lib/contract/agent";
import { IcDoc, IcX } from "../Icons";

export const PRESETS = [
  { key: "wx", label: "현재 기상상황", q: "지금 우리 지역 기상특보와 강우 상황은 어떤가요?" },
  { key: "risk", label: "위험·취약지역", q: "지금 강우 조건에서 먼저 확인해야 할 위험·취약지역은 어디인가요?" },
  { key: "similar", label: "과거 유사사례", q: "비슷한 강우 때 과거에 어디서 어떤 피해가 있었나요?" },
  { key: "manual", label: "행동매뉴얼 대응절차", q: "지금 특보 단계에서 행동매뉴얼상 제가 해야 할 일은 무엇인가요?" },
  { key: "report119", label: "119 신고 현황", q: "이번 사건으로 접수된 119 신고 내용은 무엇인가요?" },
];

export default function Composer({ onSend, busy, baseLabel }: { onSend: (q: string, preset?: string) => void; busy: boolean; baseLabel: string }) {
  const { cond } = useSession();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    const t = q.trim();
    if (!t || busy) return;
    onSend(t);
    setQ("");
  };
  return (
    <div className="composer-wrap">
      <div className="composer">
        <div className="cond">
          <span className="l">재난상황 조건</span>
          <span className="pill pri">{REGIONS[cond.region].short}{cond.sigungu ? ` ${cond.sigungu}` : ""}</span>
          <span className="pill pri">{cond.disasterType}</span>
          <span className="pill">{baseLabel}</span>
          {cond.hydro?.rain1h != null && <span className="pill">1시간 {cond.hydro.rain1h}mm</span>}
          {cond.keywords?.length ? <span className="pill">{cond.keywords.join("·")}</span> : null}
          <button className="edit" onClick={() => setOpen(true)}>조건 변경 ›</button>
        </div>
        <textarea
          ref={ta}
          value={q}
          rows={2}
          maxLength={2000}
          placeholder="질문을 입력하세요. 예) 우리 지역 급경사지는 어디 있고, 왜·언제 위험한가요? (Enter 전송 · Shift+Enter 줄바꿈)"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="tools">
          <button className="chip" onClick={() => onSend("현재 상황 브리핑", "briefing")} disabled={busy}><IcDoc size={13} /> 현재 상황 브리핑</button>
          <span style={{ width: 1, height: 20, background: "var(--c-line)" }} />
          {PRESETS.map((p) => (
            <button key={p.key} className="chip" onClick={() => onSend(p.q, p.key)} disabled={busy}>{p.label}</button>
          ))}
          <span className="cnt">{q.length} / 2,000</span>
          <button className="btn pri sm" onClick={send} disabled={busy || !q.trim()}>질의 ›</button>
        </div>
      </div>
      {open && <CondModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function CondModal({ onClose }: { onClose: () => void }) {
  const { cond, setCond, account } = useSession();
  const [dt, setDt] = useState<DisasterType>(cond.disasterType);
  const [r1, setR1] = useState(cond.hydro?.rain1h?.toString() ?? "");
  const [rt, setRt] = useState(cond.hydro?.rainTotal?.toString() ?? "");
  const [kw, setKw] = useState(cond.keywords?.join(", ") ?? "");
  const [bt, setBt] = useState(cond.baseTime ?? "");
  const apply = () => {
    setCond({
      disasterType: dt,
      baseTime: bt || undefined,
      hydro: { rain1h: r1 ? Number(r1) : undefined, rainTotal: rt ? Number(rt) : undefined },
      keywords: kw ? kw.split(/[,\s]+/).filter(Boolean) : undefined,
    });
    onClose();
  };
  return (
    <div className="ovl" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="재난상황 조건">
        <div className="modal-hd">
          <h2>재난상황 조건</h2>
          <span className="sp" />
          <button className="iconbtn" onClick={onClose} aria-label="닫기"><IcX size={20} /></button>
        </div>
        <div className="modal-bd">
          <div className="frow">
            <span className="lb">기준지역</span>
            <span className="s">{REGIONS[cond.region].name} {account?.role === "지자체" && <span className="xs mute2">(소속 지역 고정)</span>}</span>
          </div>
          <div className="frow">
            <span className="lb">재난유형</span>
            <div className="row w">
              {DISASTER_TYPES.map((t) => (
                <button key={t} className={`chip ${dt === t ? "on" : ""}`} onClick={() => setDt(t as DisasterType)}>{dt === t ? "✓ " : ""}{t}</button>
              ))}
            </div>
          </div>
          <div className="frow">
            <span className="lb">발생·기준일시</span>
            <div className="row">
              <input type="datetime-local" className="input" value={bt} onChange={(e) => setBt(e.target.value)} />
              <span className="xs mute2">비워두면 발효 특보(또는 재현 사건) 기준</span>
            </div>
          </div>
          <div className="panel" style={{ background: "var(--c-surface)", marginTop: 8 }}>
            <b className="s">기상·수문 조건 (직접 입력)</b>
            <p className="xs muted" style={{ margin: "4px 0 10px" }}>입력하면 과거 사건의 강우-피해 임계치와 비교해 답변합니다.</p>
            <div className="grid2">
              <label className="row xs">1시간 강우 <input className="input sm" style={{ width: 100 }} inputMode="decimal" value={r1} onChange={(e) => setR1(e.target.value)} /> mm</label>
              <label className="row xs">누적 강우 <input className="input sm" style={{ width: 100 }} inputMode="decimal" value={rt} onChange={(e) => setRt(e.target.value)} /> mm</label>
            </div>
            <label className="row xs" style={{ marginTop: 12 }}>피해·통제 키워드 <input className="input sm" style={{ flex: 1 }} placeholder="예: 침수, 지하차도, 도로통제" value={kw} onChange={(e) => setKw(e.target.value)} /></label>
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn ghost sm" onClick={() => { setDt("호우"); setR1(""); setRt(""); setKw(""); setBt(""); }}>기본 조건으로 되돌리기</button>
          <span className="sp" />
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn pri" onClick={apply}>적용</button>
        </div>
      </div>
    </div>
  );
}
