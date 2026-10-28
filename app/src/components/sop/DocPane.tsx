"use client";
import { useEffect, useState } from "react";
import type { Citation } from "@/lib/contract/agent";

/** 행동매뉴얼 원문 뷰어 (대응절차 보존 기능 — /api/docs?docId=MAN:…) */
interface DocView { title: string; kind: string; page?: number; pageCount?: number; image?: string; heading?: string; text?: string; highlight?: string; region?: string; downloadable: boolean; meta: { label: string; value: string }[] }
export function DocPane({ c }: { c: Citation }) {
  const [d, setD] = useState<DocView | null>(null);
  useEffect(() => {
    fetch(`/api/docs?docId=${encodeURIComponent(c.docId)}${c.page ? `&page=${c.page}` : ""}&locator=${encodeURIComponent(c.locator ?? "")}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD(null));
  }, [c.docId, c.page, c.locator]);
  return (
    <div className="dpane fadein">
      <span className="badge ok sq">{c.kind}</span>
      <h2 style={{ fontSize: 19, marginTop: 8 }}>{d?.title ?? c.title}</h2>
      <div className="xs muted" style={{ marginTop: 4 }}>{d?.region}</div>
      <div className="row" style={{ margin: "14px 0", paddingBottom: 10, borderBottom: "1px solid var(--c-line)" }}>
        <span className="xs muted">{d?.heading ?? c.locator ?? ""}</span>
        <span className="sp" />
        {c.page && <span className="badge neutral">원본 {c.page}{d?.pageCount ? ` / ${d.pageCount}쪽` : "쪽"}</span>}
        {d?.downloadable && <a className="btn xs" href={`/api/docs?docId=${encodeURIComponent(c.docId)}&download=1`}>원문 내려받기</a>}
      </div>
      {(c.quote || d?.highlight) && (
        <div className="panel" style={{ background: "#fffbeb", borderColor: "#f0d38a", borderLeft: "4px solid #e0a83c", padding: "12px 16px" }}>
          <div className="xs b" style={{ color: "#8a5a00" }}>근거 · 답변이 인용한 문장</div>
          <div className="s" style={{ marginTop: 4, lineHeight: 1.7 }}>{c.quote ?? d?.highlight}</div>
        </div>
      )}
      {d?.meta?.length ? (
        <dl className="kv" style={{ marginTop: 14 }}>
          {d.meta.map((m) => (<div key={m.label} style={{ display: "contents" }}><dt>{m.label}</dt><dd>{m.value}</dd></div>))}
        </dl>
      ) : null}
      {d?.text && <div className="s" style={{ whiteSpace: "pre-line", lineHeight: 1.75, marginTop: 14 }}>{d.text}</div>}
      {d?.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.image} alt={`${d.title} ${c.page ?? ""}쪽 원문`} style={{ width: "100%", marginTop: 14, border: "1px solid var(--c-line)", borderRadius: 8 }} />
      )}
    </div>
  );
}
