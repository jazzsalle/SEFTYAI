"use client";
/**
 * 우측 고정 탭 「대응절차」 — 행동매뉴얼 대응절차 체크리스트
 * 대응단계(4) → 임무 → 조치(체크) → 세부행동. 필요시 임무는 단계 끝에 따로 (조건이 맞을 때만 실행).
 * 내 부서 조치가 기본, [전체 부서 보기]로 다른 부서·유관기관 조치까지.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Citation } from "@/lib/contract/agent";
import { useSession } from "@/lib/session";
import { useSop } from "@/lib/sopState";
import { codeLabel, myGroupIds, sopCheckKey, stepLabel, stepProgress, stepView, type SopAction, type SopManual } from "@/lib/sop";
import { useExplore } from "../explore/ExploreCtx";
import { IcCheck, IcChevD, IcChevR, IcDoc } from "../Icons";

const KIND_ORDER: Record<string, number> = { 초기대응부서: 0, 지휘부: 1, 협업부서: 2, 유관기관: 3 };

export default function SopPane({ focus }: { focus?: { id: string; n: number } }) {
  const sop = useSop();
  const { checks, toggleCheck } = useSession();
  const x = useExplore();
  const m = sop.manual;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [goalsAll, setGoalsAll] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // 단계 바에서 고른 조치 → 펼치고 그 자리로 이동
  useEffect(() => {
    if (!focus || !m) return;
    const a = m.actions.find((v) => v.id === focus.id);
    if (!a) return;
    if (a.step !== sop.step) sop.setStep(a.step);
    setOpen((o) => ({ ...o, [a.id]: true }));
    setFlash(a.id);
    const t = setTimeout(() => boxRef.current?.querySelector(`[data-act="${CSS.escape(a.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    const t2 = setTimeout(() => setFlash(null), 2200);
    return () => { clearTimeout(t); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n, m]);

  const mine = useMemo(() => (m ? myGroupIds(m) : new Set<string>()), [m]);
  const shown = useMemo(() => {
    if (!m) return new Set<string>();
    return sop.scope === "mine" ? mine : new Set(m.groups.map((g) => g.id));
  }, [m, mine, sop.scope]);

  if (!m) return <div className="dpane">{sop.failed ? <div className="notice danger">대응절차를 불러오지 못했습니다.</div> : <div className="typing"><i /><i /><i /></div>}</div>;

  const st = m.steps.find((s) => s.step === sop.step)!;
  const view = stepView(m, sop.step, shown);
  const flowGroups = [...view.flow].sort((a, b) => Number(!a.group.mine) - Number(!b.group.mine) || KIND_ORDER[a.group.kind] - KIND_ORDER[b.group.kind]);
  const pg = stepProgress(m, sop.step, mine, checks);
  const myName = m.groups.filter((g) => g.mine).map((g) => g.name)[0] ?? m.mine;
  const cite = (pdfPage: number, locator?: string): Citation => ({ id: `s${pdfPage}`, docId: `MAN:${m.manualId}`, title: m.short, kind: "매뉴얼", page: pdfPage, locator });
  const goals = goalsAll ? st.goals : st.goals.slice(0, 3);
  const rec = sop.rec;
  const visible = [...view.flow.flatMap((g) => g.missions.flatMap((x) => x.actions)), ...view.cond].map((a) => a.id);
  const allOpen = visible.length > 0 && visible.every((id) => open[id]);
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div className="dpane soppane fadein" ref={boxRef}>
      <div className="dh">
        <div style={{ minWidth: 0 }}>
          <div className="xs b" style={{ color: "var(--c-navy)" }}>행동매뉴얼 대응절차</div>
          <h2>{m.title}</h2>
        </div>
        <div className="acts">
          <button className="btn sm" onClick={() => x.openCitation(cite(st.tablePdfPage, "재난대응 프로세스"))}><IcDoc size={13} /> 매뉴얼 원문</button>
        </div>
      </div>

      <div className="sp-steps" role="tablist" aria-label="대응단계">
        {m.steps.map((s) => {
          const p = stepProgress(m, s.step, mine, checks);
          const on = s.step === sop.step;
          const isRec = rec?.step === s.step;
          return (
            <button key={s.step} role="tab" aria-selected={on} className={`${on ? "on" : ""} ${isRec ? "rec" : ""}`} onClick={() => sop.setStep(isRec || (!rec && s.no === 1) ? null : s.step)}>
              <span className="n">{s.no}단계{isRec && <em>추천</em>}</span>
              <span className="t">{stepLabel(m, s.step)}</span>
              <span className="c">{p.total ? `${p.done}/${p.total}` : "—"}</span>
            </button>
          );
        })}
      </div>

      <div className={`notice ${rec?.level === "경보" ? "danger" : rec ? "warn" : ""} sp-rec`}>
        {rec ? (
          <>
            <b>{rec.level === "해제" ? "특보 해제" : `${rec.advisory ? rec.advisory.area + " " + rec.advisory.type + rec.advisory.level : rec.level} 발효`}</b> → 매뉴얼 기준 추천 단계 <b>{stepLabel(m, rec.step)}</b>
            <button className="pg" onClick={() => x.openCitation(cite(rec.pdfPage, rec.basis))} title={rec.basis}>p.{rec.pdfPage}</button>
            {sop.picked && <> · 지금 보는 단계 <b>{stepLabel(m, sop.step)}</b>(직접 선택) <button className="btn xs" onClick={() => sop.setStep(null)}>추천 단계로</button></>}
          </>
        ) : (
          <>발효 중인 특보가 없어 평시 기준 <b>{stepLabel(m, sop.step)}</b> 조치를 보여 줍니다. 특보가 발효되면 매뉴얼 기준 단계를 추천합니다.</>
        )}
        <div className="xs" style={{ marginTop: 4, opacity: 0.85 }}>추천 단계는 참고용입니다. 현장 상황에 맞게 단계를 바꿔 쓰세요.</div>
      </div>

      {st.goals.length > 0 && (
        <div className="sp-goals">
          <div className="hd">
            <b>대응 지침</b>
            <button className="pg" onClick={() => x.openCitation(cite(st.goalPdfPage, "대응 지침"))}>p.{st.goalPdfPage}</button>
          </div>
          <ul>{goals.map((g, i) => <li key={i}>{g}</li>)}</ul>
          {st.goals.length > 3 && <button className="btn xs ghost" onClick={() => setGoalsAll((v) => !v)}>{goalsAll ? "접기" : `${st.goals.length - 3}개 더 보기`}</button>}
        </div>
      )}

      <div className="sp-tools">
        <div className="modeSw" role="group" aria-label="부서 범위">
          <button className={sop.scope === "mine" ? "on" : ""} onClick={() => sop.setScope("mine")} aria-pressed={sop.scope === "mine"}>내 부서 · {myName}</button>
          <button className={sop.scope === "all" ? "on" : ""} onClick={() => sop.setScope("all")} aria-pressed={sop.scope === "all"}>전체 부서 보기</button>
        </div>
        <span className="sp" />
        <span className="xs mute2">내 부서 완료 <b style={{ color: "var(--c-ok)" }}>{pg.done}</b> / {pg.total}</span>
        <button className="btn xs ghost" onClick={() => setOpen(allOpen ? {} : Object.fromEntries(visible.map((id) => [id, true])))}>{allOpen ? "모두 접기" : "모두 펼치기"}</button>
      </div>

      {view.total === 0 && view.cond.length === 0 && <div className="notice" style={{ marginTop: 12 }}>이 단계에 {sop.scope === "mine" ? "내 부서" : ""} 조치가 없습니다.</div>}

      {flowGroups.map(({ group, missions }) => (
        <section key={group.id} className={`sp-group ${group.mine ? "mine" : ""}`}>
          {(sop.scope === "all" || mine.size > 1) && (
            <h3>
              <span className={`badge sq ${group.mine ? "info" : "neutral"}`}>{group.mine ? "내 부서" : group.kind}</span>
              {group.fn && <span className="fn">{group.fn}</span>}
              {group.name}
            </h3>
          )}
          {missions.map(({ mission, actions }) => (
            <div key={mission.id} className="sp-mission">
              {mission.auto ? (
                mission.sub && <div className="mh sub-only">{mission.sub}</div>
              ) : (
                <div className="mh">
                  {mission.code && <span className="code">[{codeLabel(m, mission.code)}]</span>}
                  {mission.name}
                  {mission.sub && <span className="sub">{mission.sub}</span>}
                </div>
              )}
              <ul>
                {actions.map((a) => (
                  <ActionRow key={a.id} m={m} a={a} mine={group.mine} done={!!checks[sopCheckKey(m, a)]} onCheck={() => toggleCheck(sopCheckKey(m, a))}
                    open={!!open[a.id]} onToggle={() => toggle(a.id)} flash={flash === a.id}
                    onPage={(p) => x.openCitation(cite(p, `${a.code ? codeLabel(m, a.code) + " " : ""}${a.name}`))} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {view.cond.length > 0 && (
        <section className="sp-cond">
          <h3>필요시 임무 <span className="xs">조건이 맞을 때만 실행 · 순서와 관계없이 바로 착수</span></h3>
          <ul>
            {view.cond.map((a) => {
              const g = m.groups.find((v) => v.id === a.group)!;
              return (
                <ActionRow key={a.id} m={m} a={a} mine={g.mine} groupName={sop.scope === "all" && !g.mine ? g.name : undefined} done={!!checks[sopCheckKey(m, a)]} onCheck={() => toggleCheck(sopCheckKey(m, a))}
                  open={!!open[a.id]} onToggle={() => toggle(a.id)} flash={flash === a.id}
                  onPage={(p) => x.openCitation(cite(p, a.name))} />
              );
            })}
          </ul>
        </section>
      )}

      <div className="srcline">출처 : <span className="badge star">★ {m.title}</span> 재난대응 프로세스·행동카드 (p.{st.tablePdfPage} 등)</div>
    </div>
  );
}

function ActionRow({ m, a, mine, done, onCheck, open, onToggle, flash, onPage, groupName }: {
  m: SopManual; a: SopAction; mine: boolean; done: boolean; onCheck: () => void; open: boolean; onToggle: () => void; flash: boolean; onPage: (pdfPage: number) => void; groupName?: string;
}) {
  const has = a.details.length > 0 || (a.notes?.length ?? 0) > 0 || !!a.orgs;
  const lead = a.orgs?.lead;
  return (
    <li className={`sp-act ${done ? "done" : ""} ${flash ? "flash" : ""} ${mine ? "" : "other"}`} data-act={a.id}>
      <div className="r">
        {mine ? <input type="checkbox" checked={done} onChange={onCheck} aria-label={`${a.name} 완료`} /> : <span className="dot" aria-hidden />}
        <button className="tx" onClick={onToggle} aria-expanded={has ? open : undefined} disabled={!has}>
          {a.code && <b className="code">{codeLabel(m, a.code)}</b>}
          <span className="nm">{a.name}</span>
          {a.condition && <span className="cond">{a.condition}</span>}
          {a.changed && <span className="chg" title="이전 단계와 내용이 다름">변경</span>}
          {groupName && <span className="grp">{groupName}</span>}
        </button>
        <span className="meta">
          {lead && <span className="lead" title="주관부서">{lead}</span>}
          <button className="pg" onClick={() => onPage(a.pdfPage)} title="매뉴얼 원문 쪽">p.{a.pdfPage}</button>
          {has && <button className="tg" onClick={onToggle} aria-label={open ? "접기" : "세부 보기"}>{open ? <IcChevD size={14} /> : <IcChevR size={14} />}</button>}
        </span>
      </div>
      {open && has && (
        <div className="body">
          {a.details.length > 0 && (
            <ol>
              {a.details.map((d) => (
                <li key={d.seq}>
                  <span className="t">{d.title}</span>
                  {d.note && <span className="nt">{d.note}</span>}
                  {d.content && <div className="c">{d.content}</div>}
                </li>
              ))}
            </ol>
          )}
          {a.notes?.map((n, i) => <div key={i} className="note">※ {n}</div>)}
          {a.orgs && (a.orgs.support?.length || a.orgs.collab?.length) ? (
            <dl className="orgs">
              {a.orgs.lead && <><dt>주관</dt><dd>{a.orgs.lead}</dd></>}
              {a.orgs.support?.length ? <><dt>지원</dt><dd>{a.orgs.support.join(", ")}</dd></> : null}
              {a.orgs.collab?.length ? <><dt>협업</dt><dd>{a.orgs.collab.join(", ")}</dd></> : null}
            </dl>
          ) : null}
          {done && <div className="xs" style={{ color: "var(--c-ok)", marginTop: 6 }}><IcCheck size={12} /> 완료로 표시함</div>}
        </div>
      )}
    </li>
  );
}
