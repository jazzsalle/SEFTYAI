"use client";
/** 연락망 엑셀 — 현재 연락망 다운로드 · 일괄 업로드(미리 보기 → 등록, 창 안에 양식 다운로드) · report4 와 같은 방식 */
import { useMemo, useRef, useState } from "react";
import type { useContacts } from "@/lib/contacts";
import { downloadContactsXlsx, parseContactsXlsx, planImport, type ContactRow } from "@/lib/contactsXlsx";
import { IcDownload, IcUpload } from "../Icons";
import { Modal } from "./ContactsUi";

type Api = ReturnType<typeof useContacts>;

export default function ContactsExcel({ api, orgId, orgName }: { api: Api; orgId: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState("");
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [sync, setSync] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const plan = useMemo(() => (rows.length ? planImport(orgId, api.bundle, rows, sync) : null), [rows, sync, orgId, api.bundle]);

  const reset = () => (setFile(""), setRows([]), setErrors([]), setDone(null));
  const read = async (f: File | undefined) => {
    if (!f) return;
    reset();
    setFile(f.name);
    try {
      const r = await parseContactsXlsx(f);
      setRows(r.rows);
      setErrors(r.errors);
    } catch {
      setErrors(["엑셀 파일(.xlsx)을 읽을 수 없습니다."]);
    }
  };
  const submit = () => {
    if (!plan) return;
    const e = api.replace(plan.next);
    if (e) return setErrors([e]);
    const s = plan.stat;
    setDone(`추가 ${s.added}명 · 수정 ${s.updated}명${s.units ? ` · 새 조직 ${s.units}개` : ""}${s.groups ? ` · 새 전파그룹 ${s.groups}개` : ""}${s.removed ? ` · 삭제 ${s.removed}명` : ""}${s.removedUnits ? ` · 조직 삭제 ${s.removedUnits}개` : ""}`);
    setRows([]);
  };
  const del = sync && !!plan && (plan.stat.removed > 0 || plan.stat.removedUnits > 0);

  return (
    <>
      <button className="btn sm" onClick={() => downloadContactsXlsx(api.bundle, `연락망_${orgName}.xlsx`)}><IcDownload size={13} /> 엑셀 다운로드</button>
      {api.canManage && <button className="btn sm" onClick={() => (reset(), setOpen(true))}><IcUpload size={13} /> 엑셀 업로드</button>}
      {open && (
        <Modal title="연락망 엑셀 업로드" width={860} onClose={() => setOpen(false)}
          foot={<>
            {plan && <b className="xs">추가 {plan.stat.added} · 수정 {plan.stat.updated}{sync && <span style={{ color: plan.stat.removedRows.length ? "var(--c-dang)" : undefined }}> · 삭제 {plan.stat.removedRows.length}</span>}</b>}
            <span className="sp" />
            <button className="btn" onClick={() => setOpen(false)}>{done ? "닫기" : "취소"}</button>
            {!done && <button className={`btn ${del ? "danger" : "pri"}`} disabled={!plan} onClick={submit}>등록</button>}
          </>}>
          {done ? (
            <div className="ct-done">등록했습니다. {done}</div>
          ) : (
            <>
              <button className={`ct-drop ${over ? "on" : ""}`} onClick={() => input.current?.click()}
                onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files[0]); }}>
                <IcUpload size={24} />
                {file || "엑셀 파일을 끌어 놓거나 눌러서 고르세요"}
              </button>
              <button className="lnk" style={{ marginTop: 6 }} onClick={() => downloadContactsXlsx(null, "연락망_양식.xlsx")}><IcDownload size={13} /> 처음 등록한다면 양식 다운로드</button>
              <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="ct-modes">
                {([[false, "추가·수정만", "엑셀에 없는 담당자·조직은 그대로 둡니다"], [true, "엑셀과 똑같이 맞추기", "엑셀에서 지운 담당자·조직을 연락망에서도 지웁니다"]] as const).map(([v, l, dsc]) => (
                  <button key={l} className={`${sync === v ? (v ? "on danger" : "on") : ""}`} onClick={() => setSync(v)} aria-pressed={sync === v}><b>{l}</b><span>{dsc}</span></button>
                ))}
              </div>
              {errors.length > 0 && (
                <ul className="ct-errs">{errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}{errors.length > 8 && <li>외 {errors.length - 8}건</li>}</ul>
              )}
              {rows.length > 0 && plan && (
                <div className="ct-prev">
                  <table className="tbl">
                    <thead><tr><th /><th>상위 조직</th><th>조직(부서)</th><th>이름</th><th>직위</th><th>휴대전화</th><th>전파그룹</th></tr></thead>
                    <tbody>
                      {rows.map((r) => {
                        const k = plan.stat.rowKind[r.row];
                        return (
                          <tr key={r.row}>
                            <td><span className={`badge sq ${k === "수정" ? "warn" : k === "추가" ? "info" : "neutral"}`}>{k}</span></td>
                            <td>{r.upper}</td><td>{r.unit}</td><td className="b">{r.name}</td><td>{r.title}</td><td className="num">{r.phone}</td><td>{r.groups.join(", ")}</td>
                          </tr>
                        );
                      })}
                      {sync && plan.stat.removedRows.map((r, i) => (
                        <tr key={`del${i}`} className="del">
                          <td><span className="badge sq danger">삭제</span></td>
                          <td>{r.upper}</td><td style={{ textDecoration: r.name ? undefined : "line-through" }}>{r.unit}</td><td className="b" style={{ textDecoration: "line-through" }}>{r.name}</td><td>{r.title}</td><td className="num">{r.phone}</td><td />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
