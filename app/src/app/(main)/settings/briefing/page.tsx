"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { BRIEF_AIM_COUNT, BRIEF_DEFAULT, BRIEF_MAX, BRIEF_START_COUNT, loadBrief, saveBrief, type BriefItem } from "@/lib/briefing";

/** 내 브리핑 항목 (UFR-006-001-05) — 계정별 사용·순서·질의문. AI 모드 「브리핑 질문」 = 위에서부터 5개, 시작 화면 = 무작위 4개 */
export default function BriefingSettings() {
  const { account, toast } = useSession();
  const [items, setItems] = useState<BriefItem[]>(BRIEF_DEFAULT);
  useEffect(() => setItems(loadBrief(account?.id)), [account?.id]);
  const mv = (i: number, d: number) => setItems((l) => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  const save = () => { saveBrief(account?.id, items); toast("브리핑 항목을 저장했습니다."); };
  return (
    <div className="page">
      <div className="page-in narrow">
        <div className="ph"><div><h1>내 브리핑 항목</h1><p>시작 화면과 AI 모드에 ‘브리핑 질문’으로 나오는 항목입니다. AI 모드는 사용 중인 항목을 <b>위에서부터 {BRIEF_AIM_COUNT}개</b>, 시작 화면은 접속할 때마다 <b>무작위 {BRIEF_START_COUNT}개</b>를 보여줍니다. (최대 {BRIEF_MAX}개 · 계정별 저장)</p></div></div>
        <table className="tbl">
          <thead><tr><th style={{ width: 60 }}>사용</th><th style={{ width: 160 }}>항목</th><th>질의문</th><th style={{ width: 150 }}>순서 · 삭제</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.key + i}>
                <td><input type="checkbox" checked={it.on} onChange={() => setItems((l) => l.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} /></td>
                <td><input className="input sm" value={it.label} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></td>
                <td><input className="input sm" style={{ width: "100%" }} value={it.q} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, q: e.target.value, preset: undefined } : x)))} /></td>
                <td><button className="btn xs" disabled={i === 0} onClick={() => mv(i, -1)}>▲</button> <button className="btn xs" disabled={i === items.length - 1} onClick={() => mv(i, 1)}>▼</button> <button className="btn xs ghost" aria-label={`${it.label} 삭제`} title="삭제" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn sm" disabled={items.length >= BRIEF_MAX} onClick={() => setItems((l) => [...l, { key: `c${Date.now()}`, label: "새 항목", q: "", on: true }])}>+ 항목 추가</button>
          <button className="btn sm ghost" onClick={() => setItems(BRIEF_DEFAULT)}>기본값으로 되돌리기</button>
          <span className="sp" />
          <button className="btn pri" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}
