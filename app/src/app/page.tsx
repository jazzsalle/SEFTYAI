"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

export default function Root() {
  const { ready, account } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (ready) router.replace(account ? "/explore" : "/login");
  }, [ready, account, router]);
  return null;
}
