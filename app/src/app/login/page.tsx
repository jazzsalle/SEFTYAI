"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { ACCOUNTS } from "@/lib/config";
import { GovLogo, IcChevR } from "@/components/Icons";

interface Summary { datasets: number; riskObjects: number; events: number; reports119: number; manualTasks: number }

export default function LoginPage() {
  const { login, account, ready } = useSession();
  const router = useRouter();
  const [sum, setSum] = useState<Summary | null>(null);

  useEffect(() => {
    if (ready && account) router.replace("/explore");
  }, [ready, account, router]);
  useEffect(() => {
    fetch("/api/catalog?summary=1").then((r) => r.json()).then(setSum).catch(() => {});
  }, []);

  return (
    <main className="login">
      <section className="lv">
        <div className="row" style={{ gap: 12 }}>
          <GovLogo size={34} />
          <b style={{ fontSize: 20 }}>행정안전부</b>
          <span className="badge" style={{ background: "rgba(255,255,255,.12)", color: "#dce6f8" }}>시범서비스</span>
        </div>
        <h1>
          특보가 뜨면,
          <br />
          무엇을 먼저 봐야 할지
          <br />
          AI가 근거와 함께 알려드립니다.
        </h1>
        <p>
          재해대장·상습침수·급경사지·119 신고·풍수해 행동매뉴얼을 하나의 재난사건으로 엮어
          <br />
          “어디가 · 왜 · 언제 위험하고 · 지금 무엇을 해야 하는지” 답합니다.
        </p>
        <div className="stats">
          <div><b>{sum ? sum.datasets : "—"}</b><span>연계 데이터셋</span></div>
          <div><b>{sum ? sum.riskObjects.toLocaleString() : "—"}</b><span>위험·취약 객체</span></div>
          <div><b>{sum ? sum.events : "—"}</b><span>재난사건(재난마스터)</span></div>
          <div><b>{sum ? sum.manualTasks : "—"}</b><span>매뉴얼 조치 항목</span></div>
        </div>
        <p className="xs" style={{ marginTop: 36, color: "#8fa6c8" }}>
          시범 지역 : 부산광역시 · 경상북도 영천시 · 강원특별자치도 인제군
        </p>
      </section>
      <section className="lf">
        <h2 style={{ fontSize: 26 }}>로그인</h2>
        <p className="muted xs" style={{ margin: "6px 0 22px" }}>
          시연용 발급 계정을 선택하세요. 계정의 소속 지역이 기준지역으로 자동 지정됩니다.
        </p>
        {ACCOUNTS.map((a) => (
          <button key={a.id} className="acct" onClick={() => { login(a.id); router.push("/explore"); }}>
            <span className="av" style={{ background: a.color, fontSize: 13 }}>{a.initial}</span>
            <span className="col" style={{ minWidth: 0 }}>
              <span className="nm">{a.org} · {a.dept}</span>
              <span className="ds">{a.id} · {a.roleLabel}</span>
            </span>
            <span className="sp" />
            <IcChevR size={18} />
          </button>
        ))}
        <p className="xs mute2" style={{ marginTop: 18, lineHeight: 1.7 }}>
          ※ 시범서비스 시연 환경입니다. 실제 서비스는 기관 발급 계정 + 비밀번호(5회 실패 시 잠금) 인증을 적용합니다.
          <br />※ AI 응답은 T3Q Agent API 연계 규격 기준(시연판)으로 제공되며, 훈련 시나리오 값은 가상입니다.
        </p>
      </section>
    </main>
  );
}
