"use client";
/** 조직·담당자 — 왼쪽 조직 트리(추가·하위 조직·수정·삭제) + 오른쪽 고른 조직(하위 포함)의 담당자 표 */
import { useMemo, useState } from "react";
import { byTree, childrenMap, maskPhone, subtree, treeRank, UNIT_KIND, type Contact, type Unit, type UnitKind, type useContacts } from "@/lib/contacts";
import { IcChevD, IcEdit, IcPlus, IcTrash } from "../Icons";
import { ConfirmDelete, Modal, ShowNumbers, type Confirm } from "./ContactsUi";

type Api = ReturnType<typeof useContacts>;
type CEdit = { id?: string; unitId: string; name: string; title: string; duty: string; phone: string; email: string; office: string };
type UEdit = { id?: string; parentId: string | null; name: string; kind: UnitKind };

export default function People({ api, show, onToggleShow }: { api: Api; show: boolean; onToggleShow: () => void }) {
  const { bundle: b, canManage: can } = api;
  const kids = useMemo(() => childrenMap(b.units), [b.units]);
  const rank = useMemo(() => treeRank(b.units), [b.units]);
  const roots = kids.get(null) ?? [];
  const [selId, setSel] = useState("");
  const sel = b.units.find((u) => u.id === selId) ?? roots[0];
  const [ec, setEc] = useState<CEdit | null>(null);
  const [eu, setEu] = useState<UEdit | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const unitName = useMemo(() => new Map(b.units.map((u) => [u.id, u.name])), [b.units]);
  const list = useMemo(() => {
    const ids = new Set(sel ? subtree(b.units, sel.id) : []);
    return byTree(b.contacts.filter((c) => ids.has(c.unitId)), rank);
  }, [b, sel, rank]);
  const treeUnits = useMemo(() => [...b.units].sort((x, y) => (rank.get(x.id) ?? 0) - (rank.get(y.id) ?? 0)), [b.units, rank]);
  const depth = (u: Unit) => { let n = 0; for (let p = u.parentId; p; p = b.units.find((x) => x.id === p)?.parentId ?? null) n++; return n; };

  const done = async (p: Promise<string | null>, close: () => void) => { const e = await p; if (e) return setErr(e); setErr(null); close(); };
  const Row = ({ u, dp }: { u: Unit; dp: number }) => (
    <>
      <div className={`ct-tree ${sel?.id === u.id ? "on" : ""}`} style={{ paddingLeft: 10 + dp * 16 }} onClick={() => setSel(u.id)}>
        {(kids.get(u.id) ?? []).length > 0 ? <IcChevD size={13} /> : <span style={{ width: 13 }} />}
        <span className="nm">{u.name}</span>
        <span className="k">{UNIT_KIND[u.kind]}</span>
        {can && (
          <span className="ops" onClick={(e) => e.stopPropagation()}>
            <button className="btn xs ghost" title="하위 조직 추가" aria-label={`${u.name} 하위 조직 추가`} onClick={() => (setErr(null), setEu({ parentId: u.id, name: "", kind: "dept" }))}><IcPlus size={12} /></button>
            <button className="btn xs ghost" title="수정" aria-label={`${u.name} 수정`} onClick={() => (setErr(null), setEu({ id: u.id, parentId: u.parentId, name: u.name, kind: u.kind }))}><IcEdit size={12} /></button>
            <button className="btn xs ghost" title="삭제" aria-label={`${u.name} 삭제`} onClick={() => setConfirm({ title: "조직 삭제", message: `「${u.name}」 조직을 삭제할까요? 하위 조직이나 담당자가 있으면 삭제할 수 없습니다.`, run: () => api.deleteUnit(u.id) })}><IcTrash size={12} /></button>
          </span>
        )}
      </div>
      {(kids.get(u.id) ?? []).map((k) => <Row key={k.id} u={k} dp={dp + 1} />)}
    </>
  );

  return (
    <div className="ct-2col wide">
      <div className="ct-card ct-side">
        <div className="ct-hd">
          <h2>조직</h2>
          <span className="sp" />
          {can && <button className="btn xs" onClick={() => (setErr(null), setEu({ parentId: null, name: "", kind: "hq" }))}><IcPlus size={12} /> 조직 추가</button>}
        </div>
        {roots.map((u) => <Row key={u.id} u={u} dp={0} />)}
        {!roots.length && <div className="ct-empty">등록된 조직이 없습니다.</div>}
      </div>
      <div className="ct-card">
        <div className="ct-hd">
          <h2>{sel?.name ?? "전체"} <span className="cnt">{list.length}명</span></h2>
          <span className="sp" />
          <ShowNumbers show={show} onToggle={onToggleShow} />
          {can && sel && <button className="btn sm pri" onClick={() => (setErr(null), setEc({ unitId: sel.id, name: "", title: "", duty: "", phone: "", email: "", office: "" }))}><IcPlus size={13} /> 담당자 추가</button>}
        </div>
        {list.length === 0 ? (
          <div className="ct-empty">담당자가 없습니다.</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>이름</th><th>직위</th><th>소속</th><th>임무</th><th>휴대전화</th><th>사무실</th><th>이메일</th>{can && <th style={{ width: 84 }} />}</tr></thead>
            <tbody>
              {list.map((c: Contact) => (
                <tr key={c.id}>
                  <td className="b">{c.name}</td>
                  <td>{c.title}</td>
                  <td className="muted">{unitName.get(c.unitId)}</td>
                  <td className="muted">{c.duty}</td>
                  <td className="num">{c.phone ? maskPhone(c.phone, show) : <span className="mute2">없음</span>}</td>
                  <td className="num muted">{c.office || ""}</td>
                  <td className="muted">{c.email || <span className="mute2">없음</span>}</td>
                  {can && (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn xs ghost" aria-label={`${c.name} 수정`} title="수정" onClick={() => (setErr(null), setEc({ ...c, office: c.office ?? "" }))}><IcEdit size={13} /></button>
                      <button className="btn xs ghost" aria-label={`${c.name} 삭제`} title="삭제" onClick={() => setConfirm({ title: "담당자 삭제", message: `「${c.name}」 담당자를 삭제할까요? 전파그룹에서도 빠집니다.`, run: () => api.deleteContact(c.id) })}><IcTrash size={13} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {ec && (
        <Modal title={ec.id ? "담당자 수정" : "담당자 추가"} width={560} onClose={() => setEc(null)}
          foot={<>{err && <span className="ct-err">{err}</span>}<span className="sp" /><button className="btn" onClick={() => setEc(null)}>취소</button><button className="btn pri" onClick={() => done(api.saveContact(ec), () => setEc(null))}>저장</button></>}>
          <label className="frow"><span className="lb">소속 조직</span>
            <select className="select" value={ec.unitId} onChange={(e) => setEc({ ...ec, unitId: e.target.value })}>
              {treeUnits.map((u) => <option key={u.id} value={u.id}>{"　".repeat(depth(u))}{u.name}</option>)}
            </select>
          </label>
          {([["name", "이름", "필수"], ["title", "직위", "예: 팀장"], ["duty", "임무", "예: 상황보고"], ["phone", "휴대전화", "010-0000-0000 · 문자 수신"], ["email", "이메일", "name@example.go.kr"], ["office", "사무실 전화", "054-000-0000 · 선택"]] as const).map(([k, l, ph]) => (
            <label key={k} className="frow"><span className="lb">{l}</span><input className="input" placeholder={ph} value={ec[k]} onChange={(e) => setEc({ ...ec, [k]: e.target.value })} autoFocus={k === "name"} /></label>
          ))}
          <div className="xs mute2">휴대전화나 이메일 중 하나는 있어야 상황전파 대상으로 쓸 수 있습니다.</div>
        </Modal>
      )}
      {eu && (
        <Modal title={eu.id ? "조직 수정" : "조직 추가"} sub={eu.parentId && !eu.id ? `상위 조직 : ${unitName.get(eu.parentId)}` : undefined} width={480} onClose={() => setEu(null)}
          foot={<>{err && <span className="ct-err">{err}</span>}<span className="sp" /><button className="btn" onClick={() => setEu(null)}>취소</button><button className="btn pri" onClick={() => done(api.saveUnit(eu), () => setEu(null))}>저장</button></>}>
          <label className="frow"><span className="lb">조직명</span><input className="input" autoFocus value={eu.name} onChange={(e) => setEu({ ...eu, name: e.target.value })} /></label>
          <label className="frow"><span className="lb">종류</span>
            <select className="select" value={eu.kind} onChange={(e) => setEu({ ...eu, kind: e.target.value as UnitKind })}>
              {(Object.keys(UNIT_KIND) as UnitKind[]).map((k) => <option key={k} value={k}>{UNIT_KIND[k]}</option>)}
            </select>
          </label>
        </Modal>
      )}
      <ConfirmDelete c={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
