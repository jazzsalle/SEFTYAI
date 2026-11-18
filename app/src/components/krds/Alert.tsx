"use client";
/** 폼 위쪽에 띄우는 안내·오류 상자. KRDS Alert(@une-front/krds) — 개발서버 shared/components/Alert 그대로(R64, 개발서버 7f428c4) */
import { Alert as KrdsAlert } from "@une-front/krds/portable/alert";

interface AlertProps {
  tone?: "error" | "info";
  children: React.ReactNode;
}

export function Alert({ tone = "error", children }: AlertProps) {
  return (
    <KrdsAlert tone={tone} role="alert" style={{ margin: "0 0 16px" }}>
      {children}
    </KrdsAlert>
  );
}
