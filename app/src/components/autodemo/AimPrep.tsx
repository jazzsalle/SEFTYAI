"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { AimView } from "@/lib/aiMode";

export interface AimPinRow {
  id: string;
  title: string;
  at: string | null;
  pending: { id: string; state: string } | null;
  view: AimView | null;
}

/** 자동 시연 AI 모드 장면의 받아 둔 점검 목록(GET /api/autodemo/aim) */
export const loadAimPins = () => api<{ items: AimPinRow[] }>("/api/autodemo/aim").then((r) => r.items);

/**
 * 자동 시연 막대 아래 — AI 모드 장면(가상 특보 점검)의 받아 둔 답이 없을 때 운영자가 받아 두는 자리(R54).
 * 개발서버는 시연 질문 받기(DemoPinController)로 받는다. 운영자가 아니면 보이지 않는다(받는 데 상류 호출이 든다)
 */
export default function AimPrep() {
  const s = useSession();
  const [rows, setRows] = useState<AimPinRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const op = s.account?.role === "운영자";
  const load = useCallback(() => {
    loadAimPins().then(setRows, () => setRows(null));
  }, []);
  useEffect(() => {
    if (op) load();
  }, [op, load]);
  const moving = !!rows?.some((r) => r.pending);
  useEffect(() => {
    if (!moving) return;
    const t = window.setTimeout(load, 5000);
    return () => window.clearTimeout(t);
  }, [moving, rows, load]);
  if (!op || !rows) return null;
  const missing = rows.filter((r) => !r.view);
  if (!missing.length) return null;
  const receive = async () => {
    setBusy(true);
    try {
      for (const r of missing) if (!r.pending) await api("/api/autodemo/aim", { method: "POST", json: { id: r.id } });
      load();
    } catch (e) {
      s.toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <p className="autodemo-skip">
      AI 모드 장면 받아 둔 답 없음 {missing.length}건{moving ? " · 받는 중" : ""}{" "}
      <button type="button" className="autodemo-icon" style={{ width: "auto", padding: "0 8px" }} disabled={busy || moving} onClick={() => void receive()}>
        받아 두기
      </button>
    </p>
  );
}
