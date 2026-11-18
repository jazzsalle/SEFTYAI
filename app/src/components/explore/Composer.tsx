"use client";
import "./composer.css";
import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { useBriefItems, type BriefingItem } from "@/lib/briefing";
import CondModal, { useClearMeasuresOnNation } from "./CondModal";
import { formatDate, formatTime, parsePeriod } from "./period";
import { openBriefingSettings } from "@/components/briefing/BriefingSettingsModal";

/** 질문 칸에 글을 넣는다(보내지 않음) — 시작 화면 브리핑 타일(개발서버 StartGuide onPick) */
export const FILL_QUERY_EVENT = "sa:fill-query";
export const fillQuery = (q: string) => window.dispatchEvent(new CustomEvent(FILL_QUERY_EVENT, { detail: { q } }));

/** 시안의 글자 수 한계 — 넘으면 더 입력되지 않는다(개발서버 MaxQuestionLength) */
const MAX_LEN = 2000;

/**
 * 질의 입력 (시안 201000) — 개발서버 QueryBox 그대로.
 * 위에 적용 중인 조건(재난유형 · 발생기간 · 상황 상세정보) 요약, 가운데 질문 칸, 아래 [브리핑 세트] · [질문 모음 보기] · 글자 수 · [질의].
 * 보내면 칸을 바로 비운다(답을 기다리지 않음 — 보낸 질문은 대화에 말풍선으로 남는다). 개별 질문 넷이 다 돌거나 브리핑 세트가 도는 동안은 입력·[질의]를 막는다(askLocked — R57).
 */
export default function Composer({ onAsk, onBriefing, onLibrary, libraryOpen = false, objectRefs = [], onDropRef, expired = false, locked = false, briefDisabled = false }: {
  onAsk: (q: string) => Promise<void>;
  onBriefing: () => void;
  /** [질문 모음 보기] — 서랍을 여닫는다(개발서버 setLibraryOpen(v => !v)) */
  onLibrary: () => void;
  /** 질문 모음이 열려 있는지 — 단추를 눌린 모양으로(개발서버 query-library is-open) */
  libraryOpen?: boolean;
  /** 지도에서 집어 둔 참조 객체(「객체 참조」) — id = 화면 열쇠, name = 받은 이름 */
  objectRefs?: { id: string; name: string }[];
  onDropRef?: (id: string) => void;
  /** 이어서 물을 수 없는 대화(마지막 활동 7일 뒤 — 개발서버 QueryBox expired) — 입력·[질의]를 막고 「이 대화는 만료되었습니다」 */
  expired?: boolean;
  /** 질문을 더 받을 수 없다(개별 질문 넷이 다 돌거나 브리핑 세트가 도는 중 — 개발서버 askLocked). 입력을 막고 단추는 「질의 중…」 */
  locked?: boolean;
  /** [브리핑 세트]를 막는다 — 질문이 하나라도 돌거나 브리핑 세트가 도는 중(개발서버 BriefingSetMenu disabled) */
  briefDisabled?: boolean;
}) {
  const s = useSession();
  const id = useId();
  const [q, setQ] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<{ q?: string }>).detail?.q;
      if (typeof t !== "string") return;
      setQ(t.slice(0, MAX_LEN));
      window.setTimeout(() => input.current?.focus(), 0);
    };
    window.addEventListener(FILL_QUERY_EVENT, on);
    return () => window.removeEventListener(FILL_QUERY_EVENT, on);
  }, []);
  const [condOpen, setCondOpen] = useState(false);
  const c = s.cond;
  // 시안의 단추 이름이 「질의 (입력 전 비활성)」 — 글자가 들어오면 켜진다
  const ready = q.trim().length > 0 && !locked && !expired;
  const send = () => {
    if (!ready) return;
    const t = q.trim();
    // 보낸 질문은 대화에 말풍선으로 남는다. 칸에 또 두면 두 번 보낸 것처럼 보인다(개발서버 — 답을 기다리지 않고 바로 비움)
    setQ("");
    onAsk(t).catch((e: unknown) => s.toast((e as Error).message));
  };
  // 개발서버 detailCount — 특보 종류·단계·키워드·기상수문 값, 채운 것만
  const nCond = (c.conditions?.length ?? 0) + (c.warningKind ? 1 : 0) + (c.warningLevel ? 1 : 0) + (c.keywords?.length ?? 0);
  useClearMeasuresOnNation();
  return (
    <div className="composer">
      <div className="cmp-cond">
        <div className="cmp-cond-list">
          <span className="cond">
            <span className="cond-label">재난유형</span>
            <span className="cond-value">{c.disasterType && c.disasterType !== "전체" ? c.disasterType : "전체"}</span>
          </span>
          <span className="cond-dot" aria-hidden="true">·</span>
          <span className="cond">
            <span className="cond-label">발생기간</span>
            <span className="cond-value">{periodText(c.periodFrom, c.periodTo)}</span>
            {/* 이미 지운 조건에는 × 를 두지 않는다 — 눌러도 아무 일이 없는 단추는 제 조작이 먹히지 않았다고 읽힌다 */}
            {(c.periodFrom || c.periodTo) && <ClearButton what="발생기간" onClick={() => s.setCond({ periodFrom: undefined, periodTo: undefined })} />}
          </span>
          <span className="cond-dot" aria-hidden="true">·</span>
          <span className="cond">
            <span className="cond-label">상황 상세정보</span>
            <span className="cond-value">{nCond}개</span>
            {nCond > 0 && <ClearButton what="상황 상세정보" onClick={() => s.setCond({ conditions: undefined, warningKind: undefined, warningLevel: undefined, keywords: undefined })} />}
          </span>
        </div>
        <button type="button" className="lnk cond-change" onClick={() => setCondOpen(true)}>
          조건 변경
          <CaretRight />
        </button>
      </div>
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
            <WarnIcon /> 이 대화는 만료되었습니다.
          </p>
          <p className="query-expired-sub">새 대화를 시작하세요.</p>
        </div>
      )}
      <label className="sr-only" htmlFor={id}>질문</label>
      <textarea
        id={id}
        ref={input}
        className="cmp-input"
        disabled={locked || expired}
        value={q}
        maxLength={MAX_LEN}
        rows={2}
        placeholder="질문을 입력하세요."
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          // Enter 로 보내고, Shift+Enter 는 줄을 바꾼다
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="cmp-row">
        <BriefSetMenu onBriefing={onBriefing} disabled={briefDisabled} />
        {/* 「질문 목록」은 왼쪽 보낸 질문 목록 이름이다 — 여는 것은 「질문 모음」(개발서버 QueryBox) */}
        <button type="button" className={libraryOpen ? "query-library is-open" : "query-library"} aria-expanded={libraryOpen} onClick={onLibrary}>질문 모음 보기</button>
        <span className="query-count">
          {/* 한 글자마다 읽히면 방해가 되므로 보조기기에는 알리지 않는다 */}
          <span aria-hidden="true">{q.length.toLocaleString()} / {MAX_LEN.toLocaleString()}</span>
        </span>
        <button type="button" className="btn primary query-submit" disabled={!ready} onClick={send}>{locked ? "질의 중…" : "질의"}</button>
      </div>
      {condOpen && <CondModal onClose={() => setCondOpen(false)} />}
    </div>
  );
}

/**
 * 발생기간 표기 — 시안 「2026.07.25 16:00 ~ 08.25 16:00」, 같은 해면 뒤쪽 연도를 줄인다(개발서버 formatRange).
 * 지운 조건도 자리는 지킨다(「제한 없음」) — 줄이 들쭉날쭉하면 무엇이 사라졌는지 알기 어렵다
 */
export function periodText(from?: string | null, to?: string | null): string {
  const f = parsePeriod(from);
  const t = parsePeriod(to);
  if (f === null || t === null) return "제한 없음";
  const tail = f.getFullYear() === t.getFullYear() ? formatDate(t).slice(5) : formatDate(t);
  return `${formatDate(f)} ${formatTime(f)} ~ ${tail} ${formatTime(t)}`;
}

/** 조건 하나를 지우는 × — 이름을 「발생기간 조건 지우기」처럼 풀어 적는다(× 만으로는 읽기 도구가 「닫기」로 읽음) */
function ClearButton({ what, onClick }: { what: string; onClick: () => void }) {
  return (
    <button type="button" className="cond-clear" aria-label={`${what} 조건 지우기`} title={`${what} 조건을 지웁니다`} onClick={onClick}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </button>
  );
}

/**
 * [브리핑 세트] 2단 패널 — 왼쪽: 브리핑 시작·항목 설정, 오른쪽: 내 브리핑 세트 질문 전체(설정에서 체크한 항목, 최대 8개 — 개발서버 BriefingSetMenu).
 * 질문을 누르면 그 질문만 보낸다(시작 화면·AI 모드 타일과 같은 sa:ask-brief). 질의문은 받은 글 그대로. 바깥을 누르거나 Esc 로 닫는다.
 */
function BriefSetMenu({ onBriefing, disabled = false }: { onBriefing: () => void; disabled?: boolean }) {
  const items = useBriefItems();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // 막히면 열린 패널도 닫는다
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const pick = (run: () => void) => {
    setOpen(false);
    run();
  };
  const askOne = (b: BriefingItem) => window.dispatchEvent(new CustomEvent("sa:ask-brief", { detail: { q: b.question } }));
  return (
    <div className="briefing-menu" ref={box}>
      <button type="button" className="briefing-set" disabled={disabled} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="bs-pop">
        브리핑 세트
        <CaretDown />
      </button>
      {open && (
        <div id="bs-pop" className="bs-pop" role="dialog" aria-label="브리핑 세트">
          <div className="bs-act">
            <button type="button" className="bs-start" disabled={!items.length} onClick={() => pick(onBriefing)}>현재 상황 브리핑 시작</button>
            <button type="button" className="bs-set" onClick={() => pick(openBriefingSettings)}>
              브리핑 항목 설정
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m6 4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <div className="bs-list">
            <b className="bs-h">내 브리핑 세트</b>
            {items.length ? (
              <ol>
                {items.map((b, i) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => pick(() => askOne(b))}>
                      <span className="no">{i + 1}</span>
                      <span className="tx">
                        {b.label.trim() && <span className="k">{b.label}</span>}
                        <span className="q">{b.question}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="bs-empty">브리핑 항목이 없습니다. [브리핑 항목 설정]에서 사용할 항목을 고르세요.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 시안의 안내 아이콘 — AI 모드 카드의 「불러오지 못했습니다」와 같은 모양 */
function WarnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path d="M9 2.2 16.4 15H1.6L9 2.2Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9 7v3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9" cy="12.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

function CaretRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m6 4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CaretDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
