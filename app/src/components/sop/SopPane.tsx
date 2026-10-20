"use client";
/**
 * 우측 고정 탭 「대응절차」 — 행동매뉴얼 대응절차 체크리스트
 * 대응단계(4) → 임무 → 조치(체크) → 세부행동 · 행동카드. 필요시 임무는 단계 끝에 따로 (조건이 맞을 때만 실행).
 * 내 부서 조치가 기본, [전체 부서 보기]로 다른 부서·유관기관 조치까지.
 * [수정] — 매뉴얼이 개정되면 담당자가 조치·카드·단계 기준을 직접 고친다 (원문 추출본은 그대로, 수정본만 저장).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Citation } from "@/lib/contract/agent";
import { useSession } from "@/lib/session";
import { useSop } from "@/lib/sopState";
import {
  codeLabel, editCount, myGroupIds, sopCheckKey, stepLabel, stepProgress, stepView,
  type SopAction, type SopCard, type SopGroup, type SopManual, type SopMission,
} from "@/lib/sop";
import { useExplore } from "../explore/ExploreCtx";
import { IcCheck, IcChevD, IcChevR, IcDoc, IcDown, IcEdit, IcPlus, IcTrash, IcUndo, IcUp } from "../Icons";
import SopCardView, { Orgs } from "./SopCardView";
import SopPropagate from "./SopPropagate";
import { ActionEditor, GroupEditor, HistoryModal, ManualEditor, MissionEditor, fmtTime, useSopEditOps } from "./SopEdit";

const KIND_ORDER: Record<string, number> = { 초기대응부서: 0, 지휘부: 1, 협업부서: 2, 유관기관: 3 };
type Dlg = { k: "act"; a: SopAction; isNew?: boolean } | { k: "mis"; mi: SopMission; isNew?: boolean } | { k: "grp"; g: SopGroup } | { k: "man" } | { k: "log" };
type RowEdit = { onEdit: () => void; onUp: () => void; onDown: () => void; onDel: () => void; onRestore: () => void };

export default function SopPane({ focus }: { focus?: { id: string; n: number } }) {
  const sop = useSop();
  const { checks, checkInfo, toggleCheck, resetChecks, toast } = useSession();
  const [askReset, setAskReset] = useState(false);
  const x = useExplore();
  const ops = useSopEditOps();
  const editing = sop.editing && !!sop.editView;
  const m = sop.manual;
  const vm = editing ? sop.editView : m;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [goalsAll, setGoalsAll] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg | null>(null);
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

  const mine = useMemo(() => (vm ? myGroupIds(vm) : new Set<string>()), [vm]);
  const shown = useMemo(() => {
    if (!vm) return new Set<string>();
    return sop.scope === "mine" ? mine : new Set(vm.groups.map((g) => g.id));
  }, [vm, mine, sop.scope]);
  const cards = useMemo(() => new Map((vm?.cards ?? []).map((c) => [c.id, c])), [vm]);

  if (!m || !vm) return <div className="dpane">{sop.failed ? <div className="notice danger">대응절차를 불러오지 못했습니다.</div> : <div className="typing"><i /><i /><i /></div>}</div>;

  const st = vm.steps.find((s) => s.step === sop.step)!;
  const view = stepView(vm, sop.step, shown, editing);
  const flowGroups = [...view.flow].sort((a, b) => Number(!a.group.mine) - Number(!b.group.mine) || KIND_ORDER[a.group.kind] - KIND_ORDER[b.group.kind]);
  const pg = stepProgress(m, sop.step, myGroupIds(m), checks);
  const myName = vm.groups.filter((g) => g.mine).map((g) => g.name)[0] ?? vm.mine;
  const cite = (pdfPage: number, locator?: string): Citation => ({ id: `s${pdfPage}`, docId: `MAN:${m.manualId}`, title: m.short, kind: "매뉴얼", page: pdfPage, locator });
  const goals = goalsAll ? st.goals : st.goals.slice(0, 3);
  const rec = sop.rec;
  const visible = [...view.flow.flatMap((g) => g.missions.flatMap((v) => v.actions)), ...view.cond].map((a) => a.id);
  const allOpen = visible.length > 0 && visible.every((id) => open[id]);
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const nEdit = editCount(sop.edits);
  const last = sop.edits?.log[0];
  const rowEdit = (a: SopAction): RowEdit | undefined =>
    editing
      ? { onEdit: () => setDlg({ k: "act", a }), onUp: () => ops.move(a, -1), onDown: () => ops.move(a, 1), onDel: () => ops.remove(a), onRestore: () => ops.restore(a) }
      : undefined;
  const row = (a: SopAction, g: SopGroup, groupName?: string) => (
    <ActionRow key={a.id} m={vm} a={a} card={a.card ? cards.get(a.card) : undefined} mine={g.mine} groupName={groupName}
      done={!!checks[sopCheckKey(m, a)]} doneBy={checkInfo[sopCheckKey(m, a)]} onCheck={() => toggleCheck(sopCheckKey(m, a))}
      open={!!open[a.id]} onToggle={() => toggle(a.id)} flash={flash === a.id} edit={rowEdit(a)}
      onPage={(p) => x.openCitation(cite(p, `${a.code ? codeLabel(m, a.code) + " " : ""}${a.name}`))} />
  );

  return (
    <div className={`dpane soppane fadein ${editing ? "editing" : ""}`} ref={boxRef}>
      <div className="dh">
        <div style={{ minWidth: 0 }}>
          <div className="xs b" style={{ color: "var(--c-navy)" }}>행동매뉴얼 대응절차</div>
          <h2>{m.title}</h2>
        </div>
        <div className="acts">
          {!editing && <SopPropagate />}
          <button className="btn sm" onClick={() => x.openCitation(cite(st.tablePdfPage, "재난대응 프로세스"))}><IcDoc size={13} /> 매뉴얼 원문</button>
          {sop.canEdit && (
            <button className={`btn sm ${editing ? "pri" : ""}`} onClick={() => sop.setEditing(!editing)} aria-pressed={editing} title="매뉴얼이 개정되면 조치·행동카드·단계 기준을 직접 고칩니다">
              {editing ? <><IcCheck size={13} /> 수정 마침</> : <><IcEdit size={13} /> 수정</>}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="sp-editbar">
          <div>
            <b>수정 중</b> — 조치를 고치거나(<IcEdit size={12} />) 순서를 바꾸고, 임무·조치를 추가하세요. 원문 추출본은 그대로 두고 수정본만 저장합니다.
            <div className="xs" style={{ marginTop: 2 }}>수정본은 서버에 저장되어 같은 기관 담당자가 함께 봅니다. 다른 담당자가 먼저 고쳤으면 최신본을 불러온 뒤 다시 고칩니다.</div>
          </div>
          <div className="btns">
            <button className="btn xs" onClick={() => setDlg({ k: "man" })}>매뉴얼 정보·단계 기준</button>
            <button className="btn xs" onClick={() => setDlg({ k: "log" })}>수정 이력·내보내기{nEdit ? ` (${nEdit})` : ""}</button>
          </div>
        </div>
      ) : (
        nEdit > 0 && last && (
          <div className="sp-edited">
            <span className="badge sq info">담당자 수정본</span>
            <span className="xs">
              {m.info?.edition ? <b>{m.info.edition} · </b> : null}수정 {nEdit}곳 · 최근 {fmtTime(last.at)} {last.by}
            </span>
            <button className="lnk" onClick={() => setDlg({ k: "log" })}>수정 이력</button>
          </div>
        )
      )}

      <div className="sp-steps" role="tablist" aria-label="대응단계">
        {vm.steps.map((s) => {
          const p = stepProgress(m, s.step, myGroupIds(m), checks);
          const on = s.step === sop.step;
          const isRec = rec?.step === s.step;
          return (
            <button key={s.step} role="tab" aria-selected={on} className={`${on ? "on" : ""} ${isRec ? "rec" : ""}`} onClick={() => sop.setStep(isRec || (!rec && s.no === 1) ? null : s.step)}>
              <span className="n">{s.no}단계{isRec && <em>추천</em>}</span>
              <span className="t">{stepLabel(vm, s.step)}</span>
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
            {st.goalPdfPage > 0 && <button className="pg" onClick={() => x.openCitation(cite(st.goalPdfPage, "대응 지침"))}>p.{st.goalPdfPage}</button>}
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
        {!editing && Object.keys(checks).some((k) => k.startsWith(`sop:${m.id}:`)) && (
          <button className="btn xs ghost" onClick={() => setAskReset(true)} title="상황이 끝나면 우리 기관 체크를 모두 비우고 새로 시작합니다">새 상황으로 시작</button>
        )}
      </div>

      {askReset && (
        <div className="notice warn row" style={{ marginTop: 10, gap: 8 }} role="alertdialog" aria-label="새 상황으로 시작">
          <span className="sp">이 매뉴얼의 우리 기관 체크를 모두 비울까요? 같은 기관 담당자 화면에서도 함께 비워집니다. (비운 기록은 관리로그에 남습니다)</span>
          <button className="btn xs" onClick={() => setAskReset(false)}>취소</button>
          <button className="btn xs pri" onClick={async () => { setAskReset(false); try { const n = await resetChecks(`sop:${m.id}:`); toast(`체크 ${n}개를 비웠습니다.`); } catch { toast("체크를 비우지 못했습니다."); } }}>비우기</button>
        </div>
      )}

      {view.total === 0 && view.cond.length === 0 && !editing && <div className="notice" style={{ marginTop: 12 }}>이 단계에 {sop.scope === "mine" ? "내 부서" : ""} 조치가 없습니다.</div>}

      {flowGroups.map(({ group, missions }) => (
        <section key={group.id} className={`sp-group ${group.mine ? "mine" : ""}`}>
          {(editing || sop.scope === "all" || mine.size > 1) && (
            <h3>
              <span className={`badge sq ${group.mine ? "info" : "neutral"}`}>{group.mine ? "내 부서" : group.kind}</span>
              {group.fn && <span className="fn">{group.fn}</span>}
              {group.name}
              {group.edit && <span className="ed">수정</span>}
              {editing && (
                <span className="eops">
                  <button className="btn xs ghost" onClick={() => setDlg({ k: "grp", g: group })} title="부서 이름·내 부서 지정"><IcEdit size={12} /> 부서</button>
                  <button className="btn xs ghost" onClick={() => setDlg({ k: "mis", mi: ops.draftMission(group, sop.step), isNew: true })}><IcPlus size={12} /> 임무</button>
                </span>
              )}
            </h3>
          )}
          {missions.map(({ mission, actions }) => (
            <div key={mission.id} className={`sp-mission ${mission.deleted ? "deleted" : ""}`}>
              {mission.auto && !editing ? (
                mission.sub && <div className="mh sub-only">{mission.sub}</div>
              ) : (
                <div className={`mh ${mission.cardOnly ? "card-only" : ""}`}>
                  {mission.cardOnly && <span className="badge sq star" title="report4 규칙: 프로세스 표에 없는 행동카드는 그 단계 끝에 붙임">행동카드</span>}
                  {mission.code && <span className="code">[{codeLabel(vm, mission.code)}]</span>}
                  <span className="mn">{mission.auto ? mission.sub || "(소제목 없음)" : mission.name}</span>
                  {!mission.auto && mission.sub && <span className="sub">{mission.sub}</span>}
                  {mission.edit && <span className="ed">{mission.edit}</span>}
                  {editing && (
                    <span className="eops">
                      {mission.deleted ? (
                        <button className="btn xs ghost" onClick={() => ops.restoreMission(mission)}><IcUndo size={12} /> 되살리기</button>
                      ) : (
                        <>
                          {!mission.auto && <button className="btn xs ghost" onClick={() => setDlg({ k: "mis", mi: mission })} title="임무 이름·번호 고치기, 임무 삭제"><IcEdit size={12} /></button>}
                          <button className="btn xs ghost" onClick={() => setDlg({ k: "act", a: ops.draftAction(mission), isNew: true })}><IcPlus size={12} /> 조치</button>
                        </>
                      )}
                    </span>
                  )}
                </div>
              )}
              <ul>{actions.map((a) => row(a, group))}</ul>
              {editing && actions.length === 0 && !mission.deleted && <div className="xs mute2 sp-empty">조치가 없습니다. [+ 조치]로 추가하세요.</div>}
            </div>
          ))}
        </section>
      ))}

      {view.cond.length > 0 && (
        <section className="sp-cond">
          <h3>필요시 임무 <span className="xs">조건이 맞을 때만 실행 · 순서와 관계없이 바로 착수</span></h3>
          <ul>
            {view.cond.map((a) => {
              const g = vm.groups.find((v) => v.id === a.group)!;
              return row(a, g, sop.scope === "all" && !g.mine ? g.name : undefined);
            })}
          </ul>
        </section>
      )}

      <div className="srcline">출처 : <span className="badge star">★ {m.title}</span> 재난대응 프로세스·행동카드 (p.{st.tablePdfPage} 등){nEdit > 0 ? " · 담당자 수정본 적용" : ""}</div>

      {dlg?.k === "act" && <ActionEditor a={dlg.a} isNew={dlg.isNew} onClose={() => setDlg(null)} />}
      {dlg?.k === "mis" && <MissionEditor mi={dlg.mi} isNew={dlg.isNew} onClose={() => setDlg(null)} />}
      {dlg?.k === "grp" && <GroupEditor g={dlg.g} onClose={() => setDlg(null)} />}
      {dlg?.k === "man" && <ManualEditor onClose={() => setDlg(null)} />}
      {dlg?.k === "log" && <HistoryModal onClose={() => setDlg(null)} />}
    </div>
  );
}

function ActionRow({ m, a, card, mine, done, doneBy, onCheck, open, onToggle, flash, onPage, groupName, edit }: {
  m: SopManual; a: SopAction; card?: SopCard; mine: boolean; done: boolean; doneBy?: { by: string; at: string }; onCheck: () => void; open: boolean; onToggle: () => void; flash: boolean;
  onPage: (pdfPage: number) => void; groupName?: string; edit?: RowEdit;
}) {
  // 세부행동이 카드 본문에서 온 것이면 카드 칸에서 보여 줌 (중복 표시 안 함)
  const ownDetails = a.details.length > 0 && (a.detailsFrom !== "card" || !card);
  const has = ownDetails || (a.notes?.length ?? 0) > 0 || !!a.orgs || !!card;
  const lead = a.orgs?.lead ?? card?.orgs.lead;
  const del = !!a.deleted;
  return (
    <li className={`sp-act ${done && !edit ? "done" : ""} ${flash ? "flash" : ""} ${mine ? "" : "other"} ${del ? "deleted" : ""}`} data-act={a.id}>
      <div className="r">
        {mine && !edit ? <input type="checkbox" checked={done} onChange={onCheck} aria-label={`${a.name} 완료`} title={doneBy ? `${doneBy.by} · ${new Date(doneBy.at).toLocaleString("ko-KR")}` : undefined} /> : <span className="dot" aria-hidden />}
        <button className="tx" onClick={onToggle} aria-expanded={has ? open : undefined} disabled={!has}>
          {a.code && <b className="code">{codeLabel(m, a.code)}</b>}
          <span className="nm">{a.name || "(이름 없음)"}</span>
          {a.condition && <span className="cond">{a.condition}</span>}
          {a.changed && <span className="chg" title="이전 단계와 내용이 다름">변경</span>}
          {a.fromCard && <span className="chg crd" title="프로세스 표에는 없고 행동카드에만 있는 조치 — 그 단계 끝에 붙임">카드</span>}
          {a.edit && <span className={`chg ed ${a.edit === "추가" ? "add" : ""}`} title="담당자 수정본">{a.edit}</span>}
          {del && <span className="chg ed del">삭제됨</span>}
          {groupName && <span className="grp">{groupName}</span>}
        </button>
        <span className="meta">
          {lead && !edit && <span className="lead" title="주관부서">{lead}</span>}
          {a.pdfPage > 0 && !edit && <button className="pg" onClick={() => onPage(a.pdfPage)} title="매뉴얼 원문 쪽">p.{a.pdfPage}</button>}
          {edit && (
            del ? (
              <button className="btn xs ghost" onClick={edit.onRestore}><IcUndo size={12} /> 되살리기</button>
            ) : (
              <span className="eops">
                <button className="btn xs ghost" onClick={edit.onEdit} aria-label="고치기" title="고치기"><IcEdit size={13} /></button>
                <button className="btn xs ghost" onClick={edit.onUp} aria-label="위로" title="위로"><IcUp size={13} /></button>
                <button className="btn xs ghost" onClick={edit.onDown} aria-label="아래로" title="아래로"><IcDown size={13} /></button>
                <button className="btn xs ghost" onClick={edit.onDel} aria-label="삭제" title="삭제"><IcTrash size={13} /></button>
              </span>
            )
          )}
          {has && <button className="tg" onClick={onToggle} aria-label={open ? "접기" : "세부 보기"}>{open ? <IcChevD size={14} /> : <IcChevR size={14} />}</button>}
        </span>
      </div>
      {open && has && (
        <div className="body">
          {ownDetails && (
            <>
              {card && <div className="bh">세부행동 <span className="xs mute2">재난대응 프로세스 표</span></div>}
              <ol>
                {a.details.map((d) => (
                  <li key={d.seq}>
                    <span className="t">{d.title}</span>
                    {d.note && <span className="nt">{d.note}</span>}
                    {d.content && <div className="c">{d.content}</div>}
                  </li>
                ))}
              </ol>
            </>
          )}
          {a.notes?.map((n, i) => <div key={i} className="note">※ {n}</div>)}
          {card ? <SopCardView m={m} card={card} orgs={a.orgs} onPage={onPage} /> : <Orgs o={a.orgs} />}
          {done && !edit && <div className="xs" style={{ color: "var(--c-ok)", marginTop: 6 }}><IcCheck size={12} /> 완료로 표시함{doneBy ? ` · ${doneBy.by} ${new Date(doneBy.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}</div>}
        </div>
      )}
    </li>
  );
}
