"use client";
/** 비상연락망 — 왼쪽 최상위 조직 목록 + 오른쪽 재난안전대책본부 조직도(본부 → 실무반 → 부서) · 조회 전용 */
import { useMemo, useState } from "react";
import { childrenMap, maskPhone, type Bundle, type Contact, type Unit } from "@/lib/contacts";
import { ShowNumbers } from "./ContactsUi";

export default function EmergencyTree({ b, show, onToggleShow }: { b: Bundle; show: boolean; onToggleShow: () => void }) {
  const kids = useMemo(() => childrenMap(b.units), [b.units]);
  const people = useMemo(() => {
    const m = new Map<string, Contact[]>();
    [...b.contacts].sort((x, y) => x.sort - y.sort).forEach((c) => m.set(c.unitId, [...(m.get(c.unitId) ?? []), c]));
    return m;
  }, [b.contacts]);
  const roots = kids.get(null) ?? [];
  const [selId, setSel] = useState("");
  const root = roots.find((r) => r.id === selId) ?? roots[0];

  return (
    <div className="ct-2col">
      <div className="ct-card ct-side">
        <h2>조직도</h2>
        {roots.map((r) => (
          <button key={r.id} className={`ct-item ${root?.id === r.id ? "on" : ""}`} onClick={() => setSel(r.id)}>{r.name}</button>
        ))}
      </div>
      {root && (
        <div className="ct-card ct-chartbox">
          <div className="ct-hd">
            <h2>{root.name}</h2>
            <span className="sp" />
            <ShowNumbers show={show} onToggle={onToggleShow} />
          </div>
          {root.kind === "hq" ? (
            <HqChart root={root} kids={kids} people={people} show={show} />
          ) : (
            <div className="ct-grid">
              {(kids.get(root.id) ?? []).map((u) => <DeptBox key={u.id} unit={u} people={people.get(u.id) ?? []} show={show} />)}
              {!(kids.get(root.id) ?? []).length && <DeptBox unit={root} people={people.get(root.id) ?? []} show={show} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HqChart({ root, kids, people, show }: { root: Unit; kids: Map<string | null, Unit[]>; people: Map<string, Contact[]>; show: boolean }) {
  const teams = kids.get(root.id) ?? [];
  const head = people.get(root.id) ?? [];
  return (
    <div className="ct-hq">
      <div className="ct-hq-top">
        <div className="nm">{root.name}</div>
        {head.length > 0 && <div className="pp">{head.map((p) => <PersonLine key={p.id} p={p} show={show} center />)}</div>}
      </div>
      {teams.length > 0 && (
        <>
          <div className="ct-vline" />
          <div className={`ct-teams ${teams.length > 5 ? "wrap" : ""}`} style={{ ["--n" as string]: teams.length }}>
            {teams.map((t) => (
              <div key={t.id} className="ct-team">
                <div className="ct-vline sm" />
                <div className="tn">{t.name}</div>
                {(people.get(t.id) ?? []).length > 0 && <div className="ct-box"><div className="bd">{people.get(t.id)!.map((p) => <PersonLine key={p.id} p={p} show={show} />)}</div></div>}
                {(kids.get(t.id) ?? []).map((dd) => <DeptBox key={dd.id} unit={dd} people={people.get(dd.id) ?? []} show={show} />)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DeptBox({ unit, people, show }: { unit: Unit; people: Contact[]; show: boolean }) {
  return (
    <div className="ct-box">
      <div className="hd">{unit.name}</div>
      <div className="bd">{people.length ? people.map((p) => <PersonLine key={p.id} p={p} show={show} />) : <div className="mute2">-</div>}</div>
    </div>
  );
}

function PersonLine({ p, show, center }: { p: Contact; show: boolean; center?: boolean }) {
  return (
    <div className={`ct-pl ${center ? "c" : ""}`}>
      <b>{p.name}</b>
      <span className="t">{p.title}</span>
      {p.office && <a href={`tel:${p.office}`} className="tel off" title="사무실">☎ {p.office}</a>}
      {p.phone && <a href={`tel:${p.phone}`} className="tel" title="휴대전화">{maskPhone(p.phone, show)}</a>}
    </div>
  );
}
