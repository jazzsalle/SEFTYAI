"use client";
/**
 * 계정 발급 (R55) — 개발서버 계정 발급 사이트(nia_ai-account web · AccountListPage·IssueGrid·IssueResultPanel·StatusBadge) 를 우리 화면 안으로
 *  · 계정 발급자(등급 0 — issuer)만. 새 계정 발급(엑셀 같은 표 · 붙여넣기 · 비밀번호는 서버가 만듦) · 발급 결과(비밀번호는 이 화면에서만, 전체 복사)
 *    · 계정 목록(등급·아이디·소속·비고·상태·발급·관리 — 비밀번호 재발급·잠금 해제·폐기)
 *  · 다르게 둔 것: 고정 7계정은 재발급·폐기 단추가 없다(시연·로그인 화면이 쓰는 계정), 잠금은 15분 뒤 저절로도 풀린다
 *  · 비밀번호는 화면 상태에만 두고(저장소·주소에 남기지 않음) [닫기]·화면을 떠나면 사라진다
 */
import "../admin/admin.css";
import "./accounts.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { AccountMeta, AccountSummary, IssuedAccount, IssueItem, IssueResponse } from "@/lib/accountTypes";
import { IssueGrid, IssueResultPanel, StatusBadge, formatIssued } from "@/components/accounts/AccountIssue";

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
export default function AccountsPage() {
  const { ready, account } = useSession();
  const issuer = account?.grade === 0;
  const [meta, setMeta] = useState<AccountMeta | null>(null);
  const [rows, setRows] = useState<AccountSummary[]>([]);
  const [results, setResults] = useState<IssuedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await api<{ meta: AccountMeta; accounts: AccountSummary[] }>("/api/accounts");
      setMeta(r.meta);
      setRows(r.accounts);
      setError(null);
    } catch (e) {
      setError(errMsg(e, "목록을 읽지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (issuer) void reload();
  }, [issuer, reload]);

  // ID 중복 검사에는 숨긴 계정(자기 계정)도 넣는다
  const takenIds = useMemo(() => new Set(rows.map((r) => r.userId.toLowerCase())), [rows]);
  // 발급자 자신의 계정은 목록에 내지 않는다(개발서버와 같음) — 자기 비밀번호는 사용자 메뉴 [비밀번호 변경]
  const visible = useMemo(() => rows.filter((r) => r.userId !== account?.id), [rows, account?.id]);

  async function handleIssue(items: IssueItem[]): Promise<string[]> {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const r = await api<IssueResponse>("/api/accounts", { method: "POST", json: { items } });
      setResults(r.results);
      await reload();
      return r.results.filter((x) => !x.ok).map((x) => x.userId);
    } catch (e) {
      setError(errMsg(e, "발급하지 못했습니다."));
      return items.map((i) => i.userId);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(row: AccountSummary) {
    if (!window.confirm(`${row.userId} (${row.gradName}) 계정을 지울까요?\n되돌릴 수 없습니다.`)) return;
    try {
      await api(`/api/accounts/${encodeURIComponent(row.userId)}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      setError(errMsg(e, "지우지 못했습니다."));
    }
  }

  async function handleReset(row: AccountSummary) {
    if (!window.confirm(`${row.userId} 의 비밀번호를 새로 만들까요?\n기존 비밀번호는 쓸 수 없게 되고, 받는 사람은 첫 로그인에서 다시 바꿔야 합니다.`)) return;
    try {
      setResults([await api<IssuedAccount>(`/api/accounts/${encodeURIComponent(row.userId)}/password`, { method: "POST" })]);
      await reload();
    } catch (e) {
      setError(errMsg(e, "재발급하지 못했습니다."));
    }
  }

  async function handleUnlock(row: AccountSummary) {
    try {
      await api(`/api/accounts/${encodeURIComponent(row.userId)}/unlock`, { method: "POST" });
      await reload();
    } catch (e) {
      setError(errMsg(e, "잠금을 풀지 못했습니다."));
    }
  }

  if (!ready || !account) return null;
  if (!issuer)
    return (
      <div className="page">
        <div className="page-in">
          <div className="ph"><div><h1>계정 발급</h1></div></div>
          <div className="notice danger" role="alert">계정 발급은 계정 발급자만 이용할 수 있습니다.</div>
        </div>
      </div>
    );

  return (
    <div className="page adm acc-page">
      <div className="page-in">
        <div className="ph">
          <div>
            <h1>계정 발급</h1>
            <p>재난안전 AI데이터 활용 서비스 · 계정 발급자 전용</p>
          </div>
        </div>

        {error && <div className="notice danger" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
        {results && <IssueResultPanel results={results} onClose={() => setResults(null)} />}

        {loading || !meta ? (
          <p className="adm-empty">불러오는 중…</p>
        ) : (
          <>
            <section className="adm-sec" style={{ marginTop: 0 }}>
              <h2>새 계정 발급</h2>
              <p className="adm-note" style={{ marginTop: 0 }}>
                등급·아이디·소속을 넣으면 비밀번호는 자동으로 만들어집니다. 엑셀에서 「등급·아이디·소속·비고」 순서로 복사해 표에 붙여넣을 수 있습니다.
                <br />
                아이디는 {meta.rules.idMinLength}자 이상 · {meta.rules.idPatternText} · 비밀번호는 {meta.rules.passwordRuleText}
              </p>
              <IssueGrid meta={meta} takenIds={takenIds} busy={busy} onSubmit={handleIssue} />
            </section>

            <section className="adm-sec">
              <details open className="acc-fold">
                <summary><h2>계정 목록 <small>({visible.length})</small></h2></summary>
                <div className="adm-scroll acc-list">
                  <table className="tbl adm-tbl">
                    <caption className="sr-only">발급된 계정 목록</caption>
                    <thead>
                      <tr>
                        <th scope="col">등급</th>
                        <th scope="col">아이디</th>
                        <th scope="col">소속</th>
                        <th scope="col">비고</th>
                        <th scope="col">상태</th>
                        <th scope="col">발급</th>
                        <th scope="col">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 && (
                        <tr><td colSpan={7} className="adm-empty">아직 발급한 계정이 없습니다.</td></tr>
                      )}
                      {visible.map((row) => (
                        <tr key={row.userId}>
                          <td className="nowrap">{row.gradName}</td>
                          <td><code>{row.userId}</code></td>
                          <td>{row.teamName}</td>
                          <td className="mute2">{row.memo}</td>
                          <td className="nowrap">
                            <StatusBadge locked={row.isLocked} mustChangePassword={row.mustChangePassword} />
                            {row.loginFailCount > 0 && !row.isLocked && <span className="mute2 xs"> 실패 {row.loginFailCount}</span>}
                          </td>
                          <td className="mute2 xs nowrap">
                            {formatIssued(row.createdAt)}
                            {row.createdBy ? ` · ${row.createdBy}` : ""}
                          </td>
                          <td>
                            <div className="adm-acts">
                              {!row.fixed && <button type="button" className="btn xs" onClick={() => handleReset(row)}>비밀번호 재발급</button>}
                              {row.isLocked && <button type="button" className="btn xs line" onClick={() => handleUnlock(row)}>잠금 해제</button>}
                              {!row.fixed && <button type="button" className="btn xs adm-danger" onClick={() => handleRemove(row)}>폐기</button>}
                              {row.fixed && <span className="xs mute2">고정 계정</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <p className="adm-note">고정 계정(시연·로그인 화면이 쓰는 7개)은 비밀번호 재발급·폐기를 할 수 없습니다. 잠긴 계정은 15분이 지나면 저절로도 풀립니다.</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
