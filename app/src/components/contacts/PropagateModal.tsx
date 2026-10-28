"use client";
/**
 * 상황전파 작성·발송 (UFR-009-001-01) — 전파 내용 · 대상(전파그룹/조직·부서/담당자) · 채널(문자/이메일, 같은 절차)
 *  · 발송 전 확인: 채널별 연락처 없는 수신자 표시 → 그 채널에서 제외
 *  · 서버가 연락망에서 수신자를 다시 계산해 발송 모듈에 요청 → 이력에 '요청 접수', 결과 알림이 오면 성공·실패로 바뀜
 *  · 중복 발송 차단: [전파] 한 번에 요청 키 하나(두 번 눌러도 한 번), 같은 내용·대상을 2분 안에 다시 보내면 확인을 받음
 *  · 현장 응답 링크는 보내지 않음
 */
import { useEffect, useMemo, useState } from "react";
import {
  CH_LABEL, LMS_MAX, newIdemKey, orgName, resolveRecipients, sendDispatch, SMS_MAX, smsBytes,
  useContacts, type Channel, type Dispatch, type Selection,
} from "@/lib/contacts";
import { api, ApiError } from "@/lib/api";
import type { Account } from "@/lib/config";
import { IcCheck, IcSend, IcUsers } from "../Icons";
import { Modal } from "./ContactsUi";
import RecipientPicker, { SelectionChips } from "./RecipientPicker";

export default function PropagateModal({ orgId, account, message, sel: sel0, channels, context, resendOf, onClose, onSent }: {
  orgId: string; account: Account; message: string; sel?: Selection; channels?: Channel[]; context?: string; resendOf?: string; onClose: () => void; onSent?: (d: Dispatch) => void;
}) {
  const { bundle: b } = useContacts(orgId, account);
  const [msg, setMsg] = useState(message);
  const [sel, setSel] = useState<Selection>(sel0 ?? { groupIds: [], unitIds: [], contactIds: [] });
  const [ways, setWays] = useState<Record<Channel, boolean>>(() => (channels?.length ? { SMS: channels.includes("SMS"), EMAIL: channels.includes("EMAIL") } : { SMS: true, EMAIL: false }));
  const [picking, setPicking] = useState(false);
  const [step, setStep] = useState<"write" | "check" | "done">("write");
  const [sent, setSent] = useState<Dispatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dup, setDup] = useState<string | null>(null);
  // [전파] 한 번의 요청 키 — 발송 전 확인 화면에 들어올 때 새로 만듦 (두 번 눌러도 서버는 한 번만 처리)
  const [idem, setIdem] = useState(newIdemKey);
  // 발송 모듈 — 모의 모듈이면 보내기 전에 주의 표시(실제 발송사 연결 전까지)
  const [prov, setProv] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ provider: string }>("/api/dispatch/provider").then((r) => alive && setProv(r.provider)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const rec = useMemo(() => resolveRecipients(b, sel), [b, sel]);
  const unitName = useMemo(() => new Map(b.units.map((u) => [u.id, u.name])), [b.units]);
  const chans = (Object.keys(ways) as Channel[]).filter((c) => ways[c]);
  const has = (c: Channel, r: (typeof rec)[number]) => (c === "SMS" ? !!r.phone : !!r.email);
  const reach = rec.filter((r) => chans.some((c) => has(c, r)));
  const bytes = smsBytes(msg);
  const tooLong = ways.SMS && bytes > LMS_MAX;
  const canGo = !!msg.trim() && chans.length > 0 && reach.length > 0 && !tooLong;

  const send = async (force = false) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await sendDispatch({ orgId, message: msg.trim(), channels: chans, sel, context, resendOf, idemKey: idem, force });
      setSent(r.dispatch);
      setStep("done");
      onSent?.(r.dispatch);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.body as { code?: string }).code === "DUP") setDup(e.message);
      else setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toCheck = () => (setIdem(newIdemKey()), setDup(null), setErr(null), setStep("check"));

  if (picking) return <RecipientPicker b={b} value={sel} onClose={() => setPicking(false)} onSave={(s) => (setSel(s), setPicking(false))} />;

  if (step === "done" && sent) {
    const n = (c: Channel) => sent.to.filter((t) => t.result[c] === "요청 접수").length;
    return (
      <Modal title="상황전파 요청 완료" width={560} onClose={onClose} foot={<><a className="btn" href="/contacts?tab=history">전파 이력 보기</a><span className="sp" /><button className="btn pri" onClick={onClose}>확인</button></>}>
        <div className="ct-done"><IcCheck size={22} /> {sent.channels.map((c) => `${CH_LABEL[c]} ${n(c)}명`).join(" · ")}에게 전파를 요청했습니다.</div>
        {sent.to.some((t) => Object.values(t.result).includes("연락처 없음")) && <div className="notice warn" style={{ marginTop: 10 }}>연락처가 없는 수신자는 그 채널에서 빠졌습니다. 전파 이력에서 확인하세요.</div>}
        <div className="xs mute2" style={{ marginTop: 10 }}>발송 결과(성공·실패)는 모듈의 결과 알림이 오면 전파 이력에 반영됩니다.{sent.provider === "mock" ? " 지금은 모의 모듈이라 실제로 보내지 않고 몇 초 뒤 시험 결과가 반영됩니다." : ""}</div>
      </Modal>
    );
  }

  return (
    <Modal title={step === "check" ? "발송 전 확인" : "상황전파"} sub={`${orgName(orgId)} 연락망 · ${account.dept} ${account.name}`} width={step === "check" ? 760 : 680} onClose={onClose}
      foot={step === "write" ? (
        <><span className="xs mute2">수신 {rec.length}명</span><span className="sp" /><button className="btn" onClick={onClose}>취소</button><button className="btn pri" disabled={!canGo} onClick={toCheck}>다음 · 발송 전 확인</button></>
      ) : (
        <>
          <button className="btn" disabled={busy} onClick={() => setStep("write")}>이전</button>
          {err && <span className="ct-err">{err}</span>}
          <span className="sp" />
          {dup ? (
            <button className="btn danger" disabled={busy} onClick={() => send(true)}><IcSend size={14} /> 그래도 보내기</button>
          ) : (
            <button className="btn pri" disabled={!canGo || busy} onClick={() => send()}><IcSend size={14} /> {busy ? "보내는 중…" : `${reach.length}명에게 전파`}</button>
          )}
        </>
      )}>
      {prov === "mock" && <div className="notice warn" style={{ marginBottom: 10 }}>모의 발송 — 실제로 문자·메일을 보내지 않으며, 발송 결과는 시험 규칙으로 표시됩니다.</div>}
      {step === "write" ? (
        <>
          <div className="ct-lb">전파 내용</div>
          <textarea className="input ct-ta" rows={6} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="전파할 상황과 요청 사항을 적으세요" />
          <div className="ct-bytes">
            {ways.SMS && <span className={tooLong ? "danger" : ""}>{bytes}바이트 · {bytes <= SMS_MAX ? "단문(SMS)" : bytes <= LMS_MAX ? "장문(LMS)" : `장문 한도 ${LMS_MAX}바이트 초과`}</span>}
          </div>
          <div className="ct-lb">전파 대상</div>
          {b.contacts.length === 0 && <div className="notice warn" style={{ marginBottom: 8 }}>등록된 연락망이 없습니다. <a className="lnk" href="/contacts">연락망 관리</a></div>}
          <div className="row w" style={{ gap: 8 }}>
            <SelectionChips b={b} sel={sel} onRemove={(k, id) => setSel((s) => ({ ...s, [k]: s[k].filter((x) => x !== id) }))} />
            <button className="btn sm line" onClick={() => setPicking(true)}><IcUsers size={13} /> {rec.length ? "대상 변경" : "전파 대상 선택"}</button>
          </div>
          {b.groups.length > 0 && !sel.groupIds.length && !sel.unitIds.length && !sel.contactIds.length && (
            <div className="row w" style={{ marginTop: 8, gap: 6 }}>
              <span className="xs mute2">전파그룹 바로 고르기</span>
              {b.groups.map((g) => <button key={g.id} className="chip" onClick={() => setSel((s) => ({ ...s, groupIds: [...s.groupIds, g.id] }))}>+ {g.name}</button>)}
            </div>
          )}
          <div className="ct-lb">발송 방법</div>
          <div className="row" style={{ gap: 18 }}>
            {(["SMS", "EMAIL"] as Channel[]).map((c) => (
              <label key={c} className="row" style={{ gap: 6 }}><input type="checkbox" checked={ways[c]} onChange={(e) => setWays((w) => ({ ...w, [c]: e.target.checked }))} /> {CH_LABEL[c]}</label>
            ))}
            {!chans.length && <span className="xs" style={{ color: "var(--c-dang)" }}>발송 방법을 고르세요.</span>}
          </div>
        </>
      ) : (
        <>
          <div className="ct-lb" style={{ marginTop: 0 }}>전파 내용 · {chans.map((c) => CH_LABEL[c]).join(" + ")}</div>
          <div className="ct-msg">{msg.trim()}</div>
          <div className="ct-lb">수신 {rec.length}명 <span className="xs mute2">· 연락처가 없는 채널은 빼고 보냅니다</span></div>
          <div className="ct-rlist">
            {rec.map((r) => (
              <div key={r.id} className="ct-rrow">
                <b>{r.name}</b><span className="muted">{r.title}</span><span className="mute2 xs">{unitName.get(r.unitId)}</span><span className="sp" />
                {ways.SMS && (r.phone ? <span className="num">{r.phone}</span> : <span className="badge sq danger">휴대전화 없음</span>)}
                {ways.EMAIL && (r.email ? <span className="muted">{r.email}</span> : <span className="badge sq danger">이메일 없음</span>)}
              </div>
            ))}
          </div>
          <div className="ct-sum">
            {chans.map((c) => <span key={c}>{CH_LABEL[c]} <b>{rec.filter((r) => has(c, r)).length}</b>건</span>)}
            <span className="sp" />
            <span className="xs mute2">AI 모드·에이전트는 자동으로 보내지 않습니다. 확인한 사용자만 발송합니다.</span>
          </div>
          {dup && <div className="notice warn" style={{ marginTop: 10 }} role="alert"><b>중복 발송 확인</b> — {dup}</div>}
        </>
      )}
    </Modal>
  );
}
