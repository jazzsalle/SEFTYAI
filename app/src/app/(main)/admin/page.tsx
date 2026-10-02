"use client";
/** 운영관리 (SCR-UNE-603001~604002) — 시스템 운영자 전용 · 시연판 */
import { useEffect, useMemo, useState } from "react";
import { useSession, readTrace, type TraceRow } from "@/lib/session";

interface Acct { id: string; org: string; dept: string; role: string; status: "사용" | "잠금" | "중지" | "초기"; issued: string; last: string; hist: [string, string, string, string][] }
const SEED: Acct[] = [
  { id: "bs_safety01", org: "부산광역시", dept: "시민안전실 자연재난과", role: "지자체 공무원", status: "사용", issued: "2026-08-25", last: "2026-10-03 09:02", hist: [["2026-08-25 10:00", "발급", "admin01", "시범지역 담당자 사전 발급"]] },
  { id: "yc_safety02", org: "경상북도 영천시", dept: "안전재난하천과", role: "지자체 공무원", status: "사용", issued: "2026-08-25", last: "2026-10-02 18:40", hist: [["2026-08-25 10:02", "발급", "admin01", "시범지역 담당자 사전 발급"]] },
  { id: "ij_safety01", org: "강원특별자치도 인제군", dept: "안전교통과", role: "지자체 공무원", status: "사용", issued: "2026-08-25", last: "2026-10-03 07:11", hist: [["2026-08-25 10:03", "발급", "admin01", "시범지역 담당자 사전 발급"]] },
  { id: "locked01", org: "부산광역시", dept: "해운대구 안전총괄과", role: "지자체 공무원", status: "잠금", issued: "2026-09-01", last: "2026-10-02 22:15", hist: [["2026-09-01 09:00", "발급", "admin01", "구 담당자 추가"], ["2026-10-02 22:15", "잠금", "system", "비밀번호 5회 연속 실패"]] },
  { id: "newbie01", org: "경상북도 영천시", dept: "건설과", role: "지자체 공무원", status: "초기", issued: "2026-10-01", last: "—", hist: [["2026-10-01 14:20", "발급", "admin01", "지하차도 담당 추가(초기 비밀번호 변경 필요)"]] },
  { id: "retired07", org: "강원특별자치도 인제군", dept: "안전교통과", role: "지자체 공무원", status: "중지", issued: "2026-08-25", last: "2026-09-10 17:00", hist: [["2026-08-25 10:05", "발급", "admin01", "사전 발급"], ["2026-09-15 09:00", "사용중지", "admin01", "인사이동 · 권한 회수"]] },
  { id: "admin01", org: "유엔이 운영지원", dept: "시범서비스 운영", role: "시스템 운영자", status: "사용", issued: "2026-08-20", last: "2026-10-03 09:30", hist: [["2026-08-20 09:00", "발급", "system", "운영자 계정"]] },
];
const SAMPLE_TRACE: TraceRow[] = [
  { at: "2026-10-03T03:41:12.000Z", account: "bs_safety01", api: "T3Q-04 위험·취약지역 조회", intent: "risk", status: "TIMEOUT", ms: 30000, q: "초량 지하차도 지금 통제해야 하나요?", requestId: "REQ-sample-01", datasets: [] },
  { at: "2026-10-03T03:12:02.000Z", account: "yc_safety02", api: "T3Q-09 행동매뉴얼 대응절차", intent: "manual", status: "ok", ms: 1840, q: "호우주의보 단계에서 할 일", requestId: "REQ-sample-02", datasets: ["풍수해 현장조치 행동매뉴얼"] },
];
const mask = (q: string) => (q.length <= 6 ? "●●●" : q.slice(0, 4) + "●".repeat(Math.min(12, q.length - 6)) + q.slice(-2));

export default function AdminPage() {
  const { account, toast } = useSession();
  const [tab, setTab] = useState<"acct" | "trace">("acct");
  const [accts, setAccts] = useState(SEED);
  const [sel, setSel] = useState<Acct | null>(null);
  const [act, setAct] = useState<{ a: Acct; kind: string } | null>(null);
  const [why, setWhy] = useState("");
  const [trace, setTrace] = useState<TraceRow[]>([]);
  const [tsel, setTsel] = useState<TraceRow | null>(null);
  useEffect(() => setTrace([...readTrace(), ...SAMPLE_TRACE]), [tab]);
  const stats = useMemo(() => ({ ok: trace.filter((t) => t.status === "ok").length, fail: trace.filter((t) => t.status !== "ok" && t.status !== "clarify").length, avg: trace.length ? Math.round(trace.reduce((n, t) => n + t.ms, 0) / trace.length) : 0 }), [trace]);

  if (account?.role !== "운영자") return <div className="page"><div className="page-in"><div className="notice danger">운영관리는 시스템 운영자만 이용할 수 있습니다. (메뉴·기능 접근제어 FUN-UNE-703002)</div></div></div>;

  const apply = () => {
    if (!act || !why.trim()) return;
    const now = new Date().toISOString().slice(0, 16).replace("T", " ");
    const to: Acct["status"] = act.kind === "잠금 해제" ? "사용" : act.kind === "사용중지" ? "중지" : "초기";
    setAccts((l) => l.map((x) => (x.id === act.a.id ? { ...x, status: to, hist: [...x.hist, [now, act.kind, account.id, why]] } : x)));
    setSel((s) => (s && s.id === act.a.id ? { ...s, status: to, hist: [...s.hist, [now, act.kind, account.id, why]] } : s));
    setAct(null);
    setWhy("");
    toast(`${act.kind} 처리했습니다.`);
  };

  return (
    <div className="page">
      <div className="page-in">
        <div className="ph"><div><h1>운영관리</h1><p>계정 발급·잠금 해제·사용중지, T3Q 연계 추적로그 (시스템 운영자 전용)</p></div></div>
        <div className="subtabs" style={{ maxWidth: 420, marginTop: 0, marginBottom: 18 }}>
          <button className={tab === "acct" ? "on" : ""} onClick={() => setTab("acct")}>계정 관리</button>
          <button className={tab === "trace" ? "on" : ""} onClick={() => setTab("trace")}>연계 추적로그</button>
        </div>

        {tab === "acct" && (
          <div className="grid2" style={{ gridTemplateColumns: sel ? "1.4fr 1fr" : "1fr", alignItems: "start" }}>
            <table className="tbl">
              <thead><tr><th>계정 ID</th><th>소속</th><th>역할</th><th>상태</th><th>발급일</th><th>최종 접속</th></tr></thead>
              <tbody>
                {accts.map((a) => (
                  <tr key={a.id} className="click" onClick={() => setSel(a)} style={sel?.id === a.id ? { background: "#f5f8ff" } : undefined}>
                    <td><code>{a.id}</code></td><td>{a.org}<div className="xs mute2">{a.dept}</div></td><td className="xs">{a.role}</td>
                    <td><span className={`badge ${a.status === "사용" ? "ok" : a.status === "잠금" ? "danger" : a.status === "초기" ? "info" : "neutral"}`}>{a.status}</span></td>
                    <td className="num xs">{a.issued}</td><td className="num xs">{a.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sel && (
              <div className="panel">
                <div className="row"><h3 style={{ fontSize: 18 }}>{sel.id}</h3><span className="sp" /><button className="btn xs ghost" onClick={() => setSel(null)}>닫기</button></div>
                <dl className="kv" style={{ marginTop: 10 }}>
                  <dt>소속</dt><dd>{sel.org} {sel.dept}</dd><dt>역할</dt><dd>{sel.role}</dd><dt>상태</dt><dd>{sel.status}</dd><dt>발급일</dt><dd>{sel.issued}</dd>
                </dl>
                <div className="row w" style={{ margin: "14px 0" }}>
                  {sel.status === "잠금" && <button className="btn sm pri" onClick={() => setAct({ a: sel, kind: "잠금 해제" })}>잠금 해제</button>}
                  {sel.status !== "중지" && sel.role !== "시스템 운영자" && <button className="btn sm" onClick={() => setAct({ a: sel, kind: "사용중지" })}>사용중지</button>}
                  <button className="btn sm" onClick={() => setAct({ a: sel, kind: "비밀번호 초기화" })}>비밀번호 초기화</button>
                </div>
                <h4 className="xs muted" style={{ marginBottom: 6 }}>관리이력</h4>
                <table className="tbl"><tbody>{[...sel.hist].reverse().map((h, i) => <tr key={i}><td className="num xs">{h[0]}</td><td className="xs b">{h[1]}</td><td className="xs">{h[2]}</td><td className="xs">{h[3]}</td></tr>)}</tbody></table>
              </div>
            )}
          </div>
        )}

        {tab === "trace" && (
          <>
            <div className="grid3" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 14 }}>
              {[["호출", trace.length, "건"], ["정상", stats.ok, "건"], ["오류·지연", stats.fail, "건"], ["평균 응답", (stats.avg / 1000).toFixed(1), "초"]].map(([l, v, u]) => <div key={l as string} className="fact"><div className="l">{l}</div><div className="v">{v}<small>{u}</small></div></div>)}
            </div>
            <div className="grid2" style={{ gridTemplateColumns: tsel ? "1.5fr 1fr" : "1fr", alignItems: "start" }}>
              <table className="tbl">
                <thead><tr><th>시각</th><th>계정</th><th>API</th><th>의도</th><th>결과</th><th>응답</th><th>질의(마스킹)</th></tr></thead>
                <tbody>
                  {trace.map((t, i) => (
                    <tr key={i} className="click" onClick={() => setTsel(t)}>
                      <td className="num xs">{new Date(t.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                      <td className="xs">{t.account}</td><td className="xs">{t.api}</td><td className="xs">{t.intent}</td>
                      <td><span className={`badge ${t.status === "ok" ? "ok" : t.status === "clarify" ? "info" : "danger"}`}>{t.status}</span></td>
                      <td className="num xs">{(t.ms / 1000).toFixed(1)}s</td><td className="xs">{mask(t.q)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tsel && (
                <div className="panel">
                  <div className="row"><h3 style={{ fontSize: 16 }}>추적로그 상세</h3><span className="sp" /><button className="btn xs ghost" onClick={() => setTsel(null)}>닫기</button></div>
                  <dl className="kv" style={{ marginTop: 10 }}>
                    <dt>요청 ID</dt><dd><code>{tsel.requestId}</code></dd><dt>시각</dt><dd>{new Date(tsel.at).toLocaleString("ko-KR")}</dd><dt>계정</dt><dd>{tsel.account}</dd><dt>API</dt><dd>{tsel.api}</dd>
                    <dt>결과</dt><dd>{tsel.status}{tsel.status === "TIMEOUT" ? " — T3Q 공통규약 504, 사용자에게 [다시 시도] 안내" : ""}</dd><dt>응답 시간</dt><dd>{tsel.ms}ms</dd>
                    <dt>질의 원문</dt><dd>{mask(tsel.q)} <span className="xs mute2">(FUN-UNE-803003 마스킹)</span></dd><dt>조회 데이터</dt><dd>{tsel.datasets.join(", ") || "—"}</dd>
                  </dl>
                </div>
              )}
            </div>
            <p className="xs mute2" style={{ marginTop: 12 }}>※ 시연판은 이 브라우저에서 발생한 호출을 기록합니다. 운영 시 서버 로그(요청 ID 기준)로 대체.</p>
          </>
        )}
      </div>
      {act && (
        <div className="ovl" onClick={() => setAct(null)}>
          <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd"><h2>{act.kind} — {act.a.id}</h2></div>
            <div className="modal-bd">
              <label className="xs b">처리 사유 (필수)</label>
              <textarea className="input" style={{ width: "100%", height: 80, padding: 10, marginTop: 6 }} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="예) 본인 확인 완료 후 잠금 해제 요청" />
              <p className="xs mute2">적용일시는 처리 시각으로 기록되며 관리이력에 남습니다.</p>
            </div>
            <div className="modal-ft"><span className="sp" /><button className="btn" onClick={() => setAct(null)}>취소</button><button className="btn pri" disabled={!why.trim()} onClick={apply}>처리</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
