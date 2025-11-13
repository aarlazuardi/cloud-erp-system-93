import { NextResponse } from "next/server";

import { UnauthorizedError, requireUser } from "@/lib/auth";
import { buildDashboardSnapshot } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("📊 Dashboard API called");
    const user = await requireUser();
    console.log("👤 User for dashboard:", {
      userId: user.userId.toString(),
      username: user.username
    });
    
    const snapshot = await buildDashboardSnapshot(user.userId);
    console.log("📈 Dashboard snapshot result:", snapshot);
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
