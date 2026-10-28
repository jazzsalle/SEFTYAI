"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession, uid } from "@/lib/session";
import { REGIONS } from "@/lib/config";
import { activeAdvisories, advLabel, warningsPayload } from "@/lib/wxref";
import { usePathname, useRouter } from "next/navigation";
import { RawFoot } from "../answer/AnswerCard";
import { statusKo } from "@/lib/labels";
import { isActive, STATE_LABEL, type T3qRef } from "@/lib/jobTypes";
import { AnswerMarkdown } from "../answer/Markdown";
import { BRIEF_AIM_COUNT, useBriefItems } from "@/lib/briefing";

/**
 * AI 모드 · 상황 감지 (Figma 202001, R6) — 켜면 즉시 1회, 이후 이 화면이 열려 있는 동안 10분마다 T3Q 에 점검 질의(AI_MODE).
 * 특보는 기상청 실시간 원문을 weather_warnings 로 그대로 보낸다(없으면 빈 목록 — 꾸미지 않음). 점검 답은 무가공으로 보인다.
 * 특보가 바뀌면 바로 다시 점검한다. 모달은 접어서 띠로 둘 수 있다.
 */
const INTERVAL_MIN = 10;
const AIM_Q = (region: string) => `${region}의 현재 기상특보 상황을 점검하고, 담당자가 지금 먼저 확인해야 할 대상과 부족한 정보를 알려주세요.`;

export default function AiModeModal() {
  const s = useSession();
  const sRef = useRef(s);
  sRef.current = s; // 점검 때 최신 조건·특보·제출 함수를 쓴다(오래된 값으로 보내지 않게)
  const router = useRouter();
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [pg, setPg] = useState(0);
  const brief = useBriefItems();
  const sentKey = useRef<string>("");
  const region = s.cond.region;
  const regionName = region === "national" ? "전국" : REGIONS[region].name;
  const advs = useMemo(() => activeAdvisories(s.weather, region), [s.weather, region]);
  const warnKey = advs.map((a) => `${a.id}:${a.level}:${a.status}`).join("|");

  const check = useCallback(
    async (trigger: "START" | "INTERVAL" | "WARNING_CHANGE" | "MANUAL") => {
      const cur = sRef.current;
      if (cur.cond.region === "national") return;
      try {
        const job = await cur.submit({
          question: AIM_Q(regionName),
          source: "AI_MODE",
          aiMode: { check_id: uid("CHK-"), trigger, interval_min: INTERVAL_MIN },
          // 사용자가 직접 [지금 다시 점검] 하면 10분 캐시를 쓰지 않고 새로 묻는다
          noCache: trigger === "MANUAL",
          warnings: warningsPayload(cur.weather, activeAdvisories(cur.weather, cur.cond.region)),
        });
        setJobId(job.id);
        setLastAt(new Date().toISOString());
      } catch (e) {
        cur.toast((e as Error).message);
      }
    },
    [regionName],
  );

  // 처음 · 특보 변화 · 10분 주기
  useEffect(() => {
    if (!s.weather) return;
    const key = `${region}|${warnKey}`;
    if (sentKey.current === key) return;
    const first = sentKey.current === "";
    sentKey.current = key;
    check(first ? "START" : "WARNING_CHANGE");
  }, [s.weather, region, warnKey, check]);
  useEffect(() => {
    const t = setInterval(() => check("INTERVAL"), INTERVAL_MIN * 60_000);
    return () => clearInterval(t);
  }, [check]);

  const job = jobId ? s.jobs[jobId] : null;
  const full = jobId ? s.full[jobId] : undefined;
  useEffect(() => {
    if (job && !isActive(job.state) && !full) s.loadFull(job.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, job?.state]);
  const answer = full?.raw?.result?.answer ?? null;
  const next = lastAt ? new Date(new Date(lastAt).getTime() + INTERVAL_MIN * 60_000) : null;
  const hm = (d: Date | string) => new Date(d).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const a = advs[pg % Math.max(1, advs.length)];

  if (collapsed)
    return (
      <button className="aim-strip" onClick={() => setCollapsed(false)}>
        AI 모드 실행 중 · {advs.length ? advs.map(advLabel).join(" · ") : "발효 특보 없음"} · {job && isActive(job.state) ? "점검 중…" : lastAt ? `마지막 점검 ${hm(lastAt)}` : ""} — 펼치기
      </button>
    );

  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label="AI 모드 상황 감지">
      <div className="modal aim" style={{ width: 760 }}>
        <div className="modal-h">
          <h2>AI 모드 · 상황 감지</h2>
          <span className="sp" />
          <button className="lnk" onClick={() => setCollapsed(true)} aria-label="접기">접기</button>
        </div>
        <div className="xs muted">
          {job && isActive(job.state) ? <><span className="ai-dot spin" /> 점검 중</> : null} {lastAt ? `마지막 점검 ${hm(lastAt)}` : ""} {next ? `· 다음 점검 ${hm(next)}` : ""} · 이 화면이 열려 있는 동안 {INTERVAL_MIN}분마다 점검
        </div>
        {region === "national" ? (
          <div className="notice" style={{ marginTop: 12 }}>AI 모드는 지역 기준으로 점검합니다. 상단에서 기준지역을 고르세요.</div>
        ) : (
          <div className={`aim-card ${a ? (a.level === "경보" ? "danger" : "warn") : "calm"}`}>
            <div className="row">
              {a ? (
                <>
                  <b style={{ fontSize: 24 }}>{advLabel(a)}</b>
                  {a.isNew && <span className="badge danger">새 특보</span>}
                  <span className="sp" />
                  {advs.length > 1 && (
                    <span className="pager">
                      <button className="btn xs" onClick={() => setPg((p) => (p + advs.length - 1) % advs.length)} aria-label="이전 특보">‹</button>
                      <span className="xs">{(pg % advs.length) + 1} / {advs.length}</span>
                      <button className="btn xs" onClick={() => setPg((p) => (p + 1) % advs.length)} aria-label="다음 특보">›</button>
                    </span>
                  )}
                </>
              ) : (
                <b style={{ fontSize: 20 }}>{s.weather && !s.weather.status.ok ? "기상특보 조회 실패" : `${regionName} 발효 특보 없음`}</b>
              )}
            </div>
            {a && <div className="xs muted">{a.area} · {new Date(a.issuedAt).toLocaleString("ko-KR")} 발표 · 기상청</div>}
            <div className="aim-ai">
              <div className="xs b" style={{ color: "#bd2c0f" }}>AI 안내</div>
              {answer ? (
                <AnswerMarkdown text={answer} refs={(full?.raw?.result?.refs ?? []) as T3qRef[]} />
              ) : job && isActive(job.state) ? (
                <div className="s muted">점검 질의에 답을 기다리는 중입니다(보통 1~3분).</div>
              ) : job && job.state === "DONE" && !full ? (
                <div className="s muted">점검 답을 불러오는 중입니다.</div>
              ) : job ? (
                <div className="s muted">점검 답을 받지 못했습니다({full?.raw ? statusKo(full.raw.status) : STATE_LABEL[job.state]}).</div>
              ) : (
                <div className="s muted">점검을 준비하고 있습니다.</div>
              )}
              {/* 경고·정보 부족·한계·데이터 기준시각 — 응답 원문 그대로 */}
              {full?.raw && <RawFoot raw={full.raw} />}
              {full?.raw?.meta?.base_time && <div className="xs muted" style={{ marginTop: 4 }}>데이터 기준 {full.raw.meta.base_time}</div>}
            </div>
          </div>
        )}
        <p className="xs muted">최종 판단은 담당자가 합니다.</p>
        {region !== "national" && (
          <>
            <div className="start-brief" style={{ boxShadow: "none", background: "var(--c-sec-sub)", padding: "16px 20px" }}>
              <div>
                <b>브리핑 세트</b>
              </div>
              <button className="btn" onClick={() => { setCollapsed(true); if (path?.startsWith("/explore")) window.dispatchEvent(new CustomEvent("sa:briefing")); else router.push("/explore?brief=1"); }}>브리핑 시작 ›</button>
            </div>
            <div className="start-tiles" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              {brief.slice(0, BRIEF_AIM_COUNT).map((b) => (
                <button key={b.key} className="tile" style={{ boxShadow: "none", background: "var(--c-surface)" }}
                  onClick={() => { setCollapsed(true); if (path?.startsWith("/explore")) window.dispatchEvent(new CustomEvent("sa:ask-brief", { detail: { q: b.q, preset: b.preset } })); else router.push(`/explore?bq=${encodeURIComponent(b.q)}${b.preset ? `&bp=${encodeURIComponent(b.preset)}` : ""}`); }}>
                  <span className="tile-k">{b.label} ›</span>
                  <span className="tile-q">{b.q.replaceAll("{지역}", regionName)}</span>
                </button>
              ))}
            </div>
            <p className="xs muted">누르면 이 창을 접고, 발효 중인 특보 기준으로 새 대화에서 질의합니다.</p>
          </>
        )}
        <div className="modal-f">
          <button className="btn" onClick={() => check("MANUAL")} disabled={!!job && isActive(job.state)}>지금 다시 점검</button>
          <span className="sp" />
          <button className="btn" onClick={() => s.setAimOn(false)}>AI 모드 종료</button>
          <button className="btn primary" onClick={() => setCollapsed(true)}>확인</button>
        </div>
      </div>
    </div>
  );
}
