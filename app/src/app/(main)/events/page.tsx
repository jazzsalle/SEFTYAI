"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { REGIONS } from "@/lib/config";
import StandaloneDetail from "@/components/StandaloneDetail";

interface Row {
  eventId: string; title: string; typeName: string; typeCode: string; startDate: string; endDate: string | null; status: string; synthetic: boolean; training: boolean;
  regions: string[]; regionRecords: string[]; maxRain: number | null; rainVerified: boolean; damageThousand: number; housesFlooded: number; traces: number; reports119: number; situationReports: number; ndms: string | null; damageTags: string[];
}
const eok = (t: number) => (t ? `${(t / 1e5).toFixed(t >= 1e6 ? 0 : 1)}억` : "—");

export default function EventsPage() {
  const { cond } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [sel, setSel] = useState<Row | null>(null);
  const [type, setType] = useState("전체");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch(`/api/events?region=${cond.region}`).then((r) => r.json()).then((j) => {
      setRows(j.events);
      setSel((s) => s ?? j.events.find((e: Row) => e.eventId === "1001-20200723-01") ?? j.events[0] ?? null);
    });
  }, [cond.region]);
  const list = useMemo(() => rows.filter((r) => (type === "전체" || r.typeName.includes(type)) && (!q || r.title.includes(q) || r.eventId.includes(q))), [rows, type, q]);
  const stats = useMemo(() => ({ n: rows.length, real: rows.filter((r) => !r.synthetic && !r.training).length, multi: rows.filter((r) => r.regions.length > 1).length, r119: rows.reduce((n, r) => n + r.reports119, 0) }), [rows]);

  return (
    <div className="page" style={{ display: "flex", minHeight: 0 }}>
      <div style={{ flex: "1 1 58%", minWidth: 0, overflowY: "auto" }}>
        <div className="page-in" style={{ maxWidth: "none" }}>
          <div className="ph">
            <div>
              <h1>재난사건 (재난마스터)</h1>
              <p>하나의 호우·태풍을 <b>(재난유형코드)-(발생일)-(순번)</b> 사건으로 묶고, 지역별 기록 아래에 특보·119 신고·피해·복구·침수흔적·상황보고를 연결합니다. · {REGIONS[cond.region].name}</p>
            </div>
          </div>
          <div className="grid3" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 16 }}>
            {[["재난사건", stats.n, "건"], ["실제 사건", stats.real, "건"], ["다지역 사건", stats.multi, "건"], ["연결된 119 신고", stats.r119, "건"]].map(([l, v, u]) => (
              <div key={l as string} className="fact"><div className="l">{l}</div><div className="v">{v}<small>{u}</small></div></div>
            ))}
          </div>
          <div className="row w" style={{ marginBottom: 12 }}>
            {["전체", "호우", "태풍"].map((t) => <button key={t} className={`chip ${type === t ? "on" : ""}`} onClick={() => setType(t)}>{t}</button>)}
            <span className="sp" />
            <input className="input sm" placeholder="사건명·ID 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          </div>
          <table className="tbl">
            <thead>
              <tr><th>재난마스터 ID</th><th>사건</th><th>지역 기록</th><th>시간최대</th><th>공공피해</th><th>주택침수</th><th>침수흔적</th><th>119</th></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.eventId} className="click" style={sel?.eventId === r.eventId ? { background: "#f5f8ff" } : undefined} onClick={() => setSel(r)}>
                  <td className="num" style={{ whiteSpace: "nowrap" }}><code style={{ fontSize: 12 }}>{r.eventId}</code>{r.ndms && <div className="xs mute2">NDMS {r.ndms}</div>}</td>
                  <td>
                    <b>{r.title}</b>
                    <div className="row w" style={{ gap: 4, marginTop: 4 }}>
                      {r.status === "진행중" && <span className="badge danger">진행중</span>}
                      {r.synthetic && <span className="badge warn">시연</span>}
                      {r.training && <span className="badge neutral">훈련</span>}
                      {r.damageTags.slice(0, 3).map((t) => <span key={t} className="badge neutral" style={{ height: 20 }}>{t}</span>)}
                    </div>
                  </td>
                  <td className="xs">{r.regions.join(" · ")}</td>
                  <td className="num">{r.maxRain != null ? <>{r.maxRain}mm{!r.rainVerified && <span className="mute2 xs"> *</span>}</> : <span className="mute2 xs" title="수신 데이터에 강우 없음 — ASOS 연계 필요">미확보</span>}</td>
                  <td className="num">{eok(r.damageThousand)}</td>
                  <td className="num">{r.housesFlooded || "—"}</td>
                  <td className="num">{r.traces || "—"}</td>
                  <td className="num">{r.reports119 || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="xs mute2" style={{ marginTop: 12 }}>시간최대 강우 = T3Q 기상결합(ASOS 시간강수) 값 — 연계 전 시연 가정값 · * 시연 시나리오 사건</p>
          <button className="btn sm line" style={{ marginTop: 8 }} onClick={() => router.push(`/explore?q=${encodeURIComponent("재난마스터 ID는 어떻게 묶이나요? 2020년 7월 23일 부산 호우 때 무슨 일이 있었나요?")}`)}>AI에게 사건 묻기 ›</button>
        </div>
      </div>
      <aside className="rpanel" style={{ flex: "1 1 42%", margin: 16, overflowY: "auto", display: "block" }}>
        {sel ? <StandaloneDetail key={sel.eventId} entity={{ type: "event", id: sel.eventId, name: sel.title }} /> : <div className="dpane muted">사건을 선택하세요.</div>}
      </aside>
    </div>
  );
}
