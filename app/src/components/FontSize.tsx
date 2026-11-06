"use client";
import { useEffect, useId, useState } from "react";
import "./fontSize.css";
import { applyScale, DEFAULT_SCALE, FONT_SCALES, readScaleKey, saveScaleKey } from "@/lib/fontScale";

/** 남겨 둔 글자 크기를 화면이 뜰 때 먹인다(로그인 화면 포함 — 개발서버 bootFontScale) */
export function FontBoot() {
  useEffect(() => applyScale(readScaleKey()), []);
  return null;
}

/**
 * 글자 크기 (Figma 102004, UFR-008 접근성) — 개발서버 FontSizeModal(kjw 998facb) 그대로.
 * 머리줄 단추 → 창(다섯 단계 라디오). 고르면 그 자리에서 바뀐다(적용 단추 없음), 아래는 [초기화](보통)와 [닫기](되돌리지 않음).
 */
export default function FontSize() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="hbtn" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="글자 크기">가 글자 크기</button>
      {open && <FontSizeModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function FontSizeModal({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [picked, setPicked] = useState(() => readScaleKey());
  const choose = (key: string) => {
    setPicked(key);
    applyScale(key);
    saveScaleKey(key);
  };
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="글자 크기 설정" onKeyDown={(e) => e.key === "Escape" && onClose()} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal font-modal" style={{ width: 400 }}>
        <div className="modal-h"><h2>글자 크기 설정</h2></div>
        <div className="font-scales" role="radiogroup" aria-label="글자 크기">
          {FONT_SCALES.map((s) => (
            <label key={s.key} className="font-scale" htmlFor={`${id}-${s.key}`}>
              <input type="radio" name={`${id}-scale`} id={`${id}-${s.key}`} checked={picked === s.key} onChange={() => choose(s.key)} />
              {s.label}
              <span className="sr-only">{` ${s.percent}%`}</span>
            </label>
          ))}
        </div>
        <div className="modal-f">
          <span className="sp" />
          <button type="button" className="btn" onClick={() => choose(DEFAULT_SCALE)}>초기화</button>
          <button type="button" className="btn primary" onClick={onClose} autoFocus>닫기</button>
        </div>
      </div>
    </div>
  );
}
