import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Manual payment submission is not available." },
    { status: 404 }
  );
}
