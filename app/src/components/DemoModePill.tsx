"use client";
/**
 * 머리줄 「시연 모드」 단추 — 개발서버 DemoModeButton 그대로(2026-11-19 「개발서버와 동일하게」).
 * 켜 둔 동안만 받아 둔 답·조회 응답을 쓴다(한눈 요약 질의·브리핑 등). 평소에는 늘 새로 받는다.
 * 로그인한 누구나 켜고 끈다. 켠 뒤 48시간이 지나면 서버가 저절로 끈다. 끌 때는 확인을 묻는다.
 * 1분마다 다시 읽어, 내가 끄지 않았는데 꺼졌으면 알린다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Dialog } from "./account/Dialog";

interface View { on: boolean; remainingSeconds: number }

const left = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")} 남음`;

export default function DemoModePill() {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [lost, setLost] = useState(false);
  const wasOn = useRef<boolean | null>(null);
  const selfOff = useRef(false);

  const apply = useCallback((next: View) => {
    if (wasOn.current === true && !next.on && !selfOff.current) setLost(true);
    selfOff.current = false;
    wasOn.current = next.on;
    setView(next);
  }, []);
  const load = useCallback(() => {
    api<View>("/api/demo-mode").then(apply, () => undefined);
  }, [apply]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  const turnOn = async () => {
    setBusy(true);
    try {
      apply(await api<View>("/api/demo-mode?op=on", { method: "POST" }));
      setLost(false);
    } catch {
      /* 다음 회차에 다시 읽는다 */
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setConfirmOff(false);
    setBusy(true);
    selfOff.current = true;
    try {
      apply(await api<View>("/api/demo-mode?op=off", { method: "POST" }));
    } catch {
      selfOff.current = false;
    } finally {
      setBusy(false);
    }
  };

  if (!view) return null;
  return (
    <>
      <button
        type="button"
        className={view.on ? "demo-mode-btn is-on" : "demo-mode-btn"}
        aria-pressed={view.on}
        disabled={busy}
        title={view.on ? "시연 모드 — 조회 응답을 저장해 두고 바로 보여 줍니다. 누르면 끕니다." : "시연 모드 꺼짐 — 조회 응답을 늘 새로 받습니다. 누르면 켭니다(2일 뒤 저절로 꺼짐)."}
        onClick={() => (view.on ? setConfirmOff(true) : void turnOn())}
      >
        {view.on ? `시연 모드 · ${left(view.remainingSeconds)}` : "시연 모드 꺼짐"}
      </button>
      {confirmOff && (
        <Dialog
          title="시연 모드를 끄시겠습니까?"
          desc="시연 담당자에게 확인하고 끄세요."
          size="sm"
          onClose={() => setConfirmOff(false)}
          footer={<>
            <button type="button" className="acm-btn" onClick={() => setConfirmOff(false)}>취소</button>
            <button type="button" className="acm-btn pri" onClick={() => void turnOff()}>끄기</button>
          </>}
        >
          <p className="demo-mode-note">끄면 저장해 둔 조회 응답을 모두 비우고, 모든 사용자에게 꺼집니다.</p>
        </Dialog>
      )}
      {lost && (
        <Dialog
          title="시연 모드가 꺼졌습니다"
          desc="켠 지 2일이 지났거나, 다른 사용자가 껐거나, 서버를 다시 켰습니다."
          size="sm"
          onClose={() => setLost(false)}
          footer={<>
            <button type="button" className="acm-btn" onClick={() => setLost(false)}>닫기</button>
            <button type="button" className="acm-btn pri" disabled={busy} onClick={() => void turnOn()}>다시 켜기</button>
          </>}
        />
      )}
    </>
  );
}
