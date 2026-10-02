import { NextResponse } from "next/server";
import { catalog, catalogSummary } from "@/lib/server/catalog";

export function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("summary")) return NextResponse.json(catalogSummary());
  return NextResponse.json({ summary: catalogSummary(), items: catalog() });
}
