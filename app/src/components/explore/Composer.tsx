"use client";
import "./composer.css";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { baseName } from "@/lib/baseRegion";
import { useBriefItems, type BriefingItem } from "@/lib/briefing";
import CondModal, { useClearMeasuresOnNation } from "./CondModal";
import { IcChevR } from "@/components/Icons";
import { openBriefingSettings } from "@/components/briefing/BriefingSettingsModal";

/** 질문 칸에 글을 넣는다(보내지 않음) — 시작 화면 브리핑 타일(개발서버 StartGuide onPick) */
export const FILL_QUERY_EVENT = "sa:fill-query";
export const fillQuery = (q: string) => window.dispatchEvent(new CustomEvent(FILL_QUERY_EVENT, { detail: { q } }));

/**
 * 질의 입력 (Figma 201001 하단 · 201003 조건 편집) — 적용 조건 요약 · 입력 2,000자 · [브리핑 세트▾] · [질의]
 * 보낸 뒤 바로 비워 다음 질문을 이어서 보낼 수 있다(비차단, R2).
 */
export default function Composer({ onAsk, onBriefing, onLibrary, followUpLabel, clearFollowUp, objectRefs = [], onDropRef, expired = false }: {
  onAsk: (q: string) => Promise<void>;
  onBriefing: () => void;
  onLibrary: () => void;
  followUpLabel?: string | null;
  clearFollowUp?: () => void;
  /** 지도에서 집어 둔 참조 객체(「객체 참조」) — id = 화면 열쇠, name = 받은 이름 */
  objectRefs?: { id: string; name: string }[];
  onDropRef?: (id: string) => void;
  /** 이어서 물을 수 없는 대화(마지막 활동 24시간 뒤 — 개발서버 QueryBox expired) — 입력·[질의]를 막고 「이 대화는 만료되었습니다」 */
  expired?: boolean;
}) {
  const s = useSession();
  const [q, setQ] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<{ q?: string }>).detail?.q;
      if (typeof t !== "string") return;
      setQ(t.slice(0, 2000));
      window.setTimeout(() => input.current?.focus(), 0);
    };
    window.addEventListener(FILL_QUERY_EVENT, on);
    return () => window.removeEventListener(FILL_QUERY_EVENT, on);
  }, []);
  const [busy, setBusy] = useState(false);
  const [condOpen, setCondOpen] = useState(false);
  const c = s.cond;
  const send = async () => {
    const t = q.trim();
    if (!t || busy || expired) return;
    setBusy(true);
    try {
      await onAsk(t);
      setQ("");
    } catch (e) {
      s.toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // 개발서버 detailCount — 특보 종류·단계·키워드·기상수문 값, 채운 것만
  const nCond = (c.conditions?.length ?? 0) + (c.warningKind ? 1 : 0) + (c.warningLevel ? 1 : 0) + (c.keywords?.length ?? 0);
  useClearMeasuresOnNation();
  return (
    <div className="composer">
      <div className="cmp-cond">
        <span className="xs muted">재난유형</span> <b className="xs">{c.disasterType && c.disasterType !== "전체" ? c.disasterType : "전체"}</b>
        <span className="xs muted"> · 기준시각</span> <b className="xs">{c.referenceTime ? c.referenceTime.replace("T", " ") : "현재"}</b>
        {(c.periodFrom || c.periodTo) && (<><span className="xs muted"> · 발생기간</span> <b className="xs">{c.periodFrom ?? ""} ~ {c.periodTo ?? ""}</b></>)}
        <span className="xs muted"> · 상황 상세정보</span> <b className="xs">{nCond}개</b>
        {nCond > 0 && <span className="badge neutral xs" title="사용자가 직접 입력한 조건입니다(실시간 관측·특보 아님)">사용자 입력 조건</span>}
        <span className="sp" />
        <button className="lnk xs" onClick={() => setCondOpen(true)}>조건 변경 ›</button>
      </div>
      {followUpLabel && (
        <div className="cmp-follow xs">
          <b>이어서 묻기</b> · {followUpLabel}
          <button className="lnk xs" onClick={clearFollowUp}>해제 ×</button>
        </div>
      )}
      {/* 지도에서 집어 둔 객체(개발 서버 QueryBox query-refs) — 질문 칸 바로 위. 엉뚱한 것을 쥔 채 묻지 않게 늘 보이고, 없으면 줄을 내지 않는다 */}
      {objectRefs.length > 0 && (
        <div className="query-refs">
          <span className="query-refs-label">참조 객체 {objectRefs.length}</span>
          <ul className="query-refs-list">
            {objectRefs.map((r) => (
              <li key={r.id} className="query-ref">
                <span className="query-ref-name" title={r.name}>{r.name}</span>
                <button type="button" className="query-ref-drop" aria-label={`${r.name} 참조 해제`} title="참조 해제" onClick={() => onDropRef?.(r.id)}>
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {expired && (
        <div className="query-expired" role="status">
          <p className="query-expired-head">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8.2" fill="currentColor" /><path d="M10 5.6v5.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /><circle cx="10" cy="14.1" r="1.1" fill="#fff" /></svg>
            이 대화는 만료되었습니다.
          </p>
          <p className="query-expired-sub">새 대화를 시작하세요.</p>
        </div>
      )}
      <textarea
        ref={input}
        className="cmp-input"
        disabled={expired}
        value={q}
        maxLength={2000}
        rows={2}
        placeholder="질문을 입력하세요. 답을 기다리는 동안 다른 질문도 이어서 보낼 수 있습니다."
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="cmp-row">
        <BriefSetMenu onBriefing={onBriefing} />
        <button className="btn sm ghost" onClick={onLibrary}>질문 목록 보기</button>
        <span className="sp" />
        <span className="xs muted">{q.length.toLocaleString()} / 2,000</span>
        <button className="btn primary" disabled={!q.trim() || busy || expired} onClick={send}>질의</button>
      </div>
      {condOpen && <CondModal onClose={() => setCondOpen(false)} />}
    </div>
  );
}

/**
 * [브리핑 세트▾] 2단 패널 — 왼쪽: 브리핑 시작·항목 설정, 오른쪽: 내 브리핑 세트 질문 전체(설정에서 체크한 항목, 최대 8개 — 개발서버 BriefingSetMenu).
 * 질문을 누르면 그 질문만 보낸다(시작 화면·AI 모드 타일과 같은 sa:ask-brief). 바깥을 누르거나 Esc 로 닫는다.
 */
function BriefSetMenu({ onBriefing }: { onBriefing: () => void }) {
  const s = useSession();
  const items = useBriefItems();
  const regionName = baseName(s.cond.base);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const askOne = (b: BriefingItem) => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("sa:ask-brief", { detail: { q: b.question } }));
  };
  return (
    <div className="dd" ref={box}>
      <button ref={btn} className="btn sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="bs-pop">브리핑 세트 ▾</button>
      {open && (
        <div id="bs-pop" className="bs-pop" role="dialog" aria-label="브리핑 세트">
          <div className="bs-act">
            <button className="bs-start" disabled={!items.length} onClick={() => { setOpen(false); onBriefing(); }}>현재 상황 브리핑 시작</button>
            <button type="button" className="bs-set" onClick={() => { setOpen(false); openBriefingSettings(); }}>브리핑 항목 설정 <IcChevR size={14} /></button>
          </div>
          <div className="bs-list">
            <b className="bs-h">내 브리핑 세트</b>
            {items.length ? (
              <ol>
                {items.map((b, i) => (
                  <li key={b.id}>
                    <button onClick={() => askOne(b)}>
                      <span className="no">{i + 1}</span>
                      <span className="tx">
                        {b.label.trim() && <span className="k">{b.label}</span>}
                        <span className="q">{b.question.replaceAll("{지역}", regionName)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="bs-empty">브리핑 항목이 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
