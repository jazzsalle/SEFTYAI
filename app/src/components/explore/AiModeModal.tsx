"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession, uid } from "@/lib/session";
import { baseKey, baseName, baseTarget } from "@/lib/baseRegion";
import { activeAdvisories, advLabel, advName, warningsPayload } from "@/lib/wxref";
import { SCN_LABEL } from "@/lib/scenario";
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
 * 특보·점검 지역 = 지금 기준지역(R32, lib/wxMatch). 기준지역이 바뀌면 점검 상태를 비우고 새 지역으로 바로 다시 점검한다. 전국이면 점검하지 않는다.
 * 시연 시나리오 특보(R43)는 창·띠의 특보 이름 옆에 「시연 시나리오」, 점검 질의에는 source 「시연 시나리오(가상 특보)」로 함께 간다(질의 글은 그대로 — R36)
 */
const INTERVAL_MIN = 10;
/**
 * 점검 질의(R36) — 상세 요구사항 정의서 v1.72 UFR-001-001-05 「Agent 질의 내용」을 사용자 지시(2026-10-28)로 줄인 것:
 * 특보마다 「먼저 확인할 내용」 2문장(80자 내외)만, 제목·과거 사례·근거 목록 없이. 특보가 없으면 점검 결과 1문장. 지역은 query_context.region, 특보는 weather_warnings 로 따로 보낸다
 */
const AIM_Q =
  "제공된 기상특보 정보를 기준으로, 해당 지역 담당자가 지금 먼저 확인할 내용을 알려 주십시오. 발효 중인 특보가 있으면 특보마다 2문장 이내(공백 포함 80자 내외)로만 쓰고, 제목·과거 사례·근거 목록은 쓰지 마십시오. 발효 중인 특보가 없으면 대응 검토가 필요한 사유를 확인하지 못했다는 점검 결과만 1문장으로 쓰십시오. 제공되지 않은 관측값이나 피해 발생 여부는 추정하지 마십시오.";

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
  const base = s.cond.base;
  const bk = baseKey(base);
  const national = !base;
  const regionName = baseName(base);
  const target = useMemo(() => baseTarget(base), [base]);
  const advs = useMemo(() => activeAdvisories(s.weather, target), [s.weather, target]);
  const warnKey = advs.map((a) => `${a.id}:${a.level}:${a.status}`).join("|");

  const check = useCallback(
    async (trigger: "START" | "INTERVAL" | "WARNING_CHANGE" | "MANUAL") => {
      const cur = sRef.current;
      if (!cur.cond.base) return;
      try {
        const job = await cur.submit({
          question: AIM_Q,
          source: "AI_MODE",
          aiMode: { check_id: uid("CHK-"), trigger, interval_min: INTERVAL_MIN },
          // 사용자가 직접 [지금 다시 점검] 하면 10분 캐시를 쓰지 않고 새로 묻는다
          noCache: trigger === "MANUAL",
          warnings: warningsPayload(cur.weather, activeAdvisories(cur.weather, baseTarget(cur.cond.base))),
        });
        setJobId(job.id);
        // 마지막 점검 = 그 점검 작업을 접수한 시각 — 같은 10분 구간에 다시 열면 서버가 원래 점검 작업을 그대로 돌려준다(R39)
        setLastAt(job.created_at);
      } catch (e) {
        cur.toast((e as Error).message);
      }
    },
    [],
  );

  // 기준지역이 바뀌면 처음부터 — 이전 지역의 점검 답·시각·특보 쪽수를 비우고, 아래 효과가 새 지역으로 바로 점검(START)한다.
  // 처음 열 때(개발 모드의 효과 두 번 실행 포함)는 비우지 않는다 — 같은 점검을 두 번 보내지 않게
  const lastBk = useRef(bk);
  useEffect(() => {
    if (lastBk.current === bk) return;
    lastBk.current = bk;
    setJobId(null);
    setLastAt(null);
    setPg(0);
    sentKey.current = "";
  }, [bk]);

  // 처음 · 특보 변화 · 10분 주기
  useEffect(() => {
    if (!s.weather) return;
    const key = `${bk}|${warnKey}`;
    if (sentKey.current === key) return;
    const first = sentKey.current === "";
    sentKey.current = key;
    check(first ? "START" : "WARNING_CHANGE");
  }, [s.weather, bk, warnKey, check]);
  // 다음 점검 = 받은 점검 작업 접수 시각(마지막 점검) + 10분 — 새로 고침으로 되돌려 받은 원래 점검(R39)이면 그 시각 기준이라
  // 「마지막 점검」과 「다음 점검」이 10분 간격으로 맞고, 그때는 다음 10분 구간이라 새로 묻는다. 그 뒤로는 10분마다
  const [nextAt, setNextAt] = useState<number | null>(null);
  useEffect(() => {
    const ms = INTERVAL_MIN * 60_000;
    const at = lastAt ? Date.parse(lastAt) : NaN;
    const due = Number.isFinite(at) ? Math.max(Date.now(), at + ms) : Date.now() + ms;
    setNextAt(due);
    let t: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      setNextAt(Date.now() + ms);
      check("INTERVAL");
      t = setInterval(() => {
        setNextAt(Date.now() + ms);
        check("INTERVAL");
      }, ms);
    }, due - Date.now());
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
    // 기준지역이 바뀌거나 새 점검 작업을 받으면 그 시각부터 다시 센다
  }, [check, bk, lastAt]);

  const job = jobId ? s.jobs[jobId] : null;
  const full = jobId ? s.full[jobId] : undefined;
  useEffect(() => {
    if (job && !isActive(job.state) && !full) s.loadFull(job.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, job?.state]);
  const answer = full?.raw?.result?.answer ?? null;
  const next = lastAt && nextAt ? new Date(nextAt) : null;
  const hm = (d: Date | string) => new Date(d).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const a = advs[pg % Math.max(1, advs.length)];

  // 접힌 띠 — 내용 맨 위. 점 색은 머리줄 AI 모드 단추와 같은 기준(경보·주의보·없음·조회 실패), 특보는 받은 이름 그대로 모두
  if (collapsed) {
    // 기상청 조회가 실패해도 시나리오 특보가 있으면 그 이름을 보인다(특보 줄과 같게)
    const wxFail = !!s.weather && !s.weather.status.ok && !advs.length;
    const tone = national || wxFail ? "gray" : advs.some((x) => x.level === "경보") ? "red" : advs.length ? "yellow" : "green";
    const when = [
      !national && !job ? "점검 준비 중" : job && isActive(job.state) ? "점검 중" : null,
      lastAt ? `마지막 점검 ${hm(lastAt)}` : null,
      next ? `다음 점검 ${hm(next)}` : null,
    ].filter(Boolean).join(" · ");
    return (
      <div className="aim-bar-wrap">
        <div className="aim-bar" role="status" aria-label="AI 모드 실행 중">
          <i className={`aim-dot st-${tone}`} aria-hidden />
          <b className="aim-w">{national ? "기준지역을 고르면 점검합니다" : wxFail ? "기상특보 조회 실패" : advs.length ? advs.map(advName).join(" · ") : `${regionName} 발효 특보 없음`}</b>
          {when && <span className="aim-t">{when}</span>}
          <span className="sp" />
          <button type="button" className="aim-open" onClick={() => setCollapsed(false)}>AI 모드 펼치기</button>
        </div>
      </div>
    );
  }

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
        {national ? (
          <div className="notice" style={{ marginTop: 12 }}>AI 모드는 지역 기준으로 점검합니다. 상단에서 기준지역을 고르세요.</div>
        ) : (
          <div className={`aim-card ${a ? (a.level === "경보" ? "danger" : "warn") : "calm"}`}>
            <div className="row">
              {a ? (
                <>
                  <b style={{ fontSize: 24 }}>{advLabel(a)}</b>
                  {a.scenario && <span className="scn-tag">{SCN_LABEL}</span>}
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
            {a && (a.scenario ? (
              <div className="xs muted">{a.area} · {new Date(a.issuedAt).toLocaleString("ko-KR")} 켬 · {SCN_LABEL}</div>
            ) : (
              <div className="xs muted">{a.area} · {new Date(a.issuedAt).toLocaleString("ko-KR")} 발표 · 기상청</div>
            ))}
            <div className="aim-ai">
              <div className="xs b" style={{ color: "var(--c-navy)" }}>AI 안내</div>
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
        {!national && (
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
