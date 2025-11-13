import { NextResponse } from "next/server";

import { UnauthorizedError, requireUser } from "@/lib/auth";
import {
  REPORT_ADJUSTMENT_SECTIONS,
  isValidAdjustmentSection,
  isValidAdjustmentType,
  type ReportAdjustmentSection,
  type ReportAdjustmentType,
} from "@/lib/report-adjustments-schema";
import { createReportAdjustment } from "@/lib/report-adjustments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as Record<string, unknown>;

    const type = body.reportType;
    const section = body.section as ReportAdjustmentSection | undefined;
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const amountValue =
      typeof body.amount === "number"
        ? body.amount
        : typeof body.amount === "string"
        ? Number(body.amount)
        : NaN;
    const effectiveDate = parseDate(body.effectiveDate ?? body.date);

    if (!isValidAdjustmentType(type)) {
      return NextResponse.json(
        { error: "Jenis laporan tidak valid." },
        { status: 400 }
      );
    }

    if (!section || !isValidAdjustmentSection(type, section)) {
      return NextResponse.json(
        { error: "Bagian laporan tidak valid." },
        { status: 400 }
      );
    }

    if (!label) {
      return NextResponse.json(
        { error: "Nama baris wajib diisi." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(amountValue)) {
      return NextResponse.json(
        { error: "Nominal penyesuaian tidak valid." },
        { status: 400 }
      );
    }

    if (!effectiveDate) {
      return NextResponse.json(
        { error: "Tanggal efektif tidak valid." },
        { status: 400 }
      );
    }

    const adjustment = await createReportAdjustment({
      userId: user.userId,
      type,
      section,
      label,
      description,
      amount: amountValue,
      effectiveDate,
    });

    return NextResponse.json({
      message: "Penyesuaian laporan ditambahkan.",
      adjustmentId: adjustment._id?.toString() ?? null,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create report adjustment error", error);
    return NextResponse.json(
      { error: "Gagal menambahkan penyesuaian laporan." },
      { status: 500 }
    );
  }
}
