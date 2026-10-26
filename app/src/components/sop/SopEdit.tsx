"use client";
/**
 * 대응절차 수정 — 매뉴얼은 해마다 1~2회 개정된다. 담당 공무원이 바뀐 내용을 화면에서 직접 고친다.
 * 원문 추출본은 그대로 두고 수정본(덧씌움)만 저장 → 언제든 원문으로 되돌릴 수 있고 누가 무엇을 고쳤는지 이력이 남는다.
 * 수정본은 서버에 기관 공용으로 저장 (D39). [내보내기]·[가져오기]는 파일 보관·이관용.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useSession, type CheckHistory } from "@/lib/session";
import { useSop } from "@/lib/sopState";
import {
  SOP_STEPS, blocksToText, codeLabel, deriveCard, editCount, newSopId, stepLabel, textToBlocks,
  type SopAction, type SopActionPatch, type SopCard, type SopDetail, type SopEdits, type SopGroup, type SopManual, type SopMission, type SopRecommend, type SopStep,
} from "@/lib/sop";
import { CardBlocks } from "./SopCardView";
import { IcDown, IcPlus, IcUp, IcX } from "../Icons";

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const commaList = (s: string) => s.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
const lineList = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
export const actLabel = (m: SopManual, a: Pick<SopAction, "code" | "name">) => `${a.code ? codeLabel(m, a.code) + " " : ""}${a.name}`;

/** 편집 창 — 우측 패널(애니메이션 transform) 밖, 화면 맨 위에 띄움 */
function Modal({ title, sub, wide, onClose, children, foot }: { title: string; sub?: string; wide?: boolean; onClose: () => void; children: React.ReactNode; foot: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ovl" onClick={onClose}>
      <div className={`modal sp-edit ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-hd">
          <div style={{ minWidth: 0 }}>
            <h2>{title}</h2>
            {sub && <div className="xs mute2" style={{ marginTop: 4 }}>{sub}</div>}
          </div>
          <span className="sp" />
          <button className="btn sm ghost" onClick={onClose} aria-label="닫기"><IcX size={16} /></button>
        </div>
        <div className="modal-bd">{children}</div>
        <div className="modal-ft">{foot}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------------- 조치 (+ 행동카드) */
type DRow = { title: string; content: string; note: string };

export function ActionEditor({ a, isNew, onClose }: { a: SopAction; isNew?: boolean; onClose: () => void }) {
  const sop = useSop();
  const { toast } = useSession();
  const m = sop.editView ?? sop.manual!;
  const base = sop.base!;
  const card0 = a.card ? m.cards.find((c) => c.id === a.card) ?? null : null;
  const [tab, setTab] = useState<"act" | "card">("act");
  const [code, setCode] = useState(a.code ?? "");
  const [name, setName] = useState(a.name);
  const [cond, setCond] = useState(a.condition ?? "");
  const [own, setOwn] = useState(a.detailsFrom !== "card" || !card0); // 세부행동을 직접 적음 (카드 본문을 따르지 않음)
  const [rows, setRows] = useState<DRow[]>(a.details.map((d) => ({ title: d.title, content: d.content ?? "", note: d.note ?? "" })));
  const [notes, setNotes] = useState((a.notes ?? []).join("\n"));
  const o = a.orgs ?? card0?.orgs ?? null;
  const [lead, setLead] = useState(o?.lead ?? "");
  const [support, setSupport] = useState((o?.support ?? []).join(", "));
  const [collab, setCollab] = useState((o?.collab ?? []).join(", "));
  const [cardOn, setCardOn] = useState(!!card0);
  const [cCode, setCCode] = useState(card0?.code ?? a.code ?? "");
  const [cName, setCName] = useState(card0?.name ?? a.name);
  const [cSum, setCSum] = useState(card0?.summary ?? "");
  const [cText, setCText] = useState(card0 ? blocksToText(card0.blocks) : "");
  const initText = useRef(cText);
  const [err, setErr] = useState("");
  const preview = textToBlocks(cText, card0?.blocks);

  const setRow = (i: number, p: Partial<DRow>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => setRows((r) => {
    const n = [...r];
    const j = i + d;
    if (j < 0 || j >= n.length) return r;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  const save = () => {
    if (!name.trim()) {
      setTab("act");
      return setErr("조치명을 적어 주세요.");
    }
    const orgs = { lead: lead.trim() || null, support: commaList(support).length ? commaList(support) : null, collab: commaList(collab).length ? commaList(collab) : null };
    const details: SopDetail[] = rows
      .filter((d) => d.title.trim())
      .map((d, i) => ({ seq: i + 1, title: d.title.trim(), ...(d.content.trim() ? { content: d.content.trim() } : {}), ...(d.note.trim() ? { note: d.note.trim() } : {}) }));
    const fields = {
      code: code.trim() || null,
      name: name.trim(),
      condition: cond.trim() || null,
      notes: lineList(notes).length ? lineList(notes) : null,
      orgs: orgs.lead || orgs.support || orgs.collab ? orgs : null,
    };
    // 카드 본문은 글을 고쳤을 때만 다시 만듦 (고치지 않으면 원래 블록 그대로)
    const textChanged = cardOn && cText !== initText.current;
    const cf = { code: cCode.trim() || fields.code || "", name: cName.trim() || fields.name, summary: cSum.trim() || null };
    const cardChanged = cardOn && (!card0 || textChanged || cf.code !== card0.code || cf.name !== card0.name || cf.summary !== (card0.summary ?? null));
    const blocks = textChanged ? textToBlocks(cText, card0?.blocks) : card0?.blocks ?? [];
    sop.saveEdits((e) => {
      // 행동카드
      let cardId = cardOn ? a.card : null;
      if (cardChanged) {
        const added = cardId ? e.addedCards?.find((c) => c.id === cardId) : undefined;
        const baseCard = cardId ? base.cards.find((c) => c.id === cardId) : undefined;
        if (baseCard) {
          const prev = e.cards?.[baseCard.id] ?? {};
          const p = {
            ...(cf.code !== baseCard.code ? { code: cf.code } : {}),
            ...(cf.name !== baseCard.name ? { name: cf.name } : {}),
            ...(cf.summary !== baseCard.summary ? { summary: cf.summary } : {}),
            ...(textChanged ? (!same(blocks, baseCard.blocks) ? { blocks } : {}) : prev.blocks ? { blocks: prev.blocks } : {}),
          };
          e.cards = { ...e.cards };
          if (Object.keys(p).length) e.cards[baseCard.id] = p;
          else delete e.cards[baseCard.id];
        } else if (added) {
          e.addedCards = e.addedCards!.map((c) => (c.id === added.id ? { ...c, ...cf, blocks, ...deriveCard(blocks), orgs: fields.orgs ?? c.orgs } : c));
        } else {
          const nc: SopCard = {
            id: newSopId("kx"), ...cf, blocks, phase: null, orgs: fields.orgs ?? { lead: null, support: null, collab: null }, link: null,
            pdfPage: 0, page: 0, pdfPages: [], ...deriveCard(blocks),
          };
          e.addedCards = [...(e.addedCards ?? []), nc];
          cardId = nc.id;
        }
      }
      const full: SopActionPatch = { ...fields, card: cardId, ...(own ? { details, detailsFrom: null } : {}) };
      const addedIdx = e.added?.findIndex((x) => x.id === a.id) ?? -1;
      if (isNew || addedIdx >= 0) {
        const cur = addedIdx >= 0 ? e.added![addedIdx] : a;
        const next: SopAction = { ...cur, ...full, details: own ? details : cur.details, detailsFrom: own ? null : cur.detailsFrom };
        delete next.edit;
        e.added = addedIdx >= 0 ? e.added!.map((x, k) => (k === addedIdx ? next : x)) : [...(e.added ?? []), next];
        return;
      }
      const b0 = base.actions.find((x) => x.id === a.id);
      if (!b0) return;
      const prevPatch = e.actions?.[a.id];
      const patch: SopActionPatch = {};
      (Object.keys(full) as (keyof SopActionPatch)[]).forEach((k) => {
        if (!same(full[k], b0[k as keyof SopAction])) (patch as Record<string, unknown>)[k] = full[k];
      });
      if (prevPatch?.deleted) patch.deleted = true;
      e.actions = { ...e.actions };
      if (Object.keys(patch).length) e.actions[a.id] = patch;
      else delete e.actions[a.id];
    }, `${isNew ? "조치 추가" : "조치 수정"}: ${actLabel(m, { code: fields.code, name: fields.name })}${cardChanged ? (card0 ? " · 행동카드 수정" : " · 행동카드 만듦") : ""}`);
    toast(isNew ? "조치를 추가했습니다." : "고친 내용을 저장했습니다.");
    onClose();
  };

  const g = m.groups.find((x) => x.id === a.group);
  return (
    <Modal
      wide
      title={isNew ? "조치 추가" : "조치 고치기"}
      sub={`${stepLabel(m, a.step)} · ${g?.name ?? ""}${a.fromCard ? " · 행동카드에만 있는 조치" : ""}`}
      onClose={onClose}
      foot={
        <>
          {err && <span className="xs" style={{ color: "var(--c-dang-dk)" }}>{err}</span>}
          <span className="sp" />
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn pri" onClick={save}>저장</button>
        </>
      }
    >
      <div className="modeSw sp-etabs" role="tablist">
        <button className={tab === "act" ? "on" : ""} role="tab" aria-selected={tab === "act"} onClick={() => setTab("act")}>조치</button>
        <button className={tab === "card" ? "on" : ""} role="tab" aria-selected={tab === "card"} onClick={() => setTab("card")}>행동카드{cardOn ? "" : " (없음)"}</button>
      </div>

      {tab === "act" && (
        <>
          <div className="frow"><span className="lb">코드</span><input className="input sm" value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: 3-1 (영천은 1-2-1처럼 숫자로)" style={{ maxWidth: 220 }} /></div>
          <div className="frow"><span className="lb">조치명 *</span><input className="input sm" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} /></div>
          <div className="frow">
            <span className="lb">필요시 조건</span>
            <div>
              <input className="input sm" value={cond} onChange={(e) => setCond(e.target.value)} placeholder="예: 필요시, 피해 발생 시, 태풍 북상 우려 시" style={{ width: "100%" }} />
              <div className="xs mute2" style={{ marginTop: 4 }}>조건을 적으면 순서와 관계없이 단계 끝 「필요시 임무」에 따로 보입니다. 비우면 순서대로 하는 조치입니다.</div>
            </div>
          </div>
          <div className="frow top">
            <span className="lb">세부행동</span>
            <div>
              {!own ? (
                <div className="notice" style={{ padding: "8px 12px" }}>
                  이 조치의 세부행동은 행동카드 본문을 그대로 보여 줍니다. 「행동카드」 탭에서 고치세요.
                  <button className="btn xs" style={{ marginLeft: 8 }} onClick={() => setOwn(true)}>세부행동 따로 적기</button>
                </div>
              ) : (
                <>
                  {rows.map((d, i) => (
                    <div key={i} className="sp-drow">
                      <span className="n">{i + 1}</span>
                      <div className="f">
                        <input className="input sm" value={d.title} placeholder="세부행동" onChange={(e) => setRow(i, { title: e.target.value })} />
                        <textarea className="input ta" rows={2} value={d.content} placeholder="세부내용 (선택)" onChange={(e) => setRow(i, { content: e.target.value })} />
                        <input className="input sm" value={d.note} placeholder="비고 (선택)" onChange={(e) => setRow(i, { note: e.target.value })} />
                      </div>
                      <div className="ops">
                        <button className="btn xs ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로"><IcUp size={14} /></button>
                        <button className="btn xs ghost" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="아래로"><IcDown size={14} /></button>
                        <button className="btn xs ghost" onClick={() => setRows((r) => r.filter((_, k) => k !== i))} aria-label="삭제"><IcX size={14} /></button>
                      </div>
                    </div>
                  ))}
                  <button className="btn xs line" onClick={() => setRows((r) => [...r, { title: "", content: "", note: "" }])}><IcPlus size={13} /> 세부행동 추가</button>
                </>
              )}
            </div>
          </div>
          <div className="frow top"><span className="lb">참고 (※)</span><textarea className="input ta" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="한 줄에 하나씩" /></div>
          <div className="frow"><span className="lb">주관부서</span><input className="input sm" value={lead} onChange={(e) => setLead(e.target.value)} /></div>
          <div className="frow"><span className="lb">지원부서</span><input className="input sm" value={support} onChange={(e) => setSupport(e.target.value)} placeholder="쉼표(,)로 구분" /></div>
          <div className="frow"><span className="lb">협업기관</span><input className="input sm" value={collab} onChange={(e) => setCollab(e.target.value)} placeholder="쉼표(,)로 구분" /></div>
          <p className="xs mute2" style={{ marginTop: 10 }}>※ 실명·전화번호는 적지 마세요. 연락처는 비상연락망에서 관리합니다.</p>
        </>
      )}

      {tab === "card" && (
        !cardOn ? (
          <div className="notice" style={{ marginTop: 12 }}>
            이 조치에는 행동카드가 없습니다. 개정 매뉴얼에 행동카드가 생겼다면 만들어 두세요.
            <div style={{ marginTop: 8 }}><button className="btn sm line" onClick={() => { setCardOn(true); setCText(""); }}><IcPlus size={13} /> 행동카드 만들기</button></div>
          </div>
        ) : (
          <>
            <div className="frow"><span className="lb">카드 코드</span><input className="input sm" value={cCode} onChange={(e) => setCCode(e.target.value)} style={{ maxWidth: 220 }} /></div>
            <div className="frow"><span className="lb">조치목록</span><input className="input sm" value={cName} onChange={(e) => setCName(e.target.value)} /></div>
            <div className="frow"><span className="lb">조치내용</span><input className="input sm" value={cSum} onChange={(e) => setCSum(e.target.value)} /></div>
            <div className="sp-cedit">
              <div>
                <div className="lb">카드 본문 <span className="xs mute2">— 개정 매뉴얼 글을 붙여 넣어도 됩니다</span></div>
                <textarea className="input ta mono" rows={16} value={cText} onChange={(e) => setCText(e.target.value)} spellCheck={false} />
                <div className="xs mute2 hint">
                  <b>1.</b> 번호 제목 · <b>○</b> 항목 · <b>-</b> 하위 항목 · <b>·</b> 세부 · <b>※</b> 설명 · <b>| 칸 | 칸 |</b> 표 (첫 줄 머리글, 엑셀에서 붙여 넣은 표도 됨, ⏎ = 칸 안 줄바꿈). 고치지 않은 표는 원래 모양(합친 칸)을 유지합니다.
                </div>
              </div>
              <div>
                <div className="lb">미리보기</div>
                <div className="pv"><CardBlocks blocks={preview} /></div>
              </div>
            </div>
          </>
        )
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- 임무 (이름·코드, 추가·삭제) */
export function MissionEditor({ mi, isNew, onClose }: { mi: SopMission; isNew?: boolean; onClose: () => void }) {
  const sop = useSop();
  const { toast } = useSession();
  const m = sop.editView ?? sop.manual!;
  const [name, setName] = useState(mi.name);
  const [code, setCode] = useState(mi.code ?? "");
  const [ask, setAsk] = useState(false);
  const n = m.actions.filter((a) => a.mission === mi.id && !a.deleted).length;
  const isAdded = isNew || !sop.base!.missions.some((x) => x.id === mi.id);
  const save = () => {
    if (!name.trim()) return;
    sop.saveEdits((e) => {
      const f = { name: name.trim(), code: code.trim() || null };
      if (isAdded) {
        const cur = e.addedMissions?.find((x) => x.id === mi.id);
        const next = { ...(cur ?? mi), ...f };
        delete next.edit;
        e.addedMissions = cur ? e.addedMissions!.map((x) => (x.id === mi.id ? next : x)) : [...(e.addedMissions ?? []), next];
        return;
      }
      const b0 = sop.base!.missions.find((x) => x.id === mi.id)!;
      const p = { ...(f.name !== b0.name ? { name: f.name } : {}), ...(f.code !== b0.code ? { code: f.code } : {}), ...(e.missions?.[mi.id]?.deleted ? { deleted: true } : {}) };
      e.missions = { ...e.missions };
      if (Object.keys(p).length) e.missions[mi.id] = p;
      else delete e.missions[mi.id];
    }, `${isNew ? "임무 추가" : "임무 수정"}: ${code.trim() ? `[${code.trim()}] ` : ""}${name.trim()}`);
    toast(isNew ? "임무를 추가했습니다. [+ 조치]로 조치를 넣으세요." : "임무를 고쳤습니다.");
    onClose();
  };
  const remove = () => {
    sop.saveEdits((e) => {
      if (isAdded) {
        e.addedMissions = (e.addedMissions ?? []).filter((x) => x.id !== mi.id);
        e.added = (e.added ?? []).filter((a) => a.mission !== mi.id);
      } else e.missions = { ...e.missions, [mi.id]: { ...e.missions?.[mi.id], deleted: true } };
    }, `임무 삭제: ${mi.name}`);
    toast("임무를 지웠습니다. 편집 화면에서 되살릴 수 있습니다.");
    onClose();
  };
  return (
    <Modal
      title={isNew ? "임무 추가" : "임무 고치기"}
      sub={`${stepLabel(m, mi.step)} · ${m.groups.find((g) => g.id === mi.group)?.name ?? ""}`}
      onClose={onClose}
      foot={
        <>
          {!isNew && (ask ? (
            <>
              <span className="xs" style={{ color: "var(--c-dang-dk)" }}>조치 {n}건도 함께 지웁니다.</span>
              <button className="btn sm danger" onClick={remove}>지우기</button>
              <button className="btn sm" onClick={() => setAsk(false)}>그만두기</button>
            </>
          ) : <button className="btn sm ghost" onClick={() => setAsk(true)}>임무 삭제</button>)}
          <span className="sp" />
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn pri" onClick={save} disabled={!name.trim()}>저장</button>
        </>
      }
    >
      <div className="frow"><span className="lb">임무 번호</span><input className="input sm" value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: 3 (없으면 비움)" style={{ maxWidth: 200 }} /></div>
      <div className="frow"><span className="lb">임무명 *</span><input className="input sm" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- 부서 칸 (조직 개편: 이름·내 부서) */
export function GroupEditor({ g, onClose }: { g: SopGroup; onClose: () => void }) {
  const sop = useSop();
  const { toast } = useSession();
  const b0 = sop.base!.groups.find((x) => x.id === g.id)!;
  const [name, setName] = useState(g.name);
  const [mine, setMine] = useState(g.mine);
  const save = () => {
    sop.saveEdits((e) => {
      const p = { ...(name.trim() && name.trim() !== b0.name ? { name: name.trim() } : {}), ...(mine !== b0.mine ? { mine } : {}) };
      e.groups = { ...e.groups };
      if (Object.keys(p).length) e.groups[g.id] = p;
      else delete e.groups[g.id];
    }, `부서 칸 수정: ${name.trim()}${mine !== b0.mine ? (mine ? " (내 부서로)" : " (내 부서에서 뺌)") : ""}`);
    toast("부서 칸을 고쳤습니다.");
    onClose();
  };
  return (
    <Modal
      title="부서 칸 고치기"
      sub={`${g.kind} · 조직 개편으로 부서 이름이 바뀌었을 때`}
      onClose={onClose}
      foot={<><span className="sp" /><button className="btn" onClick={onClose}>취소</button><button className="btn pri" onClick={save}>저장</button></>}
    >
      <div className="frow"><span className="lb">부서 이름</span><input className="input sm" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="frow">
        <span className="lb">내 부서</span>
        <label className="chk"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> 이 칸의 조치를 「내 부서」 체크리스트에 넣음</label>
      </div>
      {g.kind === "지휘부" && <p className="xs mute2">지휘부 칸은 보통 내 부서 체크리스트에 넣지 않습니다.</p>}
    </Modal>
  );
}

/* ---------------------------------------------------------------- 매뉴얼 개정 정보 · 단계 기준 · 대응 지침 */
const LEVELS: SopRecommend["level"][] = ["예비특보", "주의보", "경보", "해제"];

export function ManualEditor({ onClose }: { onClose: () => void }) {
  const sop = useSop();
  const { toast } = useSession();
  const m = sop.manual!;
  const base = sop.base!;
  const [edition, setEdition] = useState(m.info?.edition ?? "");
  const [revisedAt, setRevisedAt] = useState(m.info?.revisedAt ?? "");
  const [memo, setMemo] = useState(m.info?.memo ?? "");
  const [goals, setGoals] = useState<Record<SopStep, string>>(Object.fromEntries(m.steps.map((s) => [s.step, s.goals.join("\n")])) as Record<SopStep, string>);
  const [rec, setRec] = useState(Object.fromEntries(LEVELS.map((lv) => {
    const r = m.recommend.find((x) => x.level === lv);
    return [lv, { step: r?.step ?? "SIGN_DETECTION", basis: r?.basis ?? "" }];
  })) as Record<SopRecommend["level"], { step: SopStep; basis: string }>);
  const save = () => {
    sop.saveEdits((e) => {
      const info = { edition: edition.trim(), revisedAt: revisedAt.trim(), memo: memo.trim() };
      e.info = info.edition || info.revisedAt || info.memo ? info : undefined;
      e.steps = {};
      for (const s of base.steps) {
        const gl = lineList(goals[s.step] ?? "");
        if (!same(gl, s.goals)) e.steps[s.step] = { goals: gl };
      }
      e.recommend = {};
      for (const lv of LEVELS) {
        const b0 = base.recommend.find((x) => x.level === lv);
        const v = rec[lv];
        if (!b0 || v.step !== b0.step || v.basis.trim() !== b0.basis) e.recommend[lv] = { step: v.step, basis: v.basis.trim() };
      }
    }, "매뉴얼 개정 정보·단계 기준 수정");
    toast("매뉴얼 정보와 단계 기준을 저장했습니다.");
    onClose();
  };
  return (
    <Modal
      wide
      title="매뉴얼 개정 정보 · 단계 기준"
      sub={m.title}
      onClose={onClose}
      foot={<><span className="sp" /><button className="btn" onClick={onClose}>취소</button><button className="btn pri" onClick={save}>저장</button></>}
    >
      <h3 className="sp-eh">개정 정보</h3>
      <div className="frow"><span className="lb">개정판</span><input className="input sm" value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="예: 2027년 개정판" style={{ maxWidth: 280 }} /></div>
      <div className="frow"><span className="lb">개정일</span><input className="input sm" type="date" value={revisedAt} onChange={(e) => setRevisedAt(e.target.value)} style={{ maxWidth: 200 }} /></div>
      <div className="frow top"><span className="lb">개정 내용</span><textarea className="input ta" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="무엇이 바뀌었는지 (예: 조직 개편으로 부서명 변경, 3단계 조치 추가)" /></div>

      <h3 className="sp-eh">특보 → 대응단계 추천 기준</h3>
      <p className="xs mute2">특보가 발효되면 이 기준으로 단계를 추천합니다. 근거 문구는 단계 바에 보입니다.</p>
      {LEVELS.map((lv) => (
        <div key={lv} className="frow">
          <span className="lb">{lv === "해제" ? "특보 해제" : `${lv} 발효`}</span>
          <div className="sp-recrow">
            <select className="select sm" value={rec[lv].step} onChange={(e) => setRec((r) => ({ ...r, [lv]: { ...r[lv], step: e.target.value as SopStep } }))}>
              {SOP_STEPS.map((s, i) => <option key={s} value={s}>{i + 1}단계 {stepLabel(m, s)}</option>)}
            </select>
            <input className="input sm" value={rec[lv].basis} onChange={(e) => setRec((r) => ({ ...r, [lv]: { ...r[lv], basis: e.target.value } }))} placeholder="매뉴얼 근거 문구" />
          </div>
        </div>
      ))}

      <h3 className="sp-eh">단계별 대응 지침</h3>
      {m.steps.map((s) => (
        <div key={s.step} className="frow top">
          <span className="lb">{s.no}단계 {stepLabel(m, s.step)}</span>
          <textarea className="input ta" rows={3} value={goals[s.step]} onChange={(e) => setGoals((g) => ({ ...g, [s.step]: e.target.value }))} placeholder="한 줄에 하나씩" />
        </div>
      ))}
    </Modal>
  );
}

/* ---------------------------------------------------------------- 수정 이력 · 내보내기 · 가져오기 · 되돌리기 */
export function HistoryModal({ onClose }: { onClose: () => void }) {
  const sop = useSop();
  const { toast, account } = useSession();
  const m = sop.manual!;
  const e = sop.edits;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ e: SopEdits; file: string } | null>(null);
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState("");
  const n = editCount(e);

  const exportFile = () => {
    if (!e) return;
    const out = { ...e, title: m.title, exportedAt: new Date().toISOString(), exportedBy: account?.name ?? "" };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const el = document.createElement("a");
    el.href = url;
    el.download = `대응절차_수정본_${m.short.replace(/\s+/g, "")}_${ymd}.json`;
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("수정본 파일을 내려받았습니다. 다른 PC·담당자는 [가져오기]로 적용합니다.");
  };
  const pick = async (f: File | undefined) => {
    setErr("");
    if (!f) return;
    try {
      const j = JSON.parse(await f.text()) as SopEdits;
      if (j?.kind !== "safetyai.sop-edits" || !Array.isArray(j.log)) throw new Error("form");
      if (j.manualId !== m.id) return setErr(`다른 매뉴얼의 수정본입니다 (${(j as unknown as { title?: string }).title ?? j.manualId}).`);
      setPending({ e: j, file: f.name });
    } catch {
      setErr("대응절차 수정본 파일이 아닙니다. [내보내기]로 받은 .json 파일을 고르세요.");
    }
  };
  return (
    <Modal
      wide
      title="수정 이력"
      sub={`${m.title} · 수정 ${n}곳`}
      onClose={onClose}
      foot={
        <>
          <button className="btn sm" onClick={exportFile} disabled={!e}>내보내기</button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>가져오기</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(ev) => { pick(ev.target.files?.[0]); ev.target.value = ""; }} />
          <span className="sp" />
          {e && (ask ? (
            <>
              <span className="xs" style={{ color: "var(--c-dang-dk)" }}>수정 {n}곳과 이력이 모두 사라집니다.</span>
              <button className="btn sm danger" onClick={() => { sop.replaceEdits(null, ""); toast("원문 추출본으로 되돌렸습니다."); onClose(); }}>되돌리기</button>
              <button className="btn sm" onClick={() => setAsk(false)}>그만두기</button>
            </>
          ) : <button className="btn sm ghost" onClick={() => setAsk(true)}>원문 추출본으로 되돌리기</button>)}
          <button className="btn" onClick={onClose}>닫기</button>
        </>
      }
    >
      <div className="notice" style={{ marginBottom: 12 }}>
        고친 내용은 원문 추출본 위에 덧씌워 저장하며, 매뉴얼 PDF에서 뽑은 원문은 바뀌지 않습니다. 수정본은 서버에 저장되어 같은 기관 담당자가 함께 봅니다.
        <b>내보내기</b>·<b>가져오기</b>는 수정본을 파일로 보관하거나 옮길 때 씁니다.
      </div>
      {m.info && (m.info.edition || m.info.revisedAt || m.info.memo) && (
        <div className="sp-info">
          <b>개정 정보</b> {m.info.edition}{m.info.revisedAt ? ` · ${m.info.revisedAt}` : ""}
          {m.info.memo && <div className="xs mute2" style={{ marginTop: 2, whiteSpace: "pre-line" }}>{m.info.memo}</div>}
        </div>
      )}
      {err && <div className="notice danger" style={{ marginBottom: 10 }}>{err}</div>}
      {pending && (
        <div className="notice warn" style={{ marginBottom: 10 }}>
          <b>{pending.file}</b> — 수정 {editCount(pending.e)}곳{pending.e.log[0] ? `, 마지막 수정 ${fmt(pending.e.log[0].at)} ${pending.e.log[0].by}` : ""}.
          지금 수정본({n}곳)을 이 파일로 바꿀까요?
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <button className="btn sm pri" onClick={() => { sop.replaceEdits(pending.e, `수정본 가져오기: ${pending.file}`); setPending(null); toast("가져온 수정본을 적용했습니다."); }}>바꾸기</button>
            <button className="btn sm" onClick={() => setPending(null)}>그만두기</button>
          </div>
        </div>
      )}
      {e?.log.length ? (
        <table className="tbl sp-log">
          <thead><tr><th>일시</th><th>수정한 사람</th><th>내용</th></tr></thead>
          <tbody>
            {e.log.map((l, i) => (
              <tr key={i}><td className="nw">{fmt(l.at)}</td><td className="nw">{l.by}</td><td>{l.what}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="xs mute2">아직 고친 내용이 없습니다. 원문 추출본 그대로입니다.</p>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- 지난 상황 (D40) — [새 상황으로 시작] 때 보관한 체크, 마감 후 30일 보관 */
const KEEP_DAYS = 30;
const daysLeft = (endedAt: string) => Math.max(0, Math.ceil((new Date(endedAt).getTime() + KEEP_DAYS * 86_400_000 - Date.now()) / 86_400_000));
export function PastSituationsModal({ onClose }: { onClose: () => void }) {
  const sop = useSop();
  const m = sop.manual!;
  const [list, setList] = useState<CheckHistory[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    api<CheckHistory[]>(`/api/checks/history?prefix=${encodeURIComponent(`sop:${m.id}:`)}`)
      .then((r) => { setList(r); setOpen(r[0]?.id ?? null); })
      .catch(() => setErr("지난 상황을 불러오지 못했습니다."));
  }, [m.id]);
  return (
    <Modal wide title="지난 상황" sub={`${m.title} · 우리 기관`} onClose={onClose} foot={<><span className="sp" /><button className="btn" onClick={onClose}>닫기</button></>}>
      <div className="notice" style={{ marginBottom: 12 }}>
        [새 상황으로 시작]을 누를 때 그때까지의 체크를 상황 하나로 보관합니다. 어떤 조치를 누가·언제 했는지 상황별로 다시 볼 수 있습니다.
        <b> 보관한 상황은 마감 후 {KEEP_DAYS}일이 지나면 자동으로 삭제됩니다.</b> 오래 남겨야 하면 그 전에 화면을 캡처하거나 따로 기록해 두세요.
      </div>
      {err && <div className="notice danger">{err}</div>}
      {!list && !err && <div className="typing"><i /><i /><i /></div>}
      {list && !list.length && <p className="xs mute2">아직 보관한 상황이 없습니다.</p>}
      {list?.map((h) => (
        <div key={h.id} className="sp-info" style={{ marginBottom: 8 }}>
          <button className="lnk" style={{ fontWeight: 700 }} onClick={() => setOpen(open === h.id ? null : h.id)} aria-expanded={open === h.id}>
            {h.title || "이름 없는 상황"}
          </button>
          <span className="xs mute2"> · {h.startedAt ? fmt(h.startedAt) : "—"} ~ {fmt(h.endedAt)} · 체크 {h.items.length}건 · 마감 {h.by} · {daysLeft(h.endedAt)}일 뒤 삭제</span>
          {h.note && <div className="xs mute2" style={{ marginTop: 2 }}>{h.note}</div>}
          {open === h.id && (
            <table className="tbl sp-log" style={{ marginTop: 8 }}>
              <thead><tr><th>체크 시각</th><th>단계</th><th>조치</th><th>체크한 사람</th></tr></thead>
              <tbody>
                {h.items.map((i) => (
                  <tr key={i.key}><td className="nw">{fmt(i.at)}</td><td className="nw">{i.step || "—"}</td><td>{i.label || i.key}</td><td className="nw">{i.by}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </Modal>
  );
}

export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const fmt = fmtTime;

/* ---------------------------------------------------------------- 목록에서 바로 하는 수정 (순서·삭제·되살리기·추가) */
export function useSopEditOps() {
  const sop = useSop();
  const { toast } = useSession();
  const m = sop.editView;
  const base = sop.base;
  return {
    /** 같은 임무 안에서 위·아래 (필요시 임무끼리, 순서 임무끼리) */
    move(a: SopAction, d: -1 | 1) {
      if (!m) return;
      const list = m.actions.filter((x) => x.mission === a.mission);
      const ids = list.map((x) => x.id);
      const i = ids.indexOf(a.id);
      let j = i + d;
      while (j >= 0 && j < list.length && !!list[j].condition !== !!a.condition) j += d;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      sop.saveEdits((e) => {
        e.order = { ...e.order, [a.mission]: ids };
      }, `순서 바꿈: ${actLabel(m, a)} ${d < 0 ? "위로" : "아래로"}`);
    },
    remove(a: SopAction) {
      if (!m) return;
      sop.saveEdits((e) => {
        if (e.added?.some((x) => x.id === a.id)) e.added = e.added.filter((x) => x.id !== a.id);
        else e.actions = { ...e.actions, [a.id]: { ...e.actions?.[a.id], deleted: true } };
      }, `조치 삭제: ${actLabel(m, a)}`);
      toast(a.edit === "추가" ? "추가했던 조치를 지웠습니다." : "조치를 지웠습니다. 편집 화면에서 되살릴 수 있습니다.");
    },
    restore(a: SopAction) {
      if (!m) return;
      sop.saveEdits((e) => {
        const p = { ...e.actions?.[a.id] };
        delete p.deleted;
        e.actions = { ...e.actions };
        if (Object.keys(p).length) e.actions[a.id] = p;
        else delete e.actions[a.id];
        const mp = e.missions?.[a.mission];
        if (mp?.deleted) {
          const q = { ...mp };
          delete q.deleted;
          e.missions = { ...e.missions };
          if (Object.keys(q).length) e.missions[a.mission] = q;
          else delete e.missions[a.mission];
        }
      }, `조치 되살림: ${actLabel(m, a)}`);
    },
    restoreMission(mi: SopMission) {
      sop.saveEdits((e) => {
        const q = { ...e.missions?.[mi.id] };
        delete q.deleted;
        e.missions = { ...e.missions };
        if (Object.keys(q).length) e.missions[mi.id] = q;
        else delete e.missions[mi.id];
      }, `임무 되살림: ${mi.name}`);
    },
    /** 새 조치 초안 — 저장해야 수정본에 들어감 */
    draftAction(mi: SopMission): SopAction {
      const g = base?.groups.find((x) => x.id === mi.group);
      return {
        id: newSopId("x"), code: null, name: "", mission: mi.id, step: mi.step, group: mi.group, sub: mi.sub, condition: null, notes: null, changed: null,
        details: [], detailsFrom: null, summary: null, orgs: null, card: null, page: 0, pdfPage: 0, tablePage: g?.page ?? 0, tablePdfPage: g?.pdf ?? 0,
      };
    },
    draftMission(g: SopGroup, step: SopStep): SopMission {
      return { id: newSopId("xm"), code: null, name: "", step, group: g.id, sub: null, condition: null, notes: null };
    },
  };
}
