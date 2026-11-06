"use client";
import "./composer.css";
import { useEffect, useRef, useState } from "react";
import { useSession, type Cond } from "@/lib/session";
import { DISASTER_TYPES } from "@/lib/config";
import { baseName } from "@/lib/baseRegion";
import { useBriefItems, type BriefingItem } from "@/lib/briefing";
import { COND_ITEMS } from "@/lib/library";
import { IcChevR } from "@/components/Icons";
import { openBriefingSettings } from "@/components/briefing/BriefingSettingsModal";

/** 질문 칸에 글을 넣는다(보내지 않음) — 시작 화면 브리핑 타일(개발서버 StartGuide onPick) */
export const FILL_QUERY_EVENT = "sa:fill-query";
export const fillQuery = (q: string) => window.dispatchEvent(new CustomEvent(FILL_QUERY_EVENT, { detail: { q } }));
import type { DisasterType } from "@/lib/contract/agent";

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
  const nCond = (c.conditions?.length ?? 0) + (c.warningKind ? 1 : 0) + (c.keywords?.length ?? 0);
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

/** 수치 칸 — 질문별 조건 프리셋(lib/library)과 같은 항목·이름·단위 */
const ITEMS = COND_ITEMS;

/** 재난상황 조건 편집 (Figma 201003) — 입력한 값만 query_context 로 보낸다 */
function CondModal({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const [d, setD] = useState<Cond>(s.cond);
  // 키워드는 입력한 글자 그대로 두고 [적용] 때 나눈다(입력 중 쉼표·공백이 지워지지 않게)
  const [kw, setKw] = useState((s.cond.keywords ?? []).join(", "));
  const val = (it: string) => d.conditions?.find((x) => x.item === it)?.value;
  const setVal = (it: string, v: string) => {
    const meta = ITEMS.find((x) => x.item === it)!;
    const rest = (d.conditions ?? []).filter((x) => x.item !== it);
    setD({ ...d, conditions: v === "" ? rest : [...rest, { item: it, label: meta.label, value: Number(v), unit: meta.unit }] });
  };
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="재난상황 조건 편집">
      <div className="modal" style={{ width: 640 }}>
        <div className="modal-h"><b>재난상황 조건</b><span className="sp" /><button className="lnk" onClick={onClose} aria-label="닫기">×</button></div>
        {/* 시연 시나리오를 켠 시연 계정(R45)은 상단 특보 줄이 기상청이 아니라 시나리오 특보 */}
        <p className="xs muted">입력한 조건만 질의에 함께 보냅니다. 비워 두면 보내지 않습니다. {s.weather?.realtimeCut ? "특보는 상단 특보 줄을 쓰세요." : "실시간 특보는 상단 기상특보(기상청)를 쓰세요."}</p>
        <div className="form-grid">
          <label>재난유형
            <select value={d.disasterType ?? "전체"} onChange={(e) => setD({ ...d, disasterType: e.target.value as DisasterType })}>
              {DISASTER_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>기준시각 <input type="datetime-local" value={d.referenceTime?.slice(0, 16) ?? ""} onChange={(e) => setD({ ...d, referenceTime: e.target.value ? `${e.target.value}:00+09:00` : undefined })} /></label>
          <label>발생기간 시작 <input type="date" value={d.periodFrom ?? ""} onChange={(e) => setD({ ...d, periodFrom: e.target.value || undefined })} /></label>
          <label>발생기간 끝 <input type="date" value={d.periodTo ?? ""} onChange={(e) => setD({ ...d, periodTo: e.target.value || undefined })} /></label>
          <label>특보 종류(입력) <input value={d.warningKind ?? ""} placeholder="예: 호우" onChange={(e) => setD({ ...d, warningKind: e.target.value || undefined })} /></label>
          <label>특보 단계(입력)
            <select value={d.warningLevel ?? ""} onChange={(e) => setD({ ...d, warningLevel: e.target.value || undefined })}>
              <option value="">선택 안 함</option><option>주의보</option><option>경보</option>
            </select>
          </label>
          {ITEMS.map((it) => (
            <label key={it.item}>{it.label}({it.unit}) <input type="number" min={0} step="any" value={val(it.item) ?? ""} onChange={(e) => setVal(it.item, e.target.value)} /></label>
          ))}
          <label style={{ gridColumn: "1 / -1" }}>피해·통제 키워드(쉼표로 구분)
            <input value={kw} onChange={(e) => setKw(e.target.value)} />
          </label>
        </div>
        <div className="modal-f">
          <button className="btn" onClick={() => { setKw(""); setD({ ...d, disasterType: undefined, referenceTime: undefined, periodFrom: undefined, periodTo: undefined, warningKind: undefined, warningLevel: undefined, keywords: undefined, conditions: undefined }); }}>조건 비우기</button>
          <span className="sp" />
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={() => {
            const keywords = kw.split(",").map((x) => x.trim()).filter(Boolean);
            // 지역은 그대로 두고 조건 칸은 모두 이 값으로 바꾼다(비운 칸은 undefined 로 — 이전 값이 남지 않게)
            s.setCond({ disasterType: d.disasterType, referenceTime: d.referenceTime, periodFrom: d.periodFrom, periodTo: d.periodTo, warningKind: d.warningKind, warningLevel: d.warningLevel, keywords: keywords.length ? keywords : undefined, conditions: d.conditions?.length ? d.conditions : undefined });
            onClose();
          }}>적용</button>
        </div>
      </div>
    </div>
  );
}
