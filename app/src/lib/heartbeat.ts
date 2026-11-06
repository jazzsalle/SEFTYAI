"use client";
/**
 * 접속 자취 — 개발서버 useHeartbeat·tabSession(leaving)·sessionTakenOver 를 옮긴 것.
 *  · 로그인한 화면은 주기적으로 /api/auth/ping 을 두드려 「아직 보고 있다」를 남긴다. 서버는 이 자취로 「다른 곳에서 접속 중」을 가린다
 *    (자취가 2분 안에 있어야 접속 중 — 창을 닫은 자리를 접속 중으로 붙들지 않는다)
 *  · 두드림이 「끝났다」를 듣는 귀이기도 하다 — 401 이면 까닭(code)을 보고 다른 곳의 로그인(taken)·만료(expired)를 가른다
 *  · 창이 닫히면(pagehide) /api/auth/leaving 으로 자취를 늙혀 두고, 같은 브라우저의 다른 창은 그 자리에서 한 번 더 두드린다
 *  · 살아 있으면 끝나는 시각(expiresAt)을 함께 받는다 — 다른 창에서 [시간 연장]을 눌러도 이 창의 「로그아웃까지 남은 시간」이 따라간다(R57)
 *  · 간격: 개발서버는 5초. SEFTYAI 는 Vercel 함수 호출 수 때문에 20초(서버가 2분 창 안에 여섯 번 찍힌다) — docs/devserver-sync 기록
 */
import { useEffect, useRef } from "react";

export const BEAT_MS = 20_000;
export const TAKEN_OVER = "AUTH_SESSION_TAKEN_OVER";
export const SESSION_EXISTS = "AUTH_SESSION_EXISTS";

type Reason = "ok" | "taken" | "expired" | "unknown";

/** 한 번 두드린다 — 살아 있으면 ok(+ 끝나는 시각), 끊겼으면 까닭. 네트워크 실패는 unknown(끊었다고 단정하지 않음) */
export async function ping(): Promise<{ reason: Reason; expiresAt?: string }> {
  try {
    const r = await fetch("/api/auth/ping", { method: "POST", credentials: "same-origin", cache: "no-store" });
    const b = (await r.json().catch(() => ({}))) as { code?: string; expiresAt?: string };
    if (r.ok) return { reason: "ok", expiresAt: typeof b.expiresAt === "string" ? b.expiresAt : undefined };
    if (r.status !== 401) return { reason: "unknown" };
    return { reason: b.code === TAKEN_OVER ? "taken" : "expired" };
  } catch {
    return { reason: "unknown" };
  }
}

/** 401 을 받은 뒤 까닭 묻기 — 모르면 만료로 */
export async function endReason(): Promise<"taken" | "expired"> {
  const r = await ping();
  return r.reason === "taken" ? "taken" : "expired";
}

const CHANNEL = "sa.auth";
function channel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

export function useHeartbeat(enabled: boolean, onTaken: () => void, onExpired: () => void, onAlive?: (expiresAt: string) => void) {
  const cb = useRef({ onTaken, onExpired, onAlive });
  cb.current = { onTaken, onExpired, onAlive };
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const beat = () =>
      void ping().then((r) => {
        if (!alive) return;
        if (r.reason === "taken") cb.current.onTaken();
        else if (r.reason === "expired") cb.current.onExpired();
        else if (r.reason === "ok" && r.expiresAt) cb.current.onAlive?.(r.expiresAt);
      });
    beat();
    const t = window.setInterval(beat, BEAT_MS);
    const bus = channel();
    const onMsg = (e: MessageEvent<{ kind?: string }>) => e.data?.kind === "leaving" && beat();
    bus?.addEventListener("message", onMsg);
    // 창이 닫힌다 — 접속은 두고 자취만 늙힌다(새로고침이면 새 화면이 곧 다시 두드린다)
    const onHide = () => {
      try {
        navigator.sendBeacon?.("/api/auth/leaving");
      } catch {
        /* 보내지 못해도 자취는 2분 뒤 저절로 늙는다 */
      }
      bus?.postMessage({ kind: "leaving" });
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener("pagehide", onHide);
      bus?.removeEventListener("message", onMsg);
      bus?.close();
    };
  }, [enabled]);
}
