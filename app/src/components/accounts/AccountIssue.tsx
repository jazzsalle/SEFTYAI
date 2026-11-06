"use client";
/** 계정 발급 화면 조각(R55) — 개발서버 nia_ai-account web IssueGrid·IssueResultPanel·StatusBadge·formatIssued 그대로(KRDS 대신 우리 표·단추) */
import { useMemo, useRef, useState } from "react";
import type { AccountMeta, IssuedAccount, IssueItem } from "@/lib/accountTypes";

const p2 = (n: number) => String(n).padStart(2, "0");
/** 발급 일시 — 「2026-10-23 15:08」(개발서버 formatIssued) */
export function formatIssued(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** 계정 상태(개발서버 StatusBadge) */
export function StatusBadge({ locked, mustChangePassword }: { locked: boolean; mustChangePassword: boolean }) {
  if (locked) return <span className="badge danger">잠김</span>;
  if (mustChangePassword) return <span className="badge warn">비밀번호 미변경</span>;
  return <span className="badge">정상</span>;
}

interface DraftRow { key: string; gradSn: number | ""; userId: string; teamSn: number | ""; memo: string }
let seq = 0;
const newRow = (): DraftRow => ({ key: `r${++seq}`, gradSn: "", userId: "", teamSn: "", memo: "" });

function matchGrade(meta: AccountMeta, raw?: string) {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  return meta.grades.find((g) => String(g.gradSn) === v)?.gradSn ?? meta.grades.find((g) => g.gradName === v)?.gradSn;
}
function matchTeam(meta: AccountMeta, raw?: string) {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  return meta.teams.find((t) => String(t.teamSn) === v)?.teamSn ?? meta.teams.find((t) => t.teamName === v)?.teamSn;
}

/** 엑셀 같은 발급 표(개발서버 IssueGrid) — 등급·ID·소속·비고를 줄 단위로, 한 번에 발급. 비밀번호는 서버가 만든다 */
export function IssueGrid({ meta, takenIds, busy, onSubmit }: { meta: AccountMeta; takenIds: Set<string>; busy: boolean; onSubmit: (items: IssueItem[]) => Promise<string[]> }) {
  const [rows, setRows] = useState<DraftRow[]>(() => [newRow(), newRow(), newRow()]);
  const focusedRow = useRef(0);
  const idRegex = useMemo(() => new RegExp(meta.rules.idPattern), [meta.rules.idPattern]);

  /** 소속은 등급이 정한다 — 하나뿐이면 저절로 정하고 칸을 잠근다 */
  const teamsOf = (gradSn: number | "") => {
    if (gradSn === "") return [];
    const sns = meta.grades.find((g) => g.gradSn === gradSn)?.teamSns ?? [];
    return meta.teams.filter((t) => sns.includes(t.teamSn));
  };
  const teamForGrade = (gradSn: number | "", current: number | ""): number | "" => {
    const allowed = teamsOf(gradSn);
    if (allowed.length === 1) return allowed[0].teamSn;
    return allowed.some((t) => t.teamSn === current) ? current : "";
  };
  const isBlank = (r: DraftRow) => !r.userId.trim() && r.gradSn === "" && r.teamSn === "" && !r.memo.trim();

  function rowError(row: DraftRow, index: number): string | null {
    if (isBlank(row)) return null;
    const id = row.userId.trim();
    if (!id) return "ID를 입력하십시오.";
    if (!idRegex.test(id)) return `ID는 ${meta.rules.idMinLength}~${meta.rules.idMaxLength}자, ${meta.rules.idPatternText} 만 쓸 수 있습니다.`;
    if (takenIds.has(id.toLowerCase())) return "이미 쓰고 있는 ID입니다.";
    if (rows.some((o, i) => i < index && o.userId.trim().toLowerCase() === id.toLowerCase())) return "위 줄과 ID가 겹칩니다.";
    if (row.gradSn === "") return "등급을 고르십시오.";
    if (row.teamSn === "") return teamsOf(row.gradSn).length > 1 ? "소속을 고르십시오." : "이 등급에 쓸 수 있는 소속이 없습니다.";
    if (row.memo.length > 1000) return "비고는 1000자를 넘을 수 없습니다.";
    return null;
  }

  const errors = rows.map(rowError);
  const filled = rows.filter((r) => !isBlank(r));
  const canSubmit = filled.length > 0 && errors.every((e) => e === null) && !busy;
  const patch = (key: string, part: Partial<DraftRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...part } : r)));

  /** 엑셀에서 복사한 영역(탭·줄바꿈) — 열 순서: 등급 · ID · 소속 · 비고 */
  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
    const start = focusedRow.current;
    setRows((prev) => {
      const next = [...prev];
      lines.forEach((line, i) => {
        const [g, id, t, memo] = line.split("\t");
        const at = start + i;
        while (next.length <= at) next.push(newRow());
        const gradSn = matchGrade(meta, g) ?? next[at].gradSn;
        const pastedTeam = matchTeam(meta, t) ?? next[at].teamSn;
        // 붙여넣은 소속도 등급 규칙을 벗어나면 버린다. 하나뿐인 등급은 저절로 채워진다
        next[at] = { ...next[at], gradSn, userId: (id ?? "").trim() || next[at].userId, teamSn: teamForGrade(gradSn, pastedTeam), memo: (memo ?? "").trim() || next[at].memo };
      });
      if (next.every((r) => !isBlank(r))) next.push(newRow());
      return next;
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    const failed = new Set(await onSubmit(filled.map((r) => ({ gradSn: Number(r.gradSn), userId: r.userId.trim(), teamSn: Number(r.teamSn), memo: r.memo.trim() || null }))));
    // 성공한 줄은 비우고 실패한 줄만 남겨 고칠 수 있게 한다
    setRows((prev) => {
      const keep = prev.filter((r) => isBlank(r) || failed.has(r.userId.trim()));
      return keep.length > 0 ? keep : [newRow(), newRow(), newRow()];
    });
  }

  return (
    <>
      <div className="adm-scroll acc-grid" onPaste={handlePaste}>
        <table className="tbl adm-tbl">
          <caption className="sr-only">발급할 계정을 줄 단위로 입력하는 표</caption>
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col">등급</th>
              <th scope="col">아이디</th>
              <th scope="col">소속</th>
              <th scope="col">비고</th>
              <th scope="col"><span className="sr-only">줄 지우기</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const teams = teamsOf(row.gradSn);
              return (
                <tr key={row.key} className={errors[i] ? "acc-row-err" : undefined}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <select className="input sm" aria-label={`${i + 1}번 줄 등급`} value={row.gradSn} disabled={busy} aria-invalid={!!errors[i]}
                      onChange={(e) => { const v = e.target.value === "" ? "" : Number(e.target.value); patch(row.key, { gradSn: v, teamSn: teamForGrade(v, row.teamSn) }); }}>
                      <option value="">선택</option>
                      {meta.grades.map((g) => <option key={g.gradSn} value={g.gradSn}>{g.gradName}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="text" className="input sm" aria-label={`${i + 1}번 줄 아이디`} placeholder="영문·숫자·_·-" value={row.userId} disabled={busy}
                      onFocus={() => (focusedRow.current = i)} onChange={(e) => patch(row.key, { userId: e.target.value })} />
                  </td>
                  <td>
                    <select className="input sm" aria-label={`${i + 1}번 줄 소속`} value={row.teamSn} disabled={busy || teams.length <= 1} aria-invalid={!!errors[i]}
                      onChange={(e) => patch(row.key, { teamSn: e.target.value === "" ? "" : Number(e.target.value) })}>
                      <option value="">{row.gradSn === "" ? "등급을 먼저" : "선택"}</option>
                      {teams.map((t) => <option key={t.teamSn} value={t.teamSn}>{t.teamName}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="text" className="input sm" aria-label={`${i + 1}번 줄 비고`} value={row.memo} disabled={busy}
                      onFocus={() => (focusedRow.current = i)} onChange={(e) => patch(row.key, { memo: e.target.value })} />
                  </td>
                  <td className="num">
                    <button type="button" className="btn xs ghost" aria-label={`${i + 1}번 줄 지우기`} disabled={busy}
                      onClick={() => setRows((p) => (p.length > 1 ? p.filter((x) => x.key !== row.key) : [newRow()]))}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {errors.some(Boolean) && (
        <ul className="acc-errs">{errors.map((e, i) => (e ? <li key={i}>{i + 1}번 줄 — {e}</li> : null))}</ul>
      )}
      <div className="acc-btns">
        <button type="button" className="btn sm" disabled={busy} onClick={() => setRows((p) => [...p, newRow()])}>줄 추가</button>
        <button type="button" className="btn sm pri" disabled={!canSubmit} onClick={handleSubmit}>{busy ? "발급 중…" : `${filled.length}건 발급`}</button>
      </div>
    </>
  );
}

/** 발급 결과(개발서버 IssueResultPanel) — 비밀번호는 이 화면에서만 볼 수 있다(저장된 것은 해시뿐이라 다시 꺼낼 수 없다) */
export function IssueResultPanel({ results, onClose }: { results: IssuedAccount[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  async function copyAll() {
    try {
      await navigator.clipboard.writeText(ok.map((r) => `${r.userId}\t${r.password}`).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section className="adm-sec acc-result" aria-labelledby="acc-result-title" style={{ marginTop: 0, marginBottom: 16 }}>
      <div className="acc-result-h">
        <h2 id="acc-result-title">발급 결과 — 성공 {ok.length} · 실패 {failed.length}</h2>
        <span className="sp" />
        <button type="button" className="btn sm" onClick={onClose}>닫기</button>
      </div>
      {ok.length > 0 && (
        <div className="adm-scroll acc-list">
          <table className="tbl adm-tbl">
            <caption className="sr-only">발급된 아이디와 비밀번호</caption>
            <thead><tr><th scope="col">아이디</th><th scope="col">비밀번호</th></tr></thead>
            <tbody>
              {ok.map((r) => (
                <tr key={r.userId}><td><code>{r.userId}</code></td><td className="acc-pw">{r.password}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="acc-warn">비밀번호는 <strong>지금 이 화면에서만</strong> 볼 수 있습니다. 다시 열 수 없으니 지금 전달하세요.</p>
      {ok.length > 0 && (
        <div className="acc-btns">
          <button type="button" className="btn sm" onClick={copyAll}>{copied ? "복사했습니다" : "전체 복사 (아이디⇥비밀번호)"}</button>
        </div>
      )}
      {failed.length > 0 && (
        <ul className="acc-errs">{failed.map((r) => <li key={r.row}>{r.row}번 줄 {r.userId} — {r.error}</li>)}</ul>
      )}
    </section>
  );
}
