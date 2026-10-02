import { NextResponse } from "next/server";
import { MANUALS } from "@/lib/server/manual";

export function GET() {
  return NextResponse.json({ manuals: MANUALS });
}
