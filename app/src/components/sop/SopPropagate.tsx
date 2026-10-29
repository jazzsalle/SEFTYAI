"use client";
/** 대응절차 패널 [상황전파] — 지금 단계·특보로 전파문 초안을 채워 연락망 대상에게 문자(·이메일)로 보냄 */
import { useState } from "react";
import { useSession } from "@/lib/session";
import { useSop } from "@/lib/sopState";
import { stepLabel } from "@/lib/sop";
import { advName } from "@/lib/wxref";
import { canSend, myOrg, useDispatches } from "@/lib/contacts";
import PropagateModal from "../contacts/PropagateModal";
import { IcSend } from "../Icons";

const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);

export default function SopPropagate() {
  const { account } = useSession();
  const sop = useSop();
  const orgId = myOrg(account);
  const { list: hist } = useDispatches(orgId);
  const [open, setOpen] = useState(false);
  if (!account || !orgId || !canSend(account) || !sop.manual) return null;
  const m = sop.manual;
  const rec = sop.rec;
  // 시연 시나리오 특보면 전파문에도 「(시연 시나리오)」 — 가상 특보가 실제 특보처럼 나가지 않게(R43)
  const adv = rec?.advisory ? `${rec.advisory.area} ${advName(rec.advisory)} 발효` : rec?.level === "해제" ? "특보 해제" : "발효 중인 특보 없음";
  const step = stepLabel(m, sop.step);
  const org = account.org.replace(/^(경상북도|강원특별자치도)\s/, "");
  const draft = `[${org}] ${adv} — 행동매뉴얼 대응단계 「${step}」\n소관 조치사항을 확인하고 조치 결과를 상황실(${account.dept})로 알려 주시기 바랍니다.`;
  const last = hist[0];
  return (
    <>
      <button className="btn sm pri" onClick={() => setOpen(true)} title={last ? `최근 전파 ${hhmm(last.at)} · ${last.to.length}명` : "연락망 대상에게 문자로 상황을 알립니다"}>
        <IcSend size={13} /> 상황전파{last ? <span className="sp-sent">{hhmm(last.at)}</span> : null}
      </button>
      {open && <PropagateModal orgId={orgId} account={account} message={draft} context={`${m.short} · ${step} · ${adv}`} onClose={() => setOpen(false)} />}
    </>
  );
}
