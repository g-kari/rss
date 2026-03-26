import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
