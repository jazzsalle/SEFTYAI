"use client";
/**
 * 상황전파 이력 (UFR-009-001-02) — 발송 묶음 목록 + 수신자별·채널별 결과 (요청 접수 → 발송 성공 / 발송 실패 / 결과 미확인)
 *  · 결과를 기다리는 건이 있으면 5초마다 새로 읽음 (useDispatches)
 *  · 재발송: 대상·문안을 다시 확인한 뒤 보냄 — 전체 또는 실패·결과 미확인 수신자만 · 운영자는 조회만
 */
import { useMemo, useState } from "react";
import { CH_LABEL, maskPhone, type Channel, type Dispatch, type SendStatus } from "@/lib/contacts";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const TONE: Record<SendStatus, string> = { "요청 접수": "info", "발송 성공": "ok", "발송 실패": "danger", "결과 미확인": "warn", "연락처 없음": "neutral" };
const count = (d: Dispatch) => {
  const n: Partial<Record<SendStatus, number>> = {};
  d.to.forEach((t) => Object.values(t.result).forEach((s) => s && (n[s] = (n[s] ?? 0) + 1)));
  return n;
};
const needRetry = (d: Dispatch) => d.to.some((t) => Object.values(t.result).some((s) => s === "발송 실패" || s === "결과 미확인"));

export default function DispatchHistory({ list, show, onResend }: { list: Dispatch[]; show: boolean; onResend?: (d: Dispatch, onlyFailed: boolean) => void }) {
  const [selId, setSel] = useState("");
  const [ch, setCh] = useState<"" | Channel>("");
  const shown = useMemo(() => list.filter((d) => !ch || d.channels.includes(ch)), [list, ch]);
  const sel = shown.find((d) => d.id === selId) ?? shown[0];
  if (!list.length) return <div className="ct-card"><div className="ct-empty">상황전파 이력이 없습니다. 대응절차 패널의 [상황전파]로 보낸 내용이 여기에 남습니다.</div></div>;
  const n = sel ? count(sel) : {};
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
        {shown.map((d) => {
          const c = count(d);
          return (
            <button key={d.id} className={`ct-item col ${sel?.id === d.id ? "on" : ""}`} onClick={() => setSel(d.id)}>
              <span className="xs mute2">{fmt(d.at)} · {d.by}{d.resendOf ? " · 재발송" : ""}</span>
              <span className="ell">{d.message.split("\n")[0]}</span>
              <span className="xs">
                {d.channels.map((x) => CH_LABEL[x]).join("·")} {d.to.length}명
                {c["요청 접수"] ? <span className="ct-st info"> 대기 {c["요청 접수"]}</span> : null}
                {c["발송 실패"] ? <span className="ct-st danger"> 실패 {c["발송 실패"]}</span> : null}
                {c["결과 미확인"] ? <span className="ct-st warn"> 미확인 {c["결과 미확인"]}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {sel && (
        <div className="ct-card">
          <div className="ct-hd">
            <h2>{fmt(sel.at)} 전파 <span className="cnt">{sel.to.length}명</span></h2>
            <span className="sp" />
            {onResend && needRetry(sel) && <button className="btn sm line" onClick={() => onResend(sel, true)}>실패·미확인만 재발송</button>}
            {onResend && <button className="btn sm" onClick={() => onResend(sel, false)}>대상·문안 검토 후 재발송</button>}
          </div>
          <div className="xs mute2" style={{ marginBottom: 8 }}>발송자 {sel.by} · {sel.channels.map((c) => CH_LABEL[c]).join(" + ")}{sel.context ? ` · ${sel.context}` : ""}{sel.resendOf ? " · 재발송" : ""}</div>
          <div className="ct-msg">{sel.message}</div>
          <div className="ct-sum" style={{ marginTop: 12 }}>
            {(Object.keys(TONE) as SendStatus[]).filter((s) => n[s]).map((s) => <span key={s}><span className={`badge sq ${TONE[s]}`}>{s}</span> <b>{n[s]}</b>건</span>)}
            {n["요청 접수"] ? <span className="xs mute2">결과 알림을 기다리는 중 — 자동으로 새로 고칩니다</span> : null}
          </div>
          <table className="tbl" style={{ marginTop: 10 }}>
            <thead><tr><th>이름</th><th>소속</th>{sel.channels.map((c) => <th key={c}>{CH_LABEL[c]}</th>)}</tr></thead>
            <tbody>
              {sel.to.map((r) => (
                <tr key={r.id}>
                  <td className="b">{r.name} <span className="muted">{r.title}</span></td>
                  <td className="muted">{r.unit}</td>
                  {sel.channels.map((c) => {
                    const s = r.result[c];
                    return (
                      <td key={c}>
                        {s && <span className={`badge sq ${TONE[s]}`}>{s}</span>}{" "}
                        {s !== "연락처 없음" && <span className={c === "SMS" ? "num" : "muted"}>{c === "SMS" ? maskPhone(r.phone, show) : r.email}</span>}
                        {r.reason?.[c] && <div className="xs" style={{ color: s === "발송 실패" ? "var(--c-dang)" : "var(--c-sub)" }}>{r.reason[c]}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="xs mute2" style={{ marginTop: 8 }}>
            ‘요청 접수’는 발송 모듈에 요청한 상태, ‘발송 성공’은 모듈이 발송을 마쳤다고 알려 온 상태입니다. 수신자가 열람했다는 뜻은 아닙니다. 결과 알림이 오지 않으면 ‘결과 미확인’으로 바뀝니다.
            {sel.provider === "mock" && <> 모의 모듈 시험 규칙 — 휴대전화 끝자리 9: 발송 실패 / 끝자리 8: 결과 미확인 / 이메일에 fail 포함: 발송 실패 / 그 외: 발송 성공.</>}
          </div>
        </div>
      )}
    </div>
  );
}
