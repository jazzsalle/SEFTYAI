"use client";
import "./session.css";
import { useEffect, useState } from "react";

/**
 * 사용자 메뉴의 「로그아웃까지 남은 시간」·[시간 연장](개발서버 UserMenu SessionCountdown 그대로 — R57).
 * 보여 주기만 한다 — 0 이 되었을 때 끝내는 판정은 서버가 하고, 화면(lib/session)은 그 순간 서버에 물어 로그인 화면으로 간다.
 * 한 시간이 넘게 남았을 때만 앞에 시를 붙인다(4시간이라 MM:SS 면 «239:59» 가 나온다 — 개발서버 format).
 */
export function SessionCountdown({ expiresAt, onExtend }: { expiresAt: number | null; onExtend: () => Promise<boolean> }) {
  const [left, setLeft] = useState(() => remaining(expiresAt));
  const [extending, setExtending] = useState(false);
  useEffect(() => {
    setLeft(remaining(expiresAt));
    if (expiresAt === null) return;
    const t = window.setInterval(() => setLeft(remaining(expiresAt)), 1000);
    return () => window.clearInterval(t);
  }, [expiresAt]);
  if (expiresAt === null) return null;
  return (
    <div className="user-menu-session">
      <p className="user-menu-session-label">로그아웃까지 남은 시간</p>
      <div className="user-menu-session-row">
        <span className="user-menu-time">
          <ClockIcon />
          {/* 1초마다 바뀌는 값을 매번 읽어 주면 방해가 된다. 남은 시간은 보조기기에 알리지 않는다 */}
          <span aria-hidden="true">{formatLeft(left)}</span>
          <span className="sr-only">{Math.ceil(left / 60000)}분 남음</span>
        </span>
        <button
          type="button"
          className="user-menu-extend"
          disabled={extending}
          onClick={async () => {
            setExtending(true);
            await onExtend();
            setExtending(false);
          }}
        >
          {extending ? "연장 중…" : "시간 연장"}
        </button>
      </div>
    </div>
  );
}

const remaining = (expiresAt: number | null) => (expiresAt === null ? 0 : Math.max(0, expiresAt - Date.now()));

/** 개발서버 UserMenu format — 한 시간 넘게 남으면 H:MM:SS, 그 밖은 MM:SS */
export function formatLeft(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(total % 60)}`;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M8 4.4V8l2.6 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
