"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { baseName, baseWire } from "@/lib/baseRegion";
import { SCN_CUT_LABEL, SCN_LABEL } from "@/lib/scenario";
import { useBriefingSet } from "@/lib/briefing";
import { BRIEFING_RULES } from "@/lib/briefingSet";
import {
  AIM_INTERVAL_MIN, AIM_READ_EVERY_MS, AIM_SLIDE_MS, aimCheckLine, sortAimWarnings,
  type AimResponse, type AimView, type AimWarning,
} from "@/lib/aiMode";
import "./AiModeModal.css";

/** 서버 점검이 도는 동안 결과를 다시 읽는 간격 — 우리는 질의 작업을 읽힐 때 진행시키므로(R1) 개발서버의 「끝날 때까지 기다림」 대신 짧게 읽는다 */
const RUNNING_POLL_MS = 5000;

/**
 * AI 모드 — 사람마다 따로 켜고, 켠 동안 점검 결과를 읽는다(개발서버 useAiMode 복제, R52).
 * 배경 점검 지역(lib/aiMode AIM_GROUPS)은 서버가 지역 공용으로 10분마다 돌고 화면은 2분마다 읽기만,
 * 그 밖의 지역은 켤 때 한 번·그 뒤 10분마다 점검을 건다(특보가 그대로이고 답이 60분 안이면 서버가 상류를 부르지 않음).
 */
function useAiMode() {
  const s = useSession();
  const wire = useMemo(() => baseWire(s.cond.base), [s.cond.base]);
  const [resp, setResp] = useState<AimResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inflight = useRef(false);

  const call = useCallback(
    async (kind: "check" | "read") => {
      if (!wire || inflight.current) return null;
      inflight.current = true;
      setBusy(true);
      try {
        const r =
          kind === "check"
            ? await api<AimResponse>("/api/ai-mode/check", { method: "POST", json: { base: wire } })
            : await api<AimResponse>(`/api/ai-mode?${new URLSearchParams({ code: wire.code, name: wire.name, level: wire.level })}`);
        setResp(r);
        setFailed(false);
        return r;
      } catch {
        // 한 회차를 놓쳐도 다음 회차에 다시 묻는다. 「점검 기록 없음」과 「받아 오지 못함」은 따로 적는다
        setFailed(true);
        return null;
      } finally {
        inflight.current = false;
        setBusy(false);
      }
    },
    [wire],
  );

  // 켤 때 한 번 — 배경 지역은 읽기(서버가 막는다), 그 밖은 점검
  useEffect(() => {
    void call("check");
  }, [call]);

  // 그 뒤 — 서버 점검이 도는 동안은 짧게, 아니면 배경 지역 2분 · 그 밖 10분
  const running = !!resp?.running;
  const managed = !!resp?.managed;
  useEffect(() => {
    if (!resp) return;
    const ms = running ? RUNNING_POLL_MS : managed ? AIM_READ_EVERY_MS : AIM_INTERVAL_MIN * 60_000;
    const t = window.setTimeout(() => void call(running || managed ? "read" : "check"), ms);
    return () => window.clearTimeout(t);
  }, [resp, running, managed, call]);

  return { view: resp?.view ?? null, checking: busy || running, failed };
}

const hm = (v: string | null) => {
  if (!v) return "알 수 없음";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "알 수 없음" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const dateOf = (v: string | null) => {
  if (!v) return "발효시각 미상";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "발효시각 미상";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Tone = "danger" | "caution" | "none";
/** 경보 = danger, 주의보·예비특보 = caution, 특보 없음 = none */
const toneOf = (level: string): Tone => (level === "경보" ? "danger" : "caution");
/** 신호등 안 표시 — 주의보만 「!」(같은 노랑인 예비특보와 가르게) */
const markOf = (level: string) => (level === "주의보" ? "!" : null);

/**
 * AI 모드 · 상황 감지 (SCR-UNE-202001) — 개발서버 AiModeModal 복제(R52). 창은 스스로 점검하지 않고 받아 둔 점검을 보인다.
 * 발효 특보마다 카드 한 장(경보 먼저, 최근 발효 순), 여럿이면 3초마다 저절로 넘김(정지·이전·다음). 카드의 「AI 안내」 = 그 특보만 실어 물은 답 글 그대로.
 * [확인]·✕ 는 창만 닫고 AI 모드는 켜 둔다(머리줄 「AI 모드 실행 중」을 누르면 다시 연다). [AI 모드 종료]는 끈다.
 */
export default function AiModeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSession();
  const router = useRouter();
  const path = usePathname();
  const { view, checking, failed } = useAiMode();
  const set = useBriefingSet();
  const items = set.checked;
  const regionName = baseName(s.cond.base);
  const cut = !!s.weather?.realtimeCut;

  const warnings = useMemo(() => sortAimWarnings(view?.warnings ?? []), [view]);
  const guides = useMemo(() => new Map((view?.guides ?? []).map((g) => [g.warningKey, g.message])), [view]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(true);
  const index = warnings.length === 0 ? 0 : Math.min(at, warnings.length - 1);
  const many = warnings.length > 1;
  useEffect(() => {
    if (!open || !playing || !many) return;
    const id = window.setTimeout(() => setAt((a) => (a + 1) % warnings.length), AIM_SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [open, playing, many, at, warnings.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const state: "loading" | "ready" | "failed" | "empty" = view !== null ? "ready" : checking ? "loading" : failed ? "failed" : "empty";

  const brief = () => {
    onClose();
    if (path?.startsWith("/explore")) window.dispatchEvent(new CustomEvent("sa:briefing"));
    else router.push("/explore?brief=1");
  };
  const askItem = (q: string) => {
    onClose();
    if (path?.startsWith("/explore")) window.dispatchEvent(new CustomEvent("sa:ask-brief", { detail: { q } }));
    else router.push(`/explore?bq=${encodeURIComponent(q)}`);
  };

  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="AI 모드 · 상황 감지" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal aim aimx" style={{ width: 760 }}>
        <div className="modal-h">
          <h2>AI 모드 · 상황 감지</h2>
          <span className="sp" />
          <button className="lnk" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <p className="aimx-when">
          {state === "loading" ? "점검 결과를 불러오는 중입니다" : aimCheckLine(view, hm)}
          {cut && <span className="muted"> · {SCN_CUT_LABEL}</span>}
        </p>

        <div className="aimx-scroll">
          {state === "failed" ? (
            <Card tone="none" title="점검 결과를 불러오지 못했습니다" sub="잠시 뒤 다시 열어 보세요.">
              <div className="aimx-miss" role="status">
                <p className="aimx-miss-h">⚠ AI 안내를 불러오지 못했습니다.</p>
                <p className="aimx-miss-s">특보 정보와 브리핑은 그대로 이용할 수 있습니다.</p>
              </div>
            </Card>
          ) : state === "loading" ? (
            <Card tone="none" title="상황을 확인하는 중" sub="서버가 마지막으로 남긴 점검을 읽고 있습니다." />
          ) : state === "empty" || view === null ? (
            <Card tone="none" title="아직 점검 기록이 없습니다" sub="다음 점검이 끝나면 여기에 상황이 나옵니다." />
          ) : warnings.length === 0 ? (
            <NoWarning view={view} />
          ) : (
            <div className="aimx-slider">
              <div className="aimx-track" style={{ transform: `translateX(-${index * 100}%)` }}>
                {warnings.map((w, i) => (
                  <div key={w.warningKey} className="aimx-slide" aria-hidden={i !== index} inert={i !== index ? true : undefined}>
                    <Card
                      tone={toneOf(w.level)}
                      title={<WarningTitle w={w} />}
                      sub={`${w.areaName} · ${dateOf(w.effectiveDe)} ${w.level.startsWith("예비") ? "발표" : "발생"}`}
                      badge={w.changeType === "신규" ? "새 특보" : null}
                      mark={markOf(w.level)}
                      pager={
                        many ? (
                          <div className="aimx-pager">
                            <button type="button" className="aimx-pg" aria-label={playing ? "자동 넘김 정지" : "자동 넘김 재생"} aria-pressed={!playing} onClick={() => setPlaying((p) => !p)}>
                              {playing ? "❚❚" : "▶"}
                            </button>
                            <button type="button" className="aimx-pg" aria-label="이전 특보" onClick={() => setAt((i - 1 + warnings.length) % warnings.length)}>‹</button>
                            <span className="aimx-pg-at" aria-live="polite"><span className="sr-only">특보 </span>{i + 1} / {warnings.length}</span>
                            <button type="button" className="aimx-pg" aria-label="다음 특보" onClick={() => setAt((i + 1) % warnings.length)}>›</button>
                          </div>
                        ) : null
                      }
                    >
                      <p className={`aimx-label t-${toneOf(w.level)}`}>AI 안내</p>
                      {/* 특보마다 따로 물은 답 그대로(R0). 그 특보 질의만 실패했으면 지어내지 않는다 */}
                      <p className="aimx-guide">{guides.get(w.warningKey) ?? "이 특보에 대한 별도 안내가 없습니다."}</p>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="aimx-note">AI 안내는 과거 사례를 근거로 한 참고 정보이며, 최종 판단은 담당자가 합니다.</p>

          <div className="aimx-brief">
            <div>
              <strong>{BRIEFING_RULES.title}</strong>
              <p>{BRIEFING_RULES.title} {items.length}개 항목을 지금 조건으로 한 번에 정리합니다.</p>
            </div>
            <button type="button" className="btn" onClick={brief} disabled={items.length === 0}>브리핑 시작 ›</button>
          </div>
          <ul className="aimx-tiles">
            {items.map((it) => (
              <li key={it.id}>
                <button type="button" className="aimx-tile" onClick={() => askItem(it.question)}>
                  <span className="aimx-tile-h">{it.label} ›</span>
                  <span className="aimx-tile-q">{it.question.replaceAll("{지역}", regionName)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="aimx-foot">누르면 이 창을 닫고, {warnings.length > 0 ? "발효 중인 특보 기준으로" : "지금 재난상황 조건으로"} 새 대화에서 답합니다.</p>
        </div>

        <div className="modal-f">
          <span className="sp" />
          <button className="btn" onClick={() => { onClose(); s.setAimOn(false); }}>AI 모드 종료</button>
          <button className="btn primary" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  );
}

function NoWarning({ view }: { view: AimView }) {
  const fail = view.collectStatus === "FAILED";
  return (
    <Card tone="none" title={fail ? "특보를 조회하지 못했습니다" : "발효 중인 특보 없음"} sub={`${view.regionName} · ${hm(view.checkedDe)} 점검`}>
      {fail ? (
        <p className="aimx-guide">기상청 조회가 실패해 지금 무엇이 걸려 있는지 알 수 없습니다. 특보가 없는 것과 다릅니다.</p>
      ) : (
        <>
          <p className="aimx-label t-none">AI 안내</p>
          <p className="aimx-guide">{view.noWarningMessage ?? "발효 중인 특보가 없어 별도 안내가 없습니다."}</p>
        </>
      )}
    </Card>
  );
}

function WarningTitle({ w }: { w: AimWarning }) {
  return (
    <>
      {w.kind}
      <em className="aimx-level">{w.level}</em>
      {w.scenario && <span className="scn-tag">{SCN_LABEL}</span>}
    </>
  );
}

function Card({ tone, title, sub, badge, mark, pager, children }: {
  tone: Tone; title: React.ReactNode; sub: string; badge?: string | null; mark?: string | null; pager?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className={`aimx-card t-${tone}`}>
      <div className="aimx-card-h">
        <span className={`aimx-lamp t-${tone}`} aria-hidden="true">{mark && <b>{mark}</b>}</span>
        <div className="aimx-card-n">
          <p className="aimx-card-t">
            {title}
            {badge && <span className="badge danger">{badge}</span>}
          </p>
          <p className="aimx-card-s">{sub}</p>
        </div>
        {pager}
      </div>
      {children && <div className="aimx-card-b">{children}</div>}
    </div>
  );
}
