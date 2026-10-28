import { logout, sessionCookie } from "@/lib/server/auth";
import { json } from "@/lib/server/who";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await logout(req).catch(() => {});
  const res = json({ ok: true });
  res.headers.append("set-cookie", sessionCookie("", 0));
  return res;
}
