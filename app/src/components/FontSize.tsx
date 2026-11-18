"use client";
import { useEffect, useId, useState } from "react";
import "./fontSize.css";
import { Dialog } from "./account/Dialog";
import { applyScale, DEFAULT_SCALE, FONT_SCALES, readScaleKey, saveScaleKey } from "@/lib/fontScale";

/** 남겨 둔 글자 크기를 화면이 뜰 때 먹인다(로그인 화면 포함 — 개발서버 bootFontScale) */
export function FontBoot() {
  useEffect(() => applyScale(readScaleKey()), []);
  return null;
}

/**
 * 글자 크기 (Figma 102004, UFR-008 접근성) — 개발서버 FontSizeModal(kjw 998facb) 그대로.
 * 머리줄 단추 → 창(560, ✕·Esc, 바깥 눌러도 닫히지 않음 — 공통 창 틀 Dialog, 다섯 단계 KRDS 큰 라디오). 고르면 그 자리에서 바뀐다(적용 단추 없음), 아래는 [초기화](보통)와 [닫기](되돌리지 않음).
 */
export default function FontSize() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="hbtn" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="글자 크기"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 3h12M8 3v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>글자 크기</button>
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
    <Dialog
      title="글자 크기 설정"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="acm-btn" onClick={() => choose(DEFAULT_SCALE)}>초기화</button>
          <button type="button" className="acm-btn pri" onClick={onClose}>닫기</button>
        </>
      }
    >
      <div className="font-scales" role="radiogroup" aria-label="글자 크기">
        {FONT_SCALES.map((s) => (
          <div key={s.key} className="font-scale">
            <input type="radio" name={`${id}-scale`} id={`${id}-${s.key}`} checked={picked === s.key} onChange={() => choose(s.key)} />
            {/* 낭독기에는 몇 %인지까지 들려준다. 시안에는 글자만 있다 */}
            <label htmlFor={`${id}-${s.key}`}>
              {s.label}
              <span className="sr-only">{` ${s.percent}%`}</span>
            </label>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
