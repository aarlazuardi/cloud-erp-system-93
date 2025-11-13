import { NextResponse } from "next/server";

import { UnauthorizedError, requireUser } from "@/lib/auth";
import { deleteReportAdjustment } from "@/lib/report-adjustments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const success = await deleteReportAdjustment(user.userId, params.id);
    if (!success) {
      return NextResponse.json(
        { error: "Penyesuaian tidak ditemukan." },
        { status: 404 }
      );
    }
    return NextResponse.json({ message: "Penyesuaian dihapus." });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete report adjustment error", error);
    return NextResponse.json(
      { error: "Gagal menghapus penyesuaian laporan." },
      { status: 500 }
    );
  }
}
