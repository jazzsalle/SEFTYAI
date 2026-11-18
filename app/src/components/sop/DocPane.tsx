"use client";
import { useEffect, useState } from "react";
import type { Citation } from "@/lib/contract/agent";

/**
 * 행동매뉴얼 원문 뷰어 — 대응절차의 [매뉴얼 원문] · p.N 단추가 우측 패널에 여는 탭(/api/docs?docId=MAN:…)
 * 개발서버 features/manual/poc/DocPane 과 같게(2026-11-19): 표지 「매뉴얼」 고정, 불러오는 중 점 셋,
 * 실패 「원문을 불러오지 못했습니다.」, 원문 내려받기 단추·인용 강조 상자 없음. 이 탭은 대응절차에서만 연다.
 */
interface DocView { title: string; kind: string; page?: number; pageCount?: number; image?: string; heading?: string; text?: string; region?: string; meta: { label: string; value: string }[] }
export function DocPane({ c }: { c: Citation }) {
  const [d, setD] = useState<DocView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setD(null);
    setFailed(false);
    fetch(`/api/docs?docId=${encodeURIComponent(c.docId)}${c.page ? `&page=${c.page}` : ""}&locator=${encodeURIComponent(c.locator ?? "")}`)
      .then((r) => (r.ok ? (r.json() as Promise<DocView>) : Promise.reject()))
      .then((v) => alive && setD(v))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [c.docId, c.page, c.locator]);
  return (
    <div className="dpane fadein">
      <span className="badge ok sq">매뉴얼</span>
      <h2 style={{ fontSize: "calc(19px * var(--fs-scale))", marginTop: 8 }}>{d?.title ?? "행동매뉴얼 원문"}</h2>
      <div className="xs muted" style={{ marginTop: 4 }}>{d?.region}</div>
      <div className="row" style={{ margin: "14px 0", paddingBottom: 10, borderBottom: "1px solid var(--c-line)" }}>
        <span className="xs muted">{d?.heading || c.locator || ""}</span>
        <span className="sp" />
        {c.page && <span className="badge neutral">원본 {c.page}{d?.pageCount ? ` / ${d.pageCount}쪽` : "쪽"}</span>}
      </div>
      {failed && <div className="notice danger">원문을 불러오지 못했습니다.</div>}
      {!d && !failed && <div className="typing"><i /><i /><i /></div>}
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
