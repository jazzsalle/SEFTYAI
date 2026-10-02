"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session";
import type { Manual } from "@/lib/server/manual";
import { IcDoc } from "@/components/Icons";

const RID: Record<string, string> = { busan: "BUSAN", yeongcheon: "YEONGCHEON", inje: "INJE" };

function ManualInner() {
  const { cond, weather, checks, toggleCheck } = useSession();
  const sp = useSearchParams();
  const [all, setAll] = useState<Manual[]>([]);
  const [mid, setMid] = useState("");
  const [stage, setStage] = useState(sp.get("stage") ?? "");
  const [img, setImg] = useState<{ src: string; cap: string } | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/manual").then((r) => r.json()).then((j) => setAll(j.manuals));
  }, []);
  useEffect(() => {
    if (!all.length) return;
    const want = cond.region !== "national" ? all.find((m) => m.id.includes(RID[cond.region])) : null;
    setMid((cur) => cur || (want ?? all[0]).id);
  }, [all, cond.region]);

  const m = all.find((x) => x.id === mid);
  // 현재 특보 단계 자동 강조
  const cur = useMemo(() => {
    if (!m || !weather) return "";
    const rid = Object.keys(RID).find((k) => m.id.includes(RID[k]));
    const a = weather.advisories.find((x) => x.regionId === rid && x.status === "발효");
    if (!a) return "";
    return m.stages.find((s) => (a.level === "경보" ? /경보 발/.test(s.name) : a.level === "주의보" ? /주의보/.test(s.name) : /예비/.test(s.name)))?.stageId ?? "";
  }, [m, weather]);
  useEffect(() => {
    if (cur && !stage) setStage(cur);
  }, [cur, stage]);

  if (!m) return <div className="page"><div className="page-in"><div className="typing"><i /><i /><i /></div></div></div>;
  const stages = m.stages.filter((s) => !stage || s.stageId === stage);

  return (
    <div className="page">
      <div className="page-in">
        <div className="ph">
          <div>
            <h1>풍수해 현장조치 행동매뉴얼 · 대응절차</h1>
            <p>특보 단계별로 “누가 · 언제 · 무엇을” 해야 하는지 매뉴얼 원문 쪽수와 함께 정리했습니다. 체크한 항목은 이 계정에 저장됩니다.</p>
          </div>
          <span className="sp" />
          <div className="row">
            {all.map((x) => (
              <button key={x.id} className={`chip ${x.id === mid ? "on" : ""}`} onClick={() => { setMid(x.id); setStage(""); }}>{x.region.replace("강원특별자치도 ", "").replace("경상북도 ", "")}</button>
            ))}
          </div>
        </div>

        <div className="grid3" style={{ gridTemplateColumns: "2fr 1fr", alignItems: "start" }}>
          <div>
            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="row w">
                <span className="badge ok sq">행동매뉴얼</span>
                <b>{m.title}</b>
              </div>
              <div className="xs muted" style={{ marginTop: 6 }}>{m.region} · 주관 {m.responsibleDept} · {m.version} · 전체 {m.pageCount}쪽 · 조치 {m.taskCount}개</div>
              <div className="stage-tabs" style={{ marginTop: 14 }}>
                <button className={`chip ${!stage ? "on" : ""}`} onClick={() => setStage("")}>전체 단계</button>
                {m.stages.map((s) => (
                  <button key={s.stageId} className={`chip ${stage === s.stageId ? "on" : ""}`} onClick={() => setStage(s.stageId)} style={s.stageId === cur ? { borderColor: "var(--c-dang)", color: "var(--c-dang-dk)" } : undefined}>
                    {s.stageId === cur && "● "}{s.name.replace(/\s*\(.*\)/, "")}
                  </button>
                ))}
              </div>
              <input className="input sm" style={{ width: "100%", marginTop: 12 }} placeholder="조치 내용 검색 (예: 지하차도, 대피, 재난문자)" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            {stages.map((s) => {
              const tasks = s.tasks.filter((t) => !q || t.task.includes(q) || t.owner?.includes(q));
              if (!tasks.length) return null;
              const done = s.tasks.filter((t) => checks[`${m.id}:${s.stageId}:${t.seq}`]).length;
              return (
                <section key={s.stageId} className="mstage" style={s.stageId === cur ? { borderColor: "var(--c-dang)", boxShadow: "0 0 0 3px rgba(222,52,18,.1)" } : undefined}>
                  <div className="hd">
                    {s.stageId === cur && <span className="badge solid-danger sq">현재 단계</span>}
                    <h3>{s.name}</h3>
                    <span className="sp" />
                    <span className="xs mute2">완료 {done}/{s.tasks.length}</span>
                  </div>
                  <div style={{ padding: "10px 16px 4px" }}>
                    <div className="xs"><b>발동</b> · {s.trigger}</div>
                    <div className="xs muted" style={{ marginTop: 4 }}><b>근무체계</b> · {s.emergencyLevel}</div>
                  </div>
                  <ol className="actions" style={{ padding: "6px 8px 10px" }}>
                    {tasks.map((t) => {
                      const k = `${m.id}:${s.stageId}:${t.seq}`;
                      return (
                        <li key={t.seq} className={checks[k] ? "done" : ""}>
                          <input type="checkbox" checked={!!checks[k]} onChange={() => toggleCheck(k)} aria-label="완료" />
                          <div>
                            <div className="tx">{t.code && <span className="badge neutral sq" style={{ height: 20, marginRight: 6 }}>{t.code}</span>}{t.task}</div>
                            <div className="own">{t.owner}{t.checkpoints?.length ? ` · 확인: ${t.checkpoints.join(" / ")}` : ""}</div>
                          </div>
                          <span className="col" style={{ alignItems: "flex-end", gap: 2 }}>
                            {t.timing && <span className="due">{t.timing}</span>}
                            {t.page && <span className="xs mute2">p.{t.page}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>

          <aside style={{ position: "sticky", top: 0 }}>
            <div className="panel">
              <h3 className="s" style={{ marginBottom: 10 }}>현장 통제 기준</h3>
              {m.fieldActions.map((f) => (
                <details key={f.target} style={{ borderBottom: "1px solid var(--c-line)", padding: "8px 0" }}>
                  <summary className="xs b" style={{ cursor: "pointer" }}>{f.target}{f.page ? <span className="mute2" style={{ fontWeight: 400 }}> · p.{f.page}</span> : null}</summary>
                  <div className="xs" style={{ margin: "6px 0", color: "var(--c-dang-dk)" }}>{f.criteria}</div>
                  <ul className="xs muted" style={{ listStyle: "disc", paddingLeft: 16 }}>
                    {f.actions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </details>
              ))}
            </div>
            <div className="panel" style={{ marginTop: 14 }}>
              <h3 className="s" style={{ marginBottom: 10 }}>보고 체계</h3>
              <ul className="xs">
                {m.reporting.map((r, i) => (
                  <li key={i} style={{ padding: "6px 0", borderBottom: "1px dashed var(--c-line)" }}>
                    <b>{r.what}</b>
                    <div className="muted">{r.to} · {r.when}{r.page ? ` · p.${r.page}` : ""}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel" style={{ marginTop: 14 }}>
              <h3 className="s" style={{ marginBottom: 10 }}>원문 보기</h3>
              {m.images.map((i) => (
                <button key={i.file} className="citechip" style={{ width: "100%", marginBottom: 6, height: "auto", padding: "8px 10px", textAlign: "left" }} onClick={() => setImg({ src: `/docs/manual/${i.file}`, cap: `${i.caption} (p.${i.page})` })}>
                  <IcDoc size={13} /> <span><b>p.{i.page}</b> {i.caption}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>
      {img && (
        <div className="ovl" onClick={() => setImg(null)}>
          <div className="modal" style={{ width: "min(1000px,100%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd"><h2 style={{ fontSize: 17 }}>{img.cap}</h2><span className="sp" /><button className="btn sm" onClick={() => setImg(null)}>닫기</button></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="modal-bd"><img src={img.src} alt={img.cap} style={{ width: "100%" }} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManualPage() {
  return <Suspense><ManualInner /></Suspense>;
}
