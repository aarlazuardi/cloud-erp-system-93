import { NextResponse } from "next/server";
import * as XLSX from "xlsx-js-style";

import { UnauthorizedError, requireUser } from "@/lib/auth";
import { buildReportData, type PeriodKey } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PERIOD: PeriodKey = "current-month";
const VALID_TYPES = new Set(["income-statement", "balance-sheet", "cash-flow"]);

type SheetBuilder = (
  report: Awaited<ReturnType<typeof buildReportData>>
) => XLSX.WorkSheet;

type RowKind =
  | "title"
  | "meta"
  | "section"
  | "tableHeader"
  | "data"
  | "totals"
  | "net"
  | "spacer";

interface RowMetadata {
  kind?: RowKind;
  numeric?: boolean;
  merge?: boolean;
}

interface SheetAccumulator {
  rows: (string | number)[][];
  meta: RowMetadata[];
  merges: XLSX.Range[];
}

type Style = Partial<XLSX.CellStyle>;

const CURRENCY_FORMAT = '"Rp"\\ #,##0;-"Rp"\\ #,##0;"-"';

const COLORS = {
  slate900: "FF111827",
  slate800: "FF1F2937",
  slate600: "FF4B5563",
  slate200: "FFE5E7EB",
  slate100: "FFF3F4F6",
  emerald600: "FF047857",
  white: "FFFFFFFF",
};

const THIN_BORDER = { style: "thin", color: { rgb: COLORS.slate200 } } as const;

const STYLE_TITLE: Style = {
  font: { bold: true, sz: 14, color: { rgb: COLORS.white } },
  fill: { patternType: "solid", fgColor: { rgb: COLORS.slate800 } },
  alignment: { horizontal: "center", vertical: "center" },
};

const STYLE_META_LABEL: Style = {
  font: { bold: true, color: { rgb: COLORS.slate900 } },
  alignment: { horizontal: "left", vertical: "center" },
};

const STYLE_META_VALUE: Style = {
  font: { color: { rgb: COLORS.slate600 } },
  alignment: { horizontal: "left", vertical: "center" },
};

const STYLE_SECTION: Style = {
  font: { bold: true, color: { rgb: COLORS.slate900 } },
  fill: { patternType: "solid", fgColor: { rgb: COLORS.slate100 } },
  alignment: { horizontal: "left", vertical: "center" },
  border: { bottom: THIN_BORDER },
};

const STYLE_TABLE_HEADER_LEFT: Style = {
  font: { bold: true, color: { rgb: COLORS.white } },
  fill: { patternType: "solid", fgColor: { rgb: COLORS.slate900 } },
  alignment: { horizontal: "left", vertical: "center" },
  border: { bottom: THIN_BORDER },
};

const STYLE_TABLE_HEADER_RIGHT: Style = {
  ...STYLE_TABLE_HEADER_LEFT,
  alignment: { horizontal: "right", vertical: "center" },
};

const STYLE_DATA_LABEL: Style = {
  font: { color: { rgb: COLORS.slate800 } },
  alignment: { horizontal: "left", vertical: "center" },
  border: { bottom: THIN_BORDER },
};

const STYLE_DATA_VALUE: Style = {
  font: { color: { rgb: COLORS.slate900 } },
  alignment: { horizontal: "right", vertical: "center" },
  border: { bottom: THIN_BORDER },
  numFmt: CURRENCY_FORMAT,
};

const STYLE_TOTAL_LABEL: Style = {
  font: { bold: true, color: { rgb: COLORS.slate900 } },
  fill: { patternType: "solid", fgColor: { rgb: COLORS.slate200 } },
  alignment: { horizontal: "left", vertical: "center" },
  border: { top: THIN_BORDER, bottom: THIN_BORDER },
};

const STYLE_TOTAL_VALUE: Style = {
  ...STYLE_TOTAL_LABEL,
  alignment: { horizontal: "right", vertical: "center" },
  numFmt: CURRENCY_FORMAT,
};

const STYLE_NET_LABEL: Style = {
  font: { bold: true, color: { rgb: COLORS.white } },
  fill: { patternType: "solid", fgColor: { rgb: COLORS.emerald600 } },
  alignment: { horizontal: "left", vertical: "center" },
};

const STYLE_NET_VALUE: Style = {
  ...STYLE_NET_LABEL,
  alignment: { horizontal: "right", vertical: "center" },
  numFmt: CURRENCY_FORMAT,
};

function createAccumulator(): SheetAccumulator {
  return { rows: [], meta: [], merges: [] };
}

function normalizeRow(row: (string | number | null)[]): (string | number)[] {
  const normalized = row.map((value) =>
    value === null || value === undefined ? "" : value
  );
  if (normalized.length === 0) {
    normalized.push("");
  }
  while (normalized.length < 2) {
    normalized.push("");
  }
  if (normalized.length > 2) {
    normalized.length = 2;
  }
  return normalized as (string | number)[];
}

function pushRow(
  acc: SheetAccumulator,
  row: (string | number | null)[],
  metadata: RowMetadata = {}
) {
  const normalized = normalizeRow(row);
  const entry: RowMetadata = {
    ...metadata,
    numeric:
      metadata.numeric ??
      (typeof normalized[1] === "number" && Number.isFinite(normalized[1])),
  };
  acc.rows.push(normalized);
  acc.meta.push(entry);
  if (entry.merge) {
    acc.merges.push({
      s: { r: acc.rows.length - 1, c: 0 },
      e: { r: acc.rows.length - 1, c: normalized.length - 1 },
    });
  }
}

function pushHeader(
  acc: SheetAccumulator,
  title: string,
  period: string,
  generatedAt: string
) {
  pushRow(acc, [title, ""], { kind: "title", merge: true });
  const generatedLabel = new Date(generatedAt).toLocaleString("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
  });
  pushRow(acc, ["Period", period], { kind: "meta" });
  pushRow(acc, ["Generated At", generatedLabel], { kind: "meta" });
  pushRow(acc, [""], { kind: "spacer" });
}

type SectionRow = { label: string; amount: number };

function pushSection(
  acc: SheetAccumulator,
  options: {
    title: string;
    rows: SectionRow[];
    totalLabel: string;
    totalValue: number;
    includeSpacer?: boolean;
    emptyLabel?: string;
  }
) {
  pushRow(acc, [options.title, ""], { kind: "section", merge: true });
  pushRow(acc, ["Item", "Amount"], { kind: "tableHeader" });
  if (options.rows.length) {
    options.rows.forEach((row) =>
      pushRow(acc, [row.label, row.amount], { kind: "data" })
    );
  } else {
    pushRow(acc, [options.emptyLabel ?? "No records", "-"], {
      kind: "data",
      numeric: false,
    });
  }
  pushRow(acc, [options.totalLabel, options.totalValue], { kind: "totals" });
  if (options.includeSpacer ?? true) {
    pushRow(acc, [""], { kind: "spacer" });
  }
}

function finalizeSheet(
  acc: SheetAccumulator,
  columnWidths: number[] = [44, 22]
): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(acc.rows);
  sheet["!cols"] = columnWidths.map((width) => ({ width }));
  if (acc.merges.length) {
    sheet["!merges"] = [...(sheet["!merges"] ?? []), ...acc.merges];
  }
  applyStyles(sheet, acc);
  return sheet;
}

function applyStyles(sheet: XLSX.WorkSheet, acc: SheetAccumulator) {
  acc.rows.forEach((row, rowIndex) => {
    const meta = acc.meta[rowIndex] ?? {};
    const columnCount = meta.merge ? 1 : row.length;
    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      const cell = ensureCell(sheet, rowIndex, colIndex, row[colIndex]);
      const style = styleForCell(meta, colIndex, row[colIndex]);
      if (style) {
        cell.s = mergeStyles(cell.s as Style | undefined, style);
      }
    }
  });
}

function ensureCell(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  colIndex: number,
  value: string | number
): XLSX.CellObject {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  const existing = sheet[address];
  if (existing) {
    return existing;
  }
  const cell: XLSX.CellObject =
    typeof value === "number" && Number.isFinite(value)
      ? { t: "n", v: value }
      : { t: "s", v: value ?? "" };
  sheet[address] = cell;
  return cell;
}

function mergeStyles(base: Style | undefined, fragment: Style): XLSX.CellStyle {
  const merged: Style = {
    ...base,
    ...fragment,
    font: { ...(base?.font ?? {}), ...(fragment.font ?? {}) },
    fill: { ...(base?.fill ?? {}), ...(fragment.fill ?? {}) },
    alignment: { ...(base?.alignment ?? {}), ...(fragment.alignment ?? {}) },
    border: { ...(base?.border ?? {}), ...(fragment.border ?? {}) },
  };
  if (fragment.numFmt) {
    merged.numFmt = fragment.numFmt;
  }
  return merged as XLSX.CellStyle;
}

function styleForCell(
  meta: RowMetadata,
  column: number,
  value: string | number
): Style | null {
  switch (meta.kind) {
    case "title":
      return STYLE_TITLE;
    case "meta":
      return column === 0 ? STYLE_META_LABEL : STYLE_META_VALUE;
    case "section":
      return STYLE_SECTION;
    case "tableHeader":
      return column === 0 ? STYLE_TABLE_HEADER_LEFT : STYLE_TABLE_HEADER_RIGHT;
    case "data":
      if (column === 0) {
        return STYLE_DATA_LABEL;
      }
      return typeof value === "number" ? STYLE_DATA_VALUE : STYLE_DATA_LABEL;
    case "totals":
      return column === 0 ? STYLE_TOTAL_LABEL : STYLE_TOTAL_VALUE;
    case "net":
      return column === 0 ? STYLE_NET_LABEL : STYLE_NET_VALUE;
    default:
      return null;
  }
}

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

function buildIncomeSheet(
  report: Awaited<ReturnType<typeof buildReportData>>
): XLSX.WorkSheet {
  const acc = createAccumulator();
  pushHeader(acc, "Income Statement", report.period, report.generatedAt);
  pushSection(acc, {
    title: "Revenue",
    rows: report.incomeStatement.revenues,
    totalLabel: "Total Revenue",
    totalValue: report.incomeStatement.totals.revenue,
  });
  pushSection(acc, {
    title: "Expenses",
    rows: report.incomeStatement.expenses,
    totalLabel: "Total Expenses",
    totalValue: report.incomeStatement.totals.expenses,
  });
  pushRow(acc, ["Net Income", report.incomeStatement.totals.netIncome], {
    kind: "net",
  });
  return finalizeSheet(acc);
}

function buildBalanceSheet(
  report: Awaited<ReturnType<typeof buildReportData>>
): XLSX.WorkSheet {
  const acc = createAccumulator();
  pushHeader(acc, "Balance Sheet", report.period, report.generatedAt);
  pushSection(acc, {
    title: "Assets",
    rows: report.balanceSheet.assets,
    totalLabel: "Total Assets",
    totalValue: report.balanceSheet.totals.assets,
  });
  pushSection(acc, {
    title: "Liabilities",
    rows: report.balanceSheet.liabilities,
    totalLabel: "Total Liabilities",
    totalValue: report.balanceSheet.totals.liabilities,
  });
  pushSection(acc, {
    title: "Equity",
    rows: report.balanceSheet.equity,
    totalLabel: "Total Equity",
    totalValue: report.balanceSheet.totals.equity,
    includeSpacer: false,
  });
  return finalizeSheet(acc);
}

function buildCashFlowSheet(
  report: Awaited<ReturnType<typeof buildReportData>>
): XLSX.WorkSheet {
  const acc = createAccumulator();
  pushHeader(acc, "Cash Flow Statement", report.period, report.generatedAt);
  pushSection(acc, {
    title: "Operating Activities",
    rows: report.cashFlow.operating,
    totalLabel: "Net Operating Cash Flow",
    totalValue: report.cashFlow.totals.operating,
  });
  pushSection(acc, {
    title: "Investing Activities",
    rows: report.cashFlow.investing,
    totalLabel: "Net Investing Cash Flow",
    totalValue: report.cashFlow.totals.investing,
  });
  pushSection(acc, {
    title: "Financing Activities",
    rows: report.cashFlow.financing,
    totalLabel: "Net Financing Cash Flow",
    totalValue: report.cashFlow.totals.financing,
  });
  pushRow(acc, ["Net Change in Cash", report.cashFlow.totals.netChange], {
    kind: "net",
  });
  return finalizeSheet(acc);
}

const SHEET_BUILDERS: Record<string, SheetBuilder> = {
  "income-statement": buildIncomeSheet,
  "balance-sheet": buildBalanceSheet,
  "cash-flow": buildCashFlowSheet,
};

const SHEET_NAMES: Record<string, string> = {
  "income-statement": "Income Statement",
  "balance-sheet": "Balance Sheet",
  "cash-flow": "Cash Flow",
};

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period");
    const typeParam = searchParams.get("type");

    const period: PeriodKey = isValidPeriod(periodParam)
      ? periodParam
      : DEFAULT_PERIOD;

    if (typeParam && !VALID_TYPES.has(typeParam)) {
      return NextResponse.json(
        { error: "Unknown report type." },
        { status: 400 }
      );
    }

    const report = await buildReportData(user.userId, period);
    const workbook = XLSX.utils.book_new();

    const typesToExport = typeParam ? [typeParam] : Array.from(VALID_TYPES);

    typesToExport.forEach((type) => {
      const builder = SHEET_BUILDERS[type];
      if (!builder) {
        return;
      }
      const sheet = builder(report);
      const sheetName = (SHEET_NAMES[type] ?? type).slice(0, 31);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    });

    const arrayBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    }) as ArrayBuffer;
    const filename = `report-${typeParam ?? "full"}-${period}.xlsx`;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=${filename}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Report export error", error);
    return NextResponse.json(
      { error: "Failed to export report." },
      { status: 500 }
    );
  }
}
