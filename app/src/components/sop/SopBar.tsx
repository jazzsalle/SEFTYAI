"use client";
/**
 * 대응 단계 바 — 특보 바 바로 아래, 모든 화면에 고정 (지자체 계정만)
 * 특보 → 매뉴얼 대응단계 추천 → 지금 할 일(내 부서) → [대응절차 전체]
 */
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { useSop } from "@/lib/sopState";
import { codeLabel, myGroupIds, stepLabel, stepProgress } from "@/lib/sop";
import { advLabel } from "@/lib/wxref";
import { IcChevR, IcPushpin } from "../Icons";

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
  const rec = sop.rec;
  const basis = rec
    ? rec.level === "해제"
      ? "특보 해제 → 수습·복구 추천"
      : `${rec.advisory ? advLabel(rec.advisory) : rec.level} 발효 → ${stepLabel(m, rec.step)} 추천`
    : "발효 특보 없음 · 평시";
  const pct = pg.total ? Math.round((pg.done / pg.total) * 100) : 0;
  return (
    <div className={`sopbar ${rec && rec.level === "경보" ? "hot" : ""}`} role="region" aria-label="행동매뉴얼 대응 단계">
      <span className="sb-lab" title={`${m.title} 기준`}><IcPushpin size={15} /> 대응절차</span>
      <ol className="sb-steps" aria-label="대응단계">
        {m.steps.map((s) => {
          const on = s.step === sop.step;
          const isRec = rec?.step === s.step;
          return (
            <li key={s.step}>
              <button
                className={`${on ? "on" : ""} ${isRec ? "rec" : ""}`}
                aria-pressed={on}
                onClick={() => sop.setStep(isRec || (!rec && s.no === 1) ? null : s.step)}
                title={isRec ? `특보 기준 추천 단계 · ${rec?.basis}` : "이 단계 조치 보기"}
              >
                <i>{s.no}</i>
                {stepLabel(m, s.step)}
                {isRec && <em>추천</em>}
              </button>
            </li>
          );
        })}
      </ol>
      <span className="sb-basis" title={rec ? `${m.short} p.${rec.pdfPage} — ${rec.basis}` : "특보가 발효되면 매뉴얼 기준 대응단계를 추천합니다"}>
        {basis}
        {sop.picked && <> · <button className="lnk" onClick={() => sop.setStep(null)}>추천 단계로</button></>}
      </span>
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
      <span className="sp" />
      <button className="btn sm navy" onClick={() => open()}>대응절차 전체 <IcChevR size={14} /></button>
    </div>
  );
}
