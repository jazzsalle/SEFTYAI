"use client";
/**
 * 잠깐 떴다 사라지는 알림(시안 202004 의 토스트) — 개발서버 shared/components/Toast 그대로(R64, 개발서버 7f428c4)
 * 일이 끝났다는 말은 화면을 가리지 않고 지나가야 한다. 사용자의 결정이 필요한 것은 토스트로 알리지 않는다(읽기 전에 사라진다).
 * 화면 표출·보조기기 알림은 KRDS Toast(@une-front/krds)가 맡는다 — 그리는 곳은 ToastHost(app/layout)의 ToastProvider.
 * 이 컴포넌트는 띄우고 치우는 일만 한다.
 */
import { useEffect, useRef } from "react";
import { ToastProvider, useToast } from "@une-front/krds/portable/toast";

interface ToastProps {
  message: string;
  /** 스스로 사라질 때까지(ms). */
  durationMs?: number;
  onDone: () => void;
}

export function Toast({ message, durationMs = 3000, onDone }: ToastProps) {
  // onDone 이 렌더마다 새 함수여도 타이머가 다시 걸리지 않게 한다.
  const latest = useRef(onDone);
  useEffect(() => {
    latest.current = onDone;
  });

  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });

  useEffect(() => {
    const id = toastRef.current.show({ message, duration: durationMs });
    const timer = window.setTimeout(() => latest.current(), durationMs);
    return () => {
      window.clearTimeout(timer);
      toastRef.current.dismiss(id);
    };
  }, [message, durationMs]);

  return null;
}

/** 화면 아래 가운데에 토스트를 그리는 자리(개발서버 main.tsx ToastProvider position="bottom-center") */
export function ToastHost({ children }: { children: React.ReactNode }) {
  return <ToastProvider position="bottom-center">{children}</ToastProvider>;
}
