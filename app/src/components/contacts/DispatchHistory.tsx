"use client";
/** 상황전파 이력 (UFR-009-001-02) — 발송 묶음 목록 + 수신자별 채널 결과 · 운영자는 조회만 */
import { useMemo, useState } from "react";
import { CH_LABEL, maskPhone, type Dispatch } from "@/lib/contacts";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function DispatchHistory({ list, show, onResend }: { list: Dispatch[]; show: boolean; onResend?: (d: Dispatch) => void }) {
  const [selId, setSel] = useState("");
  const [ch, setCh] = useState<"" | "SMS" | "EMAIL">("");
  const shown = useMemo(() => list.filter((d) => !ch || d.channels.includes(ch)), [list, ch]);
  const sel = shown.find((d) => d.id === selId) ?? shown[0];
  if (!list.length) return <div className="ct-card"><div className="ct-empty">상황전파 이력이 없습니다. 대응절차 패널의 [상황전파]로 보낸 내용이 여기에 남습니다.</div></div>;
  return (
    <div className="ct-2col wide">
      <div className="ct-card ct-side">
        <div className="ct-hd">
          <h2>전파 이력</h2>
          <span className="sp" />
          <select className="select sm" value={ch} onChange={(e) => setCh(e.target.value as typeof ch)} aria-label="채널">
            <option value="">전체 채널</option><option value="SMS">문자</option><option value="EMAIL">이메일</option>
          </select>
        </div>
        {shown.map((d) => (
          <button key={d.id} className={`ct-item col ${sel?.id === d.id ? "on" : ""}`} onClick={() => setSel(d.id)}>
            <span className="xs mute2">{fmt(d.at)} · {d.by}{d.resendOf ? " · 재발송" : ""}</span>
            <span className="ell">{d.message.split("\n")[0]}</span>
            <span className="xs">{d.channels.map((c) => CH_LABEL[c]).join("·")} {d.to.length}명</span>
          </button>
        ))}
      </div>
      {sel && (
        <div className="ct-card">
          <div className="ct-hd">
            <h2>{fmt(sel.at)} 전파 <span className="cnt">{sel.to.length}명</span></h2>
            <span className="sp" />
            {onResend && <button className="btn sm" onClick={() => onResend(sel)}>대상·문안 검토 후 재발송</button>}
          </div>
          <div className="xs mute2" style={{ marginBottom: 8 }}>발송자 {sel.by} · {sel.channels.map((c) => CH_LABEL[c]).join(" + ")}{sel.context ? ` · ${sel.context}` : ""}</div>
          <div className="ct-msg">{sel.message}</div>
          <table className="tbl" style={{ marginTop: 14 }}>
            <thead><tr><th>이름</th><th>소속</th>{sel.channels.includes("SMS") && <th>문자</th>}{sel.channels.includes("EMAIL") && <th>이메일</th>}</tr></thead>
            <tbody>
              {sel.to.map((r) => (
                <tr key={r.id}>
                  <td className="b">{r.name} <span className="muted">{r.title}</span></td>
                  <td className="muted">{r.unit}</td>
                  {sel.channels.includes("SMS") && <td>{r.result.SMS === "요청 접수" ? <><span className="badge sq info">요청 접수</span> <span className="num">{maskPhone(r.phone, show)}</span></> : <span className="badge sq danger">연락처 없음</span>}</td>}
                  {sel.channels.includes("EMAIL") && <td>{r.result.EMAIL === "요청 접수" ? <><span className="badge sq info">요청 접수</span> <span className="muted">{r.email}</span></> : <span className="badge sq danger">연락처 없음</span>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="xs mute2" style={{ marginTop: 8 }}>‘요청 접수’는 발송 모듈에 요청한 상태이며 실제 수신·열람을 뜻하지 않습니다. 시연판은 문자·이메일 발송 모듈 연계 전입니다.</div>
        </div>
      )}
    </div>
  );
}
