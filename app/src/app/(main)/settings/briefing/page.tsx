"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { BRIEFING_RULES, briefingDefaults, loadBriefing, saveBriefing, type BriefingItem } from "@/lib/briefing";

/**
 * 브리핑 설정 (UFR-006-001-05 · 개발서버 BriefingSettingsModal 과 같은 규칙, R51) — 체크한 항목이 브리핑 세트가 되고, 위에서부터 순서대로 실행한다.
 * 최대 8개 · 4개 이상 체크해야 저장 · 항목명 50자 · 질의문 500자. [저장]을 누를 때까지 서버로 가지 않는다(되돌리기도 손에 든 목록만 바꾼다)
 */
export default function BriefingSettings() {
  const { account, toast } = useSession();
  const R = BRIEFING_RULES;
  const [items, setItems] = useState<BriefingItem[]>(briefingDefaults);
  const [askReset, setAskReset] = useState(false);
  const [busy, setBusy] = useState(false);
  // 체크 수가 모자란 채로 [저장]을 눌렀을 때만 알린다 — 열자마자 혼내지 않는다(개발서버와 같게)
  const [showErr, setShowErr] = useState<string | null>(null);
  useEffect(() => {
    loadBriefing(account?.id).then(setItems);
  }, [account?.id]);
  const set = (i: number, p: Partial<BriefingItem>) => {
    setItems((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
    setShowErr(null);
  };
  const mv = (i: number, d: number) => setItems((l) => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  const checked = items.filter((x) => x.checked).length;
  const add = () => {
    if (items.length >= R.maxItems) return toast(`브리핑 항목은 최대 ${R.maxItems}건까지 등록할 수 있습니다.`);
    setItems((l) => [...l, { id: `u${Date.now().toString(36)}`, label: "", question: "", checked: false }]);
  };
  const save = async () => {
    if (busy) return;
    if (checked < R.minChecked) return setShowErr(`브리핑 세트에 넣을 항목을 ${R.minChecked}개 이상 고르세요.`);
    if (items.some((x) => !x.label.trim())) return setShowErr("항목명을 입력하세요.");
    if (items.some((x) => !x.question.trim())) return setShowErr("질의문을 입력하세요.");
    setBusy(true);
    try {
      await saveBriefing(account?.id, items);
      toast("브리핑 설정을 저장했습니다.");
      setItems(await loadBriefing(account?.id));
    } catch (e) {
      toast((e as Error).message || "브리핑 설정이 저장되지 않았습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div className="page-in narrow">
        <div className="ph"><div><h1>브리핑 설정</h1><p>체크한 항목이 브리핑 세트가 되고, 위에서부터 순서대로 실행합니다. 시작 화면 타일에는 등록한 항목이 모두 나오고, [브리핑 시작]·질의 줄 「브리핑 세트」·AI 모드는 체크한 항목을 씁니다. (최대 {R.maxItems}개 · {R.minChecked}개 이상 체크해야 저장 · 계정별 저장) 기준지역·재난상황 조건은 질의와 함께 전달됩니다.</p></div></div>
        <table className="tbl">
          <thead><tr><th style={{ width: 60 }}>사용</th><th style={{ width: 190 }}>항목명</th><th>질의문</th><th style={{ width: 150 }}>순서 · 삭제</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id + i}>
                <td><input type="checkbox" checked={it.checked} aria-label={`${it.label || "새 브리핑 항목"} 사용`} onChange={() => set(i, { checked: !it.checked })} /></td>
                <td>
                  <input className="input sm" value={it.label} maxLength={R.maxLabelLength} aria-label="항목명" placeholder="내용을 입력하세요" onChange={(e) => set(i, { label: e.target.value })} />
                  {it.isDefault && <span className="xs muted"> (기본)</span>}
                </td>
                <td><input className="input sm" style={{ width: "100%" }} value={it.question} maxLength={R.maxQuestionLength} aria-label="질의문" placeholder="내용을 입력하세요" onChange={(e) => set(i, { question: e.target.value })} /></td>
                <td><button className="btn xs" disabled={i === 0} onClick={() => mv(i, -1)} aria-label="위로">▲</button> <button className="btn xs" disabled={i === items.length - 1} onClick={() => mv(i, 1)} aria-label="아래로">▼</button> <button className="btn xs ghost" aria-label={`${it.label || "새 브리핑 항목"} 삭제`} title="삭제" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn sm" onClick={add}>+ 항목 추가</button>
          <button className="btn sm ghost" onClick={() => setAskReset(true)}>기본 항목으로 되돌리기</button>
          <span className="sp" />
          <span className="xs" style={{ color: showErr ? "var(--c-dang)" : "var(--c-sub)" }} role={showErr ? "alert" : undefined}>{showErr ?? `${checked}개 선택`}</span>
          <button className="btn pri" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
        {askReset && (
          <div className="notice warn row" style={{ marginTop: 12 }} role="alertdialog" aria-label="기본 항목으로 되돌리기">
            <span className="sp">기본 항목으로 되돌리시겠습니까? 처음 제공된 기본 항목과 순서로 되돌립니다. 직접 추가한 항목은 지워집니다. (저장을 눌러야 반영됩니다)</span>
            <button className="btn sm" onClick={() => setAskReset(false)}>취소</button>
            <button className="btn sm pri" onClick={() => { setItems(briefingDefaults()); setShowErr(null); setAskReset(false); }}>되돌리기</button>
          </div>
        )}
      </div>
    </div>
  );
}
