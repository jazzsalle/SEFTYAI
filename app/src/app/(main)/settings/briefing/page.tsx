"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { PRESETS } from "@/components/explore/Composer";

interface Item { key: string; label: string; q: string; on: boolean }
const DEF: Item[] = PRESETS.map((p) => ({ key: p.key, label: p.label, q: p.q, on: true }));

/** 내 브리핑 항목 (UFR-006-001-05 · 변경 협의) — 계정별 사용·순서·질의문, 최대 8개 */
export default function BriefingSettings() {
  const { account, toast } = useSession();
  const k = `sa.brief.${account?.id}`;
  const [items, setItems] = useState<Item[]>(DEF);
  useEffect(() => {
    try {
      const v = localStorage.getItem(k);
      if (v) setItems(JSON.parse(v));
    } catch {}
  }, [k]);
  const mv = (i: number, d: number) => setItems((l) => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  const save = () => { try { localStorage.setItem(k, JSON.stringify(items)); } catch {} toast("브리핑 항목을 저장했습니다."); };
  return (
    <div className="page">
      <div className="page-in narrow">
        <div className="ph"><div><h1>내 브리핑 항목</h1><p>‘현재 상황 브리핑’을 실행할 때 같은 재난상황 조건으로 함께 조회할 항목입니다. (최대 8개 · 계정별 저장)</p></div></div>
        <table className="tbl">
          <thead><tr><th style={{ width: 60 }}>사용</th><th style={{ width: 160 }}>항목</th><th>질의문</th><th style={{ width: 110 }}>순서</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.key + i}>
                <td><input type="checkbox" checked={it.on} onChange={() => setItems((l) => l.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} /></td>
                <td><input className="input sm" value={it.label} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></td>
                <td><input className="input sm" style={{ width: "100%" }} value={it.q} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} /></td>
                <td><button className="btn xs" disabled={i === 0} onClick={() => mv(i, -1)}>▲</button> <button className="btn xs" disabled={i === items.length - 1} onClick={() => mv(i, 1)}>▼</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn sm" disabled={items.length >= 8} onClick={() => setItems((l) => [...l, { key: `c${Date.now()}`, label: "새 항목", q: "", on: true }])}>+ 항목 추가</button>
          <button className="btn sm ghost" onClick={() => setItems(DEF)}>기본값으로 되돌리기</button>
          <span className="sp" />
          <button className="btn pri" onClick={save}>저장</button>
        </div>
        <p className="xs mute2" style={{ marginTop: 16 }}>※ 요구사항 v1.71에서 ‘질의 세트 저장’ → ‘프리셋’으로 변경, 계정별 관리는 발주처 협의 중(변경 협의)입니다.</p>
      </div>
    </div>
  );
}
