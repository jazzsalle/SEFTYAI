"use client";
import { SOURCE_LABEL } from "@/lib/jobTypes";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, type Conversation } from "@/lib/session";
import { REGIONS } from "@/lib/config";
import { IcSearch } from "@/components/Icons";

/** 대화의 기준지역 이름 — 대화를 시작할 때 남긴 이름(R32), 예전 대화는 시범 지역 이름 */
const regionOf = (c: Conversation) => c.baseName ?? REGIONS[c.region]?.name ?? c.region;

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function HistoryPage() {
  const { convs, deleteConvs, toast } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [period, setPeriod] = useState("전체");
  
  const [dt, setDt] = useState("전체");
  const [rg, setRg] = useState("전체");
  const [sel, setSel] = useState<string[]>([]);
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(false);

  const list = useMemo(() => {
    const now = Date.now();
    const lim = period === "오늘" ? 864e5 : period === "1주일" ? 7 * 864e5 : period === "1개월" ? 30 * 864e5 : Infinity;
    return [...convs]
      .filter((c) => (!qApplied || c.title.includes(qApplied) || c.turns.some((t) => t.q.includes(qApplied))) && now - new Date(c.updatedAt).getTime() <= lim && (dt === "전체" || (c.disasterType ?? "전체") === dt) && (rg === "전체" || regionOf(c) === rg))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [convs, qApplied, period, dt, rg]);
  // 기준지역 거르개 — 내 대화에 있는 기준지역 이름만(전국 기준지역 R32)
  const regionNames = useMemo(() => [...new Set(convs.map(regionOf))].sort((a, b) => a.localeCompare(b, "ko")), [convs]);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const view = list.slice((page - 1) * size, page * size);

  return (
    <div className="page">
      <div className="page-in narrow">
        <button className="btn xs ghost" onClick={() => router.push("/explore")}>‹ 대화로 돌아가기</button>
        <div className="ph" style={{ marginTop: 8 }}>
          <h1>대화 이력</h1>
        </div>
        <div className="row" style={{ gap: 0 }}>
          <input className="input" style={{ flex: 1, borderRadius: "6px 0 0 6px", height: 46 }} placeholder="대화 제목·질문을 입력하세요" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (setQApplied(q), setPage(1))} />
          <button className="btn pri" style={{ height: 46, borderRadius: "0 6px 6px 0" }} onClick={() => { setQApplied(q); setPage(1); }}><IcSearch /> 검색</button>
        </div>
        <div className="panel row w" style={{ marginTop: 12, background: "var(--c-surface)", gap: 14, padding: "12px 16px" }}>
          <b className="xs">기간</b>
          {["전체", "오늘", "1주일", "1개월"].map((p) => <button key={p} className={`chip ${period === p ? "on" : ""}`} onClick={() => { setPeriod(p); setPage(1); }}>{p}</button>)}
          <b className="xs">재난유형</b>
          <select className="select sm" value={dt} onChange={(e) => { setDt(e.target.value); setPage(1); }} aria-label="재난유형">
            {["전체", "호우", "태풍", "홍수", "침수", "산사태", "대설", "강풍"].map((x) => <option key={x}>{x}</option>)}
          </select>
          <b className="xs">기준지역</b>
          <select className="select sm" value={rg} onChange={(e) => { setRg(e.target.value); setPage(1); }} aria-label="기준지역">
            <option>전체</option>
            {regionNames.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <span className="sp" />
          <button className="btn xs ghost" onClick={() => { setQ(""); setQApplied(""); setPeriod("전체"); setDt("전체"); setRg("전체"); }}>↻ 초기화</button>
        </div>
        <div className="row" style={{ margin: "18px 0 8px" }}>
          <span className="s">총 <b style={{ color: "var(--c-primary-dk)" }}>{list.length}</b>건</span>
          <span className="sp" />
          <button className="btn sm" disabled={!sel.length} onClick={() => setConfirm(true)}>선택 삭제</button>
          <select className="select sm" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n}개 보기</option>)}
          </select>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 40 }}><input type="checkbox" aria-label="전체 선택" checked={view.length > 0 && view.every((c) => sel.includes(c.id))} onChange={(e) => setSel(e.target.checked ? view.map((c) => c.id) : [])} /></th>
              <th>대화 제목</th><th style={{ width: 90 }}>재난유형</th><th style={{ width: 150 }}>질문 방식</th><th style={{ width: 170 }}>기준지역</th><th style={{ width: 70 }}>질문</th><th style={{ width: 150 }}>최종 대화일시 ▼</th>
            </tr>
          </thead>
          <tbody>
            {view.map((c) => (
              <tr key={c.id} className="click" onClick={() => router.push(`/explore?c=${c.id}`)}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))} aria-label="선택" /></td>
                <td><b>{c.title}</b><div className="xs mute2" style={{ marginTop: 2 }}>{c.turns.map((t) => t.q).slice(0, 2).join(" · ")}</div></td>
                <td>{c.disasterType && c.disasterType !== "전체" ? c.disasterType : "전체"}</td>
                <td>{c.v === 2 ? [...new Set(c.turns.map((t) => SOURCE_LABEL[t.source] ?? "-"))].join(", ") : "이전 버전(표시 불가)"}</td>
                <td>{regionOf(c)}</td>
                <td>{c.turns.length}</td>
                <td className="num">{fmt(c.updatedAt)}</td>
              </tr>
            ))}
            {!view.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: 40 }} className="muted">대화 이력이 없습니다.</td></tr>}
          </tbody>
        </table>
        <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
          <button className="btn sm ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} className={`btn sm ${page === i + 1 ? "navy" : "ghost"}`} onClick={() => setPage(i + 1)}>{i + 1}</button>
          ))}
          <button className="btn sm ghost" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button>
        </div>
        <p className="xs mute2" style={{ marginTop: 20 }}>※ 대화 이력은 계정별로 보관되며, 답변은 대화 당시의 데이터·조건 기준입니다. (보관 기간·만료 정책은 운영계획에서 확정)</p>
      </div>
      {confirm && (
        <div className="ovl" onClick={() => setConfirm(false)}>
          <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd"><h2>대화 삭제</h2></div>
            <div className="modal-bd">선택한 대화 {sel.length}건을 삭제할까요? 삭제한 대화는 되돌릴 수 없습니다.</div>
            <div className="modal-ft"><span className="sp" /><button className="btn" onClick={() => setConfirm(false)}>취소</button><button className="btn danger" onClick={() => { deleteConvs(sel); setSel([]); setConfirm(false); toast("삭제했습니다."); }}>삭제</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
