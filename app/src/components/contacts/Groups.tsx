"use client";
/** 전파그룹 — 왼쪽 그룹 목록 + 오른쪽 구성원 · 그룹 추가·수정(담당자 체크)·삭제 */
import { useMemo, useState } from "react";
import { byTree, treeRank, type Contact, type useContacts } from "@/lib/contacts";
import { IcEdit, IcPlus, IcSearch, IcTrash } from "../Icons";
import { ConfirmDelete, Modal, type Confirm } from "./ContactsUi";

type Api = ReturnType<typeof useContacts>;

export default function Groups({ api }: { api: Api }) {
  const { bundle: b, canManage: can } = api;
  const rank = useMemo(() => treeRank(b.units), [b.units]);
  const byId = useMemo(() => new Map(b.contacts.map((c) => [c.id, c])), [b.contacts]);
  const unitName = useMemo(() => new Map(b.units.map((u) => [u.id, u.name])), [b.units]);
  const [selId, setSel] = useState("");
  const g = b.groups.find((x) => x.id === selId) ?? b.groups[0];
  const members = g ? byTree(g.memberIds.map((id) => byId.get(id)).filter((c): c is Contact => !!c), rank) : [];
  const [edit, setEdit] = useState<{ id?: string; name: string; memberIds: string[] } | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const treeUnits = useMemo(() => [...b.units].sort((x, y) => (rank.get(x.id) ?? 0) - (rank.get(y.id) ?? 0)), [b.units, rank]);

  return (
    <div className="ct-2col">
      <div className="ct-card ct-side">
        <div className="ct-hd">
          <h2>전파그룹</h2>
          <span className="sp" />
          {can && <button className="btn xs" onClick={() => (setErr(null), setQ(""), setEdit({ name: "", memberIds: [] }))}><IcPlus size={12} /> 그룹 추가</button>}
        </div>
        {b.groups.map((x) => (
          <button key={x.id} className={`ct-item ${g?.id === x.id ? "on" : ""}`} onClick={() => setSel(x.id)}>
            <span className="sp">{x.name}</span><span className="cnt">{x.memberIds.length}명</span>
          </button>
        ))}
        {!b.groups.length && <div className="ct-empty">등록된 전파그룹이 없습니다.</div>}
      </div>
      {g && (
        <div className="ct-card">
          <div className="ct-hd">
            <h2>{g.name} <span className="cnt">{g.memberIds.length}명</span></h2>
            <span className="sp" />
            {can && (
              <>
                <button className="btn sm" onClick={() => (setErr(null), setQ(""), setEdit({ id: g.id, name: g.name, memberIds: g.memberIds }))}><IcEdit size={13} /> 수정</button>
                <button className="btn sm" onClick={() => setConfirm({ title: "전파그룹 삭제", message: `「${g.name}」 그룹을 삭제할까요? 담당자는 연락망에 그대로 남습니다.`, run: () => api.deleteGroup(g.id) })}><IcTrash size={13} /> 삭제</button>
              </>
            )}
          </div>
          {members.length === 0 ? (
            <div className="ct-empty">구성원이 없습니다.</div>
          ) : (
            <table className="tbl">
              <thead><tr><th>이름</th><th>직위</th><th>소속</th><th>임무</th></tr></thead>
              <tbody>{members.map((c) => <tr key={c.id}><td className="b">{c.name}</td><td>{c.title}</td><td className="muted">{unitName.get(c.unitId)}</td><td className="muted">{c.duty}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
      {edit && (
        <Modal title={edit.id ? "전파그룹 수정" : "전파그룹 추가"} width={720} onClose={() => setEdit(null)}
          foot={<>{err && <span className="ct-err">{err}</span>}<span className="xs mute2">{edit.memberIds.length}명 선택</span><span className="sp" /><button className="btn" onClick={() => setEdit(null)}>취소</button><button className="btn pri" onClick={async () => { const e = await api.saveGroup(edit); if (e) setErr(e); else setEdit(null); }}>저장</button></>}>
          <label className="frow"><span className="lb">그룹명</span><input className="input" autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
          <div className="ct-search"><IcSearch size={14} /><input className="input" placeholder="이름·직위·부서 검색" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="ct-pick">
            {treeUnits.map((u) => {
              const ps = b.contacts.filter((c) => c.unitId === u.id && (!q.trim() || `${c.name} ${c.title} ${c.duty} ${u.name}`.includes(q.trim())));
              if (!ps.length) return null;
              const all = ps.every((c) => edit.memberIds.includes(c.id));
              return (
                <div key={u.id} className="ct-pick-u">
                  <label className="hd"><input type="checkbox" checked={all} onChange={() => setEdit({ ...edit, memberIds: all ? edit.memberIds.filter((m) => !ps.some((c) => c.id === m)) : [...new Set([...edit.memberIds, ...ps.map((c) => c.id)])] })} /> {u.name}</label>
                  <div className="ps">
                    {ps.map((c) => (
                      <label key={c.id}>
                        <input type="checkbox" checked={edit.memberIds.includes(c.id)} onChange={(e) => setEdit({ ...edit, memberIds: e.target.checked ? [...edit.memberIds, c.id] : edit.memberIds.filter((m) => m !== c.id) })} />
                        {c.name} <span className="mute2">{c.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
      <ConfirmDelete c={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
