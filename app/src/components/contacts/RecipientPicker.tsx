"use client";
/** 전파 대상 선택 — 전파그룹 / 조직·부서(하위 포함) / 담당자(검색) · 합쳐서 같은 사람은 한 번만 */
import { useMemo, useState } from "react";
import { childrenMap, recipientIds, resolveRecipients, subtree, type Bundle, type Selection } from "@/lib/contacts";
import { IcCheck, IcChevD, IcChevR, IcOrg, IcSearch, IcUser, IcUsers, IcX } from "../Icons";
import { Modal } from "./ContactsUi";

const toggle = (l: string[], id: string) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);

/** 고른 대상 칩 (그룹·조직·담당자) */
export function SelectionChips({ b, sel, onRemove }: { b: Bundle; sel: Selection; onRemove?: (k: keyof Selection, id: string) => void }) {
  const items = [
    ...b.groups.filter((g) => sel.groupIds.includes(g.id)).map((g) => ({ k: "groupIds" as const, id: g.id, ic: <IcUsers size={13} />, label: `${g.name} ${g.memberIds.length}명` })),
    ...b.units.filter((u) => sel.unitIds.includes(u.id)).map((u) => ({ k: "unitIds" as const, id: u.id, ic: <IcOrg size={13} />, label: u.name })),
    ...b.contacts.filter((c) => sel.contactIds.includes(c.id)).map((c) => ({ k: "contactIds" as const, id: c.id, ic: <IcUser size={13} />, label: `${c.name} ${c.title}`.trim() })),
  ];
  if (!items.length) return null;
  return (
    <div className="ct-chips">
      {items.map((it) => (
        <span key={it.k + it.id} className="ct-chip">
          {it.ic}{it.label}
          {onRemove && <button aria-label={`${it.label} 빼기`} onClick={() => onRemove(it.k, it.id)}><IcX size={12} /></button>}
        </span>
      ))}
    </div>
  );
}

export default function RecipientPicker({ b, value, onClose, onSave }: { b: Bundle; value: Selection; onClose: () => void; onSave: (s: Selection) => void }) {
  const [sel, setSel] = useState<Selection>(value);
  const [way, setWay] = useState<"group" | "unit" | "person">("group");
  const [q, setQ] = useState("");
  const kids = useMemo(() => childrenMap(b.units), [b.units]);
  const [open, setOpen] = useState<Set<string>>(() => new Set((kids.get(null) ?? []).map((u) => u.id)));
  const unitName = useMemo(() => new Map(b.units.map((u) => [u.id, u.name])), [b.units]);
  const total = resolveRecipients(b, sel).length;
  const viaOthers = recipientIds(b, { ...sel, contactIds: [] });
  const people = b.contacts.filter((c) => !q.trim() || `${c.name} ${c.title} ${c.duty} ${unitName.get(c.unitId) ?? ""}`.includes(q.trim()));
  const count = (id: string) => { const s = new Set(subtree(b.units, id)); return b.contacts.filter((c) => s.has(c.unitId)).length; };
  const toggleUnit = (id: string) =>
    setSel((s) => {
      if (s.unitIds.includes(id)) return { ...s, unitIds: s.unitIds.filter((x) => x !== id) };
      const sub = new Set(subtree(b.units, id)); // 상위 조직을 고르면 하위 조직 개별 선택은 정리
      return { ...s, unitIds: [...s.unitIds.filter((x) => !sub.has(x)), id] };
    });

  const UnitRow = ({ id, dp, inherited }: { id: string; dp: number; inherited: boolean }) => {
    const u = b.units.find((x) => x.id === id)!;
    const ks = kids.get(id) ?? [];
    const n = count(id);
    const on = inherited || sel.unitIds.includes(id);
    return (
      <>
        <div className="ct-urow" style={{ paddingLeft: dp * 20 }}>
          <button className="tg" style={{ visibility: ks.length ? "visible" : "hidden" }} onClick={() => setOpen((o) => { const x = new Set(o); if (x.has(id)) x.delete(id); else x.add(id); return x; })} aria-label="펼치기">
            {open.has(id) ? <IcChevD size={14} /> : <IcChevR size={14} />}
          </button>
          <label className={inherited ? "inh" : ""}>
            <input type="checkbox" checked={on} disabled={inherited || !n} onChange={() => toggleUnit(id)} />
            <b>{u.name}</b><span className="sp" /><span className="mute2">{n}명</span>
          </label>
        </div>
        {open.has(id) && ks.map((k) => <UnitRow key={k.id} id={k.id} dp={dp + 1} inherited={on} />)}
      </>
    );
  };

  return (
    <Modal title="전파 대상 선택" width={760} onClose={onClose}
      foot={<><b style={{ fontSize: "var(--fs-s)" }}>수신 {total}명</b><span className="sp" /><button className="btn" onClick={onClose}>취소</button><button className="btn pri" onClick={() => onSave(sel)}>적용</button></>}>
      {b.contacts.length === 0 && <div className="notice warn" style={{ marginBottom: 12 }}>등록된 연락망이 없습니다. <a className="lnk" href="/contacts">연락망 관리</a></div>}
      <div style={{ marginBottom: 12 }}><SelectionChips b={b} sel={sel} onRemove={(k, id) => setSel((s) => ({ ...s, [k]: s[k].filter((x) => x !== id) }))} /></div>
      <div className="subtabs" style={{ marginTop: 0 }}>
        <button className={way === "group" ? "on" : ""} onClick={() => setWay("group")}>전파그룹</button>
        <button className={way === "unit" ? "on" : ""} onClick={() => setWay("unit")}>조직·부서</button>
        <button className={way === "person" ? "on" : ""} onClick={() => setWay("person")}>담당자</button>
      </div>
      <div className="ct-pickbox">
        {way === "group" && (
          <div className="ct-ggrid">
            {b.groups.map((g) => {
              const on = sel.groupIds.includes(g.id);
              return (
                <button key={g.id} className={`ct-gbtn ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setSel((s) => ({ ...s, groupIds: toggle(s.groupIds, g.id) }))}>
                  {on ? <IcCheck size={14} /> : <IcUsers size={14} />}<span className="sp">{g.name}</span><span>{g.memberIds.length}명</span>
                </button>
              );
            })}
            {!b.groups.length && <div className="ct-empty">등록된 전파그룹이 없습니다.</div>}
          </div>
        )}
        {way === "unit" && (kids.get(null) ?? []).map((u) => <UnitRow key={u.id} id={u.id} dp={0} inherited={false} />)}
        {way === "person" && (
          <>
            <div className="ct-search"><IcSearch size={14} /><input className="input" placeholder="이름·직위·부서 검색" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
            {people.map((c) => (
              <label key={c.id} className={`ct-prow ${viaOthers.has(c.id) ? "inh" : ""}`}>
                <input type="checkbox" checked={viaOthers.has(c.id) || sel.contactIds.includes(c.id)} disabled={viaOthers.has(c.id)} onChange={() => setSel((s) => ({ ...s, contactIds: toggle(s.contactIds, c.id) }))} />
                <b>{c.name}</b><span>{c.title}</span><span className="sp" /><span className="mute2">{unitName.get(c.unitId)}</span>
              </label>
            ))}
            {!people.length && <div className="ct-empty">찾는 담당자가 없습니다.</div>}
          </>
        )}
      </div>
    </Modal>
  );
}
