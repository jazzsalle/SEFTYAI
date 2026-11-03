"use client";
/**
 * 대응 단계 바 — 특보 바 바로 아래, 모든 화면에 고정 (지자체 계정만)
 * 대응단계 → 지금 할 일(내 부서) → [대응절차 전체] (특보 연동 추천은 2026-11-03 뺌)
 */
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { useSop } from "@/lib/sopState";
import { codeLabel, myGroupIds, stepLabel, stepProgress } from "@/lib/sop";
import { IcChevR, IcPushpin } from "../Icons";

/** 2026-11-02 사용자 지시: 단계·진행·다음 할 일은 일단 숨긴다(되살리려면 false) */
const HIDE_DETAIL = true;

export default function SopBar() {
  const sop = useSop();
  const { checks } = useSession();
  const router = useRouter();
  const path = usePathname();
  const m = sop.manual;
  if (!sop.enabled || !m) return null;
  const mine = myGroupIds(m);
  const pg = stepProgress(m, sop.step, mine, checks);
  const next = pg.next.slice(0, 2);
  const open = (focus?: string) => {
    sop.requestOpen(focus);
    if (!path.startsWith("/explore")) router.push("/explore");
  };
  const pct = pg.total ? Math.round((pg.done / pg.total) * 100) : 0;
  return (
    <div className="sopbar" role="region" aria-label="행동매뉴얼 대응 단계">
      <span className="sb-lab" title={`${m.title} 기준`}><IcPushpin size={15} /> 대응절차</span>
      {!HIDE_DETAIL && <>
      <ol className="sb-steps" aria-label="대응단계">
        {m.steps.map((s) => {
          const on = s.step === sop.step;
          return (
            <li key={s.step}>
              <button
                className={on ? "on" : ""}
                aria-pressed={on}
                onClick={() => sop.setStep(s.no === 1 ? null : s.step)}
                title="이 단계 조치 보기"
              >
                <i>{s.no}</i>
                {stepLabel(m, s.step)}
              </button>
            </li>
          );
        })}
      </ol>
      <span className="sb-prog" title="내 부서 조치 완료 / 전체 (필요시 임무는 실행한 것만 셈)">
        내 부서 <b>{pg.done}</b>/{pg.total}
        <span className="bar"><i style={{ width: `${pct}%` }} /></span>
      </span>
      {next.length > 0 && (
        <span className="sb-next">
          <span className="k">다음</span>
          {next.map((a) => (
            <button key={a.id} onClick={() => open(a.id)} title={a.name}>
              {a.code && <b>{codeLabel(m, a.code)}</b>} {a.name}
            </button>
          ))}
        </span>
      )}
      {pg.total > 0 && next.length === 0 && <span className="sb-next done">이 단계 내 부서 조치 완료</span>}
      </>}
      <span className="sp" />
      <button className="btn sm navy" onClick={() => open()}>대응절차 전체 <IcChevR size={14} /></button>
    </div>
  );
}
