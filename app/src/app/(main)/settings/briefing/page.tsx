"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { BRIEF_AIM_COUNT, BRIEF_DEFAULT, BRIEF_MAX, BRIEF_MIN, BRIEF_START_COUNT, loadBrief, saveBrief, type BriefItem } from "@/lib/briefing";

/** 내 브리핑 항목 (UFR-006-001-05) — 계정별 질문·체크·순서. 체크한 항목 = 내 브리핑 세트 (AI 모드 위에서부터 4개, 시작 화면 무작위 4개) */
export default function BriefingSettings() {
  const { account, toast } = useSession();
  const [items, setItems] = useState<BriefItem[]>(BRIEF_DEFAULT);
  const [askReset, setAskReset] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    loadBrief(account?.id).then(setItems);
  }, [account?.id]);
  const mv = (i: number, d: number) => setItems((l) => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  const on = items.filter((x) => x.on && x.q.trim()).length;
  const blank = items.some((x) => x.on && !x.q.trim());
  const ok = on >= BRIEF_MIN && !blank;
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await saveBrief(account?.id, items.filter((x) => x.q.trim() || x.on));
      toast("브리핑 항목을 저장했습니다.");
    } catch (e) {
      toast(`저장하지 못했습니다. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div className="page-in narrow">
        <div className="ph"><div><h1>내 브리핑 항목</h1><p>시작 화면과 AI 모드에 ‘브리핑 질문’으로 나오는 항목입니다. <b>사용</b>에 체크한 항목이 내 브리핑 세트가 됩니다. AI 모드는 체크한 항목을 <b>위에서부터 {BRIEF_AIM_COUNT}개</b>, 시작 화면은 체크한 항목 중 접속할 때마다 <b>무작위 {BRIEF_START_COUNT}개</b>를 보여 줍니다. (최대 {BRIEF_MAX}개 · {BRIEF_MIN}개 이상 체크 · 계정별 저장)</p></div></div>
        <table className="tbl">
          <thead><tr><th style={{ width: 60 }}>사용</th><th style={{ width: 170 }}>항목</th><th>질의문</th><th style={{ width: 150 }}>순서 · 삭제</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.key + i}>
                <td><input type="checkbox" checked={it.on} aria-label={`${it.label} 사용`} onChange={() => setItems((l) => l.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} /></td>
                <td><input className="input sm" value={it.label} aria-label="항목 이름" onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></td>
                <td><input className="input sm" style={{ width: "100%" }} value={it.q} aria-label="질의문" placeholder="질문을 입력하세요" onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, q: e.target.value, preset: undefined } : x)))} /></td>
                <td><button className="btn xs" disabled={i === 0} onClick={() => mv(i, -1)} aria-label="위로">▲</button> <button className="btn xs" disabled={i === items.length - 1} onClick={() => mv(i, 1)} aria-label="아래로">▼</button> <button className="btn xs ghost" aria-label={`${it.label} 삭제`} title="삭제" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn sm" disabled={items.length >= BRIEF_MAX} onClick={() => setItems((l) => [...l, { key: `c${Date.now()}`, label: "새 항목", q: "", on: true }])}>+ 항목 추가</button>
          <button className="btn sm ghost" onClick={() => setAskReset(true)}>기본 항목으로 되돌리기</button>
          <span className="sp" />
          <span className="xs" style={{ color: ok ? "var(--c-sub)" : "var(--c-dang)" }}>
            체크 {on}개{on < BRIEF_MIN ? ` · ${BRIEF_MIN}개 이상 체크해야 저장할 수 있습니다` : blank ? " · 체크한 항목의 질의문을 입력하세요" : ""}
          </span>
          <button className="btn pri" disabled={!ok || busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
        {askReset && (
          <div className="notice warn row" style={{ marginTop: 12 }} role="alertdialog" aria-label="기본 항목으로 되돌리기">
            <span className="sp">시스템에 입력된 기본 질문과 순서로 되돌릴까요? 직접 추가한 항목은 지워집니다. (저장을 눌러야 반영됩니다)</span>
            <button className="btn sm" onClick={() => setAskReset(false)}>취소</button>
            <button className="btn sm pri" onClick={() => { setItems(BRIEF_DEFAULT); setAskReset(false); }}>되돌리기</button>
          </div>
        )}
      </div>
    </div>
  );
}
