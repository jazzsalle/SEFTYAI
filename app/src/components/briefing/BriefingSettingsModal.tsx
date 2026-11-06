"use client";
/**
 * 브리핑 설정 (SCR-UNE-202004) — 개발서버 BriefingSettingsModal 그대로(R53, 전에는 /settings/briefing 페이지).
 *  · 체크한 항목이 브리핑 세트가 되고, 위에서부터 순서대로 실행한다. 최대 8개 · 4개 이상 체크해야 저장 · 항목명 50자 · 질의문 500자(R51 규칙)
 *  · 고친 내용은 [저장]을 누를 때까지 서버로 가지 않는다 — [기본 항목으로 되돌리기]도 손에 든 목록만 바꾼다
 *  · 항목 줄: 체크 · 이름(「(기본)」) · [위로][아래로][수정] — [수정]이면 그 줄 아래에 항목명·질의문 칸과 [삭제][취소][적용]
 *  · 고친 채로 닫으면 「브리핑 설정을 그만두시겠습니까?」, 저장하면 알림을 보이고 잠시 뒤 닫힌다
 * 여는 길: openBriefingSettings() — 질의 줄 [브리핑 세트▾] 「브리핑 항목 설정」·사용자 메뉴 「브리핑 설정」. 창은 AppShell 의 BriefingSettingsHost 하나
 */
import "./briefingSettings.css";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { BRIEFING_RULES, briefingDefaults, loadBriefing, saveBriefing, type BriefingItem } from "@/lib/briefing";
import { Dialog } from "@/components/account/Dialog";

const OPEN_EVT = "sa:briefing-settings";
const NEW_LABEL = "새 브리핑 항목";

/** 브리핑 설정 창을 연다(어느 화면에서든) */
export const openBriefingSettings = () => window.dispatchEvent(new Event(OPEN_EVT));

/** AppShell 에 한 번 — 여는 요청을 받아 창을 띄운다 */
export function BriefingSettingsHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_EVT, on);
    return () => window.removeEventListener(OPEN_EVT, on);
  }, []);
  return open ? <BriefingSettingsModal onClose={() => setOpen(false)} /> : null;
}

interface Draft {
  label: string;
  question: string;
  labelError: string | null;
  questionError: string | null;
}

const newId = () => (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID().slice(0, 12) : `new-${Date.now().toString(36)}`);

export function BriefingSettingsModal({ onClose }: { onClose: () => void }) {
  const { account } = useSession();
  const R = BRIEFING_RULES;
  const [items, setItems] = useState<BriefingItem[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<"revert" | "leave" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 체크 수가 모자란 채로 [저장]을 눌렀을 때만 알린다 — 열자마자 혼내지 않는다
  const [showCheckedError, setShowCheckedError] = useState(false);

  useEffect(() => {
    let alive = true;
    loadBriefing(account?.id).then((l) => alive && setItems(l));
    return () => {
      alive = false;
    };
  }, [account?.id]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const list = items ?? [];
  const checkedCount = list.filter((x) => x.checked).length;
  const change = (next: BriefingItem[]) => {
    setItems(next);
    setDirty(true);
  };
  const toggle = (id: string) => {
    change(list.map((x) => (x.id === id ? { ...x, checked: !x.checked } : x)));
    setShowCheckedError(false);
  };
  const move = (i: number, step: -1 | 1) => {
    const to = i + step;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[i], next[to]] = [next[to], next[i]];
    change(next);
  };
  const startEdit = (it: BriefingItem) => {
    setEditingId(it.id);
    setDraft({ label: it.label, question: it.question, labelError: null, questionError: null });
  };
  const add = () => {
    if (items === null) return;
    if (list.length >= R.maxItems) return setToast(`브리핑 항목은 최대 ${R.maxItems}건까지 등록할 수 있습니다.`);
    const it: BriefingItem = { id: newId(), label: "", question: "", checked: false, isDefault: false };
    change([...list, it]);
    startEdit(it);
  };
  const apply = () => {
    if (!draft || !editingId) return;
    const label = draft.label.trim(), question = draft.question.trim();
    const labelError = label ? null : "항목명을 입력하세요.";
    const questionError = question ? null : "질의문을 입력하세요.";
    if (labelError || questionError) return setDraft({ ...draft, labelError, questionError });
    change(list.map((x) => (x.id === editingId ? { ...x, label, question } : x)));
    setEditingId(null);
    setDraft(null);
  };
  const cancelEdit = () => {
    // 방금 추가한 빈 항목을 취소한 것이면 그 줄도 같이 거둔다
    const e = list.find((x) => x.id === editingId);
    if (e && !e.label && !e.question) setItems(list.filter((x) => x.id !== editingId));
    setEditingId(null);
    setDraft(null);
  };
  const remove = (id: string) => {
    change(list.filter((x) => x.id !== id));
    setEditingId(null);
    setDraft(null);
  };
  const save = async () => {
    if (items === null) return;
    if (checkedCount < R.minChecked) return setShowCheckedError(true);
    setSaving(true);
    try {
      await saveBriefing(account?.id, list);
      setToast("브리핑 설정을 저장했습니다.");
      setDirty(false);
      // 알림을 읽을 틈을 주고 닫는다
      window.setTimeout(onClose, 900);
    } catch (e) {
      setToast((e as Error).message || "브리핑 설정이 저장되지 않았습니다. 잠시 후 다시 시도하세요.");
      setSaving(false);
    }
  };
  const tryClose = () => (dirty ? setConfirm("leave") : onClose());

  return (
    <>
      <Dialog
        className="bset-dlg"
        title="브리핑 설정"
        desc="체크한 항목이 브리핑 세트가 되고, 위에서부터 순서대로 실행합니다."
        onClose={confirm ? undefined : tryClose}
        footer={
          <>
            <button type="button" className="acm-btn" disabled={items === null} onClick={() => setConfirm("revert")}>기본 항목으로 되돌리기</button>
            <button type="button" className="acm-btn pri" disabled={items === null || saving} onClick={save}>{saving ? "저장 중…" : "저장"}</button>
          </>
        }
      >
        <div className="briefing-set-head">
          <span className="briefing-set-count">{checkedCount}개 선택</span>
          <button type="button" className="briefing-set-add" disabled={items === null} onClick={add}>+ 항목 추가</button>
        </div>
        {items === null ? (
          <p className="briefing-set-loading">브리핑 항목을 불러오는 중입니다…</p>
        ) : (
          <div className="briefing-set-list">
            {showCheckedError && (
              <p className="briefing-set-error" role="alert"><ErrorIcon />브리핑 세트에 넣을 항목을 {R.minChecked}개 이상 고르세요.</p>
            )}
            {list.map((it, i) => {
              const name = it.label || NEW_LABEL;
              return (
                <div className="briefing-set-row" key={it.id}>
                  <div className="briefing-set-line">
                    <label className="briefing-set-check">
                      <input type="checkbox" checked={it.checked} onChange={() => toggle(it.id)} />
                      <span>{name}{it.isDefault && " (기본)"}</span>
                    </label>
                    <span className="briefing-set-actions">
                      <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${name} 위로`}>위로</button>
                      <button type="button" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`${name} 아래로`}>아래로</button>
                      <button type="button" onClick={() => startEdit(it)} aria-label={`${name} 수정`}>수정</button>
                    </span>
                  </div>
                  {editingId === it.id && draft ? (
                    <ItemEditor draft={draft} onChange={setDraft} onApply={apply} onCancel={cancelEdit} onRemove={() => remove(it.id)} />
                  ) : (
                    <p className="briefing-set-question">{it.question || "질의문을 입력하세요"}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Dialog>

      {confirm === "revert" && (
        <Dialog
          size="sm"
          title="기본 항목으로 되돌리시겠습니까?"
          desc={<span className="bset-pre">{"처음 제공된 기본 항목과 순서로 되돌립니다.\n직접 추가한 항목은 지워집니다."}</span>}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button type="button" className="acm-btn" onClick={() => setConfirm(null)}>취소</button>
              <button type="button" className="acm-btn pri" onClick={() => {
                change(briefingDefaults());
                setEditingId(null);
                setDraft(null);
                setShowCheckedError(false);
                setConfirm(null);
              }}>되돌리기</button>
            </>
          }
        />
      )}
      {confirm === "leave" && (
        <Dialog
          size="sm"
          title="브리핑 설정을 그만두시겠습니까?"
          desc="변경한 내용은 저장되지 않습니다."
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button type="button" className="acm-btn" onClick={() => setConfirm(null)}>취소</button>
              <button type="button" className="acm-btn pri" onClick={onClose}>나가기</button>
            </>
          }
        />
      )}
      {toast && <div className="toast bset-toast" role="status">{toast}</div>}
    </>
  );
}

/** 항목 한 줄을 펼쳐 고치는 자리 — 적용하기 전까지 목록은 그대로 */
function ItemEditor({ draft, onChange, onApply, onCancel, onRemove }: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onApply: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const R = BRIEFING_RULES;
  const root = useRef<HTMLDivElement>(null);
  const acts = useRef<HTMLDivElement>(null);
  // 목록이 길면 새로 펼친 편집기가 화면 밖에 생긴다
  useEffect(() => {
    root.current?.scrollIntoView?.({ block: "nearest" });
    root.current?.querySelector("input")?.focus();
  }, []);
  // 오류 줄이 붙으면 [적용]이 아래로 밀려 나간다 — 단추를 다시 끌어온다
  useEffect(() => {
    if (draft.labelError || draft.questionError) acts.current?.scrollIntoView?.({ block: "nearest" });
  }, [draft.labelError, draft.questionError]);
  return (
    <div className="briefing-set-editor" ref={root}>
      <label className="briefing-set-field">
        <span className="briefing-set-field-name">항목명</span>
        <input type="text" className="bset-input" value={draft.label} maxLength={R.maxLabelLength} placeholder="내용을 입력하세요" aria-invalid={draft.labelError !== null}
          onChange={(e) => onChange({ ...draft, label: e.target.value, labelError: null })} />
      </label>
      {draft.labelError && <p className="bset-invalid" role="alert">{draft.labelError}</p>}
      <label className="briefing-set-field">
        <span className="briefing-set-field-name">질의문</span>
        <textarea className="bset-input briefing-set-textarea" value={draft.question} maxLength={R.maxQuestionLength} placeholder="내용을 입력하세요" aria-invalid={draft.questionError !== null}
          onChange={(e) => onChange({ ...draft, question: e.target.value, questionError: null })} />
      </label>
      {draft.questionError && <p className="bset-invalid" role="alert">{draft.questionError}</p>}
      <div className="briefing-set-editor-actions" ref={acts}>
        <button type="button" className="bset-btn" onClick={onRemove}>삭제</button>
        <button type="button" className="bset-btn" onClick={onCancel}>취소</button>
        <button type="button" className="bset-btn apply" onClick={onApply}>적용</button>
      </div>
    </div>
  );
}

function ErrorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8.2" fill="currentColor" />
      <path d="m7.4 7.4 5.2 5.2M12.6 7.4l-5.2 5.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
