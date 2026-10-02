"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session";
import { REGIONS } from "@/lib/config";
import type { AgentResponse, EntityRef } from "@/lib/contract/agent";

/** 토큰 제거·치환 (인쇄용 평문) */
function plain(text: string, ents: Map<string, EntityRef>) {
  return text
    .replace(/\{\{e:([^}]+)\}\}/g, (_, id) => ents.get(id)?.name ?? id)
    .replace(/\[\[c(\d+)\]\]/g, "[$1]")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

function Body({ res, q }: { res: AgentResponse; q: string }) {
  const ents = new Map(res.entities.map((e) => [e.id, e]));
  return (
    <>
      <h2>질의</h2>
      <p style={{ fontSize: 13 }}>{q}</p>
      {res.blocks.map((b, i) => {
        switch (b.kind) {
          case "headline":
            return (<div key={i}><h2>요약</h2><p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.7 }}>{plain(b.text, ents)}</p></div>);
          case "facts":
            return (
              <div key={i}>
                <h2>{b.title ?? "핵심 수치"}</h2>
                <table><tbody>{b.items.map((f, j) => <tr key={j}><th style={{ width: "32%" }}>{f.label}</th><td><b>{f.value}{f.unit}</b> {f.note ? ` — ${plain(f.note, ents)}` : ""}</td></tr>)}</tbody></table>
              </div>
            );
          case "narrative":
            return (<div key={i}><h2>{b.title ?? "상세"}</h2>{b.paragraphs.map((p, j) => <p key={j} style={{ fontSize: 13, lineHeight: 1.7 }}>{plain(p, ents)}</p>)}</div>);
          case "actions":
            return (
              <div key={i}>
                <h2>{b.title} — {b.stage.name}</h2>
                <table><thead><tr><th style={{ width: 28 }}>□</th><th>조치사항</th><th style={{ width: "22%" }}>담당</th><th style={{ width: "14%" }}>시한</th></tr></thead>
                  <tbody>{b.items.map((a) => <tr key={a.seq}><td>□</td><td>{plain(a.task, ents)}</td><td>{a.owner}</td><td>{a.due}</td></tr>)}</tbody></table>
              </div>
            );
          case "results":
            return (
              <div key={i}>
                <h2>조회 결과</h2>
                {b.groups.map((g) => (
                  <table key={g.key} style={{ marginBottom: 8 }}>
                    <thead><tr><th colSpan={3}>{g.label} (총 {g.total})</th></tr></thead>
                    <tbody>{g.items.slice(0, 10).map((it, k) => <tr key={it.id}><td style={{ width: 24 }}>{k + 1}</td><td><b>{it.name}</b> {it.category ? `(${it.category})` : ""}<br /><span style={{ color: "#555" }}>{it.summary}</span></td><td style={{ width: "18%" }}>{it.metric}</td></tr>)}</tbody>
                  </table>
                ))}
              </div>
            );
          case "similar":
            return (
              <div key={i}>
                <h2>과거 유사사례</h2>
                <table><thead><tr><th>사건</th><th style={{ width: 60 }}>유사도</th><th>요약</th></tr></thead>
                  <tbody>{b.items.map((s) => <tr key={s.eventId}><td>{s.title}<br /><span style={{ color: "#777" }}>{s.eventId}</span></td><td>{s.score}</td><td>{s.summary}</td></tr>)}</tbody></table>
              </div>
            );
          case "timeline":
            return (
              <div key={i}>
                <h2>{b.title}</h2>
                <table><tbody>{b.items.map((t, j) => <tr key={j}><td style={{ width: "22%" }}>{t.at}</td><td style={{ width: "12%" }}>{t.label}</td><td>{plain(t.text, ents)}</td></tr>)}</tbody></table>
              </div>
            );
          case "notice":
            return <p key={i} style={{ fontSize: 12, color: "#8a5a00" }}>※ {plain(b.text, ents)}</p>;
          case "briefing":
            return (
              <div key={i}>
                <h2>브리핑 항목</h2>
                <table><tbody>{b.items.map((it) => <tr key={it.key}><th style={{ width: "24%" }}>{it.label}</th><td>{it.status === "ok" ? plain(it.summary, ents) : "조회 실패"}</td><td style={{ width: "12%" }}>{it.count}</td></tr>)}</tbody></table>
              </div>
            );
          default:
            return null;
        }
      })}
      {res.citations.length > 0 && (
        <>
          <h2>근거</h2>
          <ol style={{ fontSize: 11, paddingLeft: 18, listStyle: "decimal" }}>
            {res.citations.map((c) => <li key={c.id}>[{c.id.slice(1)}] {c.title}{c.page ? ` p.${c.page}` : ""}{c.locator ? ` · ${c.locator}` : ""}{c.dataset ? ` (★${c.dataset})` : ""}</li>)}
          </ol>
        </>
      )}
    </>
  );
}

function Report() {
  const sp = useSearchParams();
  const { convs, account, ready } = useSession();
  if (!ready) return null;
  const c = convs.find((x) => x.id === sp.get("c"));
  const turns = c?.turns.filter((t) => t.res && (!sp.get("t") || t.id === sp.get("t"))) ?? [];
  const now = new Date();
  return (
    <div style={{ background: "#e9ecef", minHeight: "100vh", padding: "1px 0" }}>
      <div className="noprint row" style={{ justifyContent: "center", padding: 14, gap: 8 }}>
        <button className="btn pri" onClick={() => window.print()}>인쇄 / PDF 저장</button>
        <button className="btn" onClick={() => window.close()}>닫기</button>
      </div>
      <article className="report">
        <h1>{turns[0]?.res?.intent === "briefing" ? "재난상황 브리핑 보고" : "재난안전 AI 조회 결과 보고"}</h1>
        <div className="meta">
          <span>기준지역 : {c ? REGIONS[c.region].name : "-"} · 재난유형 : {c?.disasterType ?? "-"}</span>
          <span>작성 : {account?.org} {account?.dept} · {now.toLocaleString("ko-KR")}</span>
        </div>
        {!c || !turns.length ? <p>보고할 대화를 찾지 못했습니다.</p> : turns.map((t) => <Body key={t.id} res={t.res!} q={t.q} />)}
        <p style={{ fontSize: 10, color: "#777", marginTop: 24, borderTop: "1px solid #ccc", paddingTop: 8 }}>
          본 보고서는 재난안전 AI 시범서비스의 조회 결과를 자동 정리한 것으로, 최종 판단은 관계 법령·매뉴얼 및 현장 상황에 따릅니다. 유사도는 피해 예측값이 아닌 조건 일치도입니다.
        </p>
      </article>
    </div>
  );
}

export default function ReportPage() {
  return <Suspense><Report /></Suspense>;
}
