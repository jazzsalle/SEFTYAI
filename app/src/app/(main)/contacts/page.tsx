"use client";
/**
 * 연락망 (UFR-009-002-01·02, 이력 UFR-009-001-02) — report4 연락망 화면 구조
 *  비상연락망(조직도·조회 전용) / 조직·담당자 / 전파그룹 / 전파 이력
 *  · 지자체·정부기관 공무원 = 자기 기관만 조회·관리, 시스템 운영자 = 기관을 골라 조회만
 */
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { canManage, canSend, myOrg, orgName, useContacts, useDispatches, viewableOrgs, type Dispatch } from "@/lib/contacts";
import EmergencyTree from "@/components/contacts/EmergencyTree";
import People from "@/components/contacts/People";
import Groups from "@/components/contacts/Groups";
import DispatchHistory from "@/components/contacts/DispatchHistory";
import PropagateModal from "@/components/contacts/PropagateModal";
import { ConfirmDelete, type Confirm } from "@/components/contacts/ContactsUi";
import ContactsExcel from "@/components/contacts/ContactsExcel";

type Tab = "tree" | "people" | "groups" | "history";
const TABS: [Tab, string][] = [["tree", "비상연락망"], ["people", "조직·담당자"], ["groups", "전파그룹"], ["history", "전파 이력"]];

export default function ContactsPage() {
  const { account } = useSession();
  const orgs = viewableOrgs(account);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("tree");
  const [show, setShow] = useState(false);
  const [resend, setResend] = useState<Dispatch | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some(([k]) => k === t)) setTab(t as Tab);
  }, []);
  useEffect(() => setOrgId(myOrg(account) ?? orgs[0]?.id ?? null), [account]); // eslint-disable-line react-hooks/exhaustive-deps
  const api = useContacts(orgId, account);
  const hist = useDispatches(orgId);
  if (!account) return null;
  const op = account.role === "운영자";
  const mine = !!orgId && canManage(account, orgId);

  return (
    <div className="page">
      <div className="page-in" style={{ maxWidth: 1480 }}>
        <div className="ph">
          <div>
            <h1>연락망</h1>
            <p>
              {op
                ? "시스템 운영자는 모든 기관의 연락망과 전파 이력을 조회만 할 수 있습니다. 등록·수정·삭제와 상황전파 발송은 각 기관 담당자가 합니다."
                : "우리 기관의 비상연락망·조직·담당자·전파그룹을 관리합니다. 같은 기관 담당자는 모두 같은 권한으로 고칠 수 있고, 여기 등록한 연락처로 상황전파를 보냅니다."}
            </p>
          </div>
          <span className="sp" />
          {op ? (
            <label className="row" style={{ gap: 6 }}>
              <span className="xs b">기관</span>
              <select className="select" value={orgId ?? ""} onChange={(e) => setOrgId(e.target.value)}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <span className="badge sq neutral">조회 전용</span>
            </label>
          ) : (
            orgId && <span className="badge sq info">{orgName(orgId)}</span>
          )}
        </div>
        {!orgId ? (
          <div className="notice">조회할 수 있는 연락망이 없습니다.</div>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 16 }}>
              <div className="subtabs" style={{ marginTop: 0, width: 640 }}>
                {TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}{k === "history" && hist.length ? ` ${hist.length}` : ""}</button>)}
              </div>
              <span className="sp" />
              {tab !== "history" && <ContactsExcel api={api} orgId={orgId} orgName={orgName(orgId)} />}
              {mine && (
                <button className="btn sm ghost" onClick={() => setConfirm({ title: "예시 연락망으로 되돌리기", message: "지금 연락망을 지우고 예시 연락망(가상 인명·번호)으로 되돌릴까요? 전파 이력은 그대로 남습니다.", ok: "되돌리기", run: () => api.resetSeed() })}>예시 연락망으로 되돌리기</button>
              )}
            </div>
            {tab === "tree" && (api.bundle.units.length ? <EmergencyTree b={api.bundle} show={show} onToggleShow={() => setShow((v) => !v)} /> : <div className="ct-card"><div className="ct-empty">등록된 연락망이 없습니다. {mine ? "조직·담당자 탭에서 조직과 담당자를 추가하세요." : ""}</div></div>)}
            {tab === "people" && <People api={api} show={show} onToggleShow={() => setShow((v) => !v)} />}
            {tab === "groups" && <Groups api={api} />}
            {tab === "history" && <DispatchHistory list={hist} show={show} onResend={canSend(account) && myOrg(account) === orgId ? setResend : undefined} />}
          </>
        )}
      </div>
      {resend && orgId && (
        <PropagateModal orgId={orgId} account={account} message={resend.message} sel={resend.sel} context={resend.context} resendOf={resend.id} onClose={() => setResend(null)} />
      )}
      <ConfirmDelete c={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
