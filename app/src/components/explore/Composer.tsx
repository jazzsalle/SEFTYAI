"use client";
import { useState } from "react";
import { useSession, type Cond } from "@/lib/session";
import { DISASTER_TYPES } from "@/lib/config";
import type { DisasterType } from "@/lib/contract/agent";

/**
 * 질의 입력 (Figma 201001 하단 · 201003 조건 편집) — 적용 조건 요약 · 입력 2,000자 · [브리핑 세트▾] · [질의]
 * 보낸 뒤 바로 비워 다음 질문을 이어서 보낼 수 있다(비차단, R2).
 */
export default function Composer({ onAsk, onBriefing, onLibrary, followUpLabel, clearFollowUp }: {
  onAsk: (q: string) => Promise<void>;
  onBriefing: () => void;
  onLibrary: () => void;
  followUpLabel?: string | null;
  clearFollowUp?: () => void;
}) {
  const s = useSession();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [condOpen, setCondOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const c = s.cond;
  const send = async () => {
    const t = q.trim();
    if (!t || busy) return;
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
      <textarea
        className="cmp-input"
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
        <div className="dd">
          <button className="btn sm" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>브리핑 세트 ▾</button>
          {menu && (
            <div className="dd-menu" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => { setMenu(false); onBriefing(); }}>현재 상황 브리핑 시작</button>
              <a href="/settings/briefing">브리핑 항목 설정</a>
            </div>
          )}
        </div>
        <button className="btn sm ghost" onClick={onLibrary}>질문 목록 보기</button>
        <span className="sp" />
        <span className="xs muted">{q.length.toLocaleString()} / 2,000</span>
        <button className="btn primary" disabled={!q.trim() || busy} onClick={send}>질의</button>
      </div>
      {condOpen && <CondModal onClose={() => setCondOpen(false)} />}
    </div>
  );
}

const ITEMS = [
  { item: "RAIN_1H", label: "1시간 강우", unit: "mm" },
  { item: "RAIN_3H", label: "3시간 누적 강우", unit: "mm" },
  { item: "RAIN_24H", label: "24시간 누적 강우", unit: "mm" },
  { item: "WATER_LEVEL", label: "하천 수위", unit: "m" },
  { item: "WIND_SPEED", label: "풍속", unit: "m/s" },
];

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
        <p className="xs muted">입력한 조건만 질의에 함께 보냅니다. 비워 두면 보내지 않습니다. 실시간 특보는 상단 기상특보(기상청)를 쓰세요.</p>
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
