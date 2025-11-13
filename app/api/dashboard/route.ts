import { NextResponse } from "next/server";

import { UnauthorizedError, requireUser } from "@/lib/auth";
import { buildDashboardSnapshot } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const snapshot = await buildDashboardSnapshot(user.userId);
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Dashboard API error", error);
    return NextResponse.json(
      { error: "Failed to load dashboard data." },
      { status: 500 }
    );
  }
}
