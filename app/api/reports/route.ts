import { NextResponse } from "next/server";

import { UnauthorizedError, requireUser } from "@/lib/auth";
import { buildReportData, type PeriodKey } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PERIOD: PeriodKey = "current-month";
const VALID_TYPES = new Set(["income-statement", "balance-sheet", "cash-flow"]);

function isValidPeriod(value: string | null): value is PeriodKey {
  return (
    value !== null &&
    [
      "current-month",
      "last-month",
      "current-quarter",
      "last-quarter",
      "year-to-date",
      "last-year",
    ].includes(value)
  );
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period");
    const typeParam = searchParams.get("type");

    const period: PeriodKey = isValidPeriod(periodParam)
      ? periodParam
      : DEFAULT_PERIOD;

    const report = await buildReportData(user.userId, period);

    if (typeParam) {
      if (!VALID_TYPES.has(typeParam)) {
        return NextResponse.json(
          { error: "Unknown report type." },
          { status: 400 }
        );
      }

      if (typeParam === "income-statement") {
        return NextResponse.json({
          period: report.period,
          range: report.range,
          generatedAt: report.generatedAt,
          incomeStatement: report.incomeStatement,
        });
      }

      if (typeParam === "balance-sheet") {
        return NextResponse.json({
          period: report.period,
          range: report.range,
          generatedAt: report.generatedAt,
          balanceSheet: report.balanceSheet,
        });
      }

      return NextResponse.json({
        period: report.period,
        range: report.range,
        generatedAt: report.generatedAt,
        cashFlow: report.cashFlow,
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Reports API error", error);
    return NextResponse.json(
      { error: "Failed to generate report." },
      { status: 500 }
    );
  }
}
