export type ReportAdjustmentType =
  | "income-statement"
  | "balance-sheet"
  | "cash-flow";

export type IncomeStatementAdjustmentSection = "revenues" | "expenses";
export type BalanceSheetAdjustmentSection = "assets" | "liabilities" | "equity";
export type CashFlowAdjustmentSection = "operating" | "investing" | "financing";

export type ReportAdjustmentSection =
  | IncomeStatementAdjustmentSection
  | BalanceSheetAdjustmentSection
  | CashFlowAdjustmentSection;

type SectionDefinition = {
  label: string;
  value: ReportAdjustmentSection;
};

type SectionOptionsMap = Record<ReportAdjustmentType, SectionDefinition[]>;

export const REPORT_ADJUSTMENT_SECTIONS: SectionOptionsMap = {
  "income-statement": [
    { value: "revenues", label: "Revenue" },
    { value: "expenses", label: "Operating Expenses" },
  ],
  "balance-sheet": [
    { value: "assets", label: "Assets" },
    { value: "liabilities", label: "Liabilities" },
    { value: "equity", label: "Equity" },
  ],
  "cash-flow": [
    { value: "operating", label: "Operating Cash Flow" },
    { value: "investing", label: "Investing Cash Flow" },
    { value: "financing", label: "Financing Cash Flow" },
  ],
};

export function isValidAdjustmentType(
  value: unknown
): value is ReportAdjustmentType {
  return (
    value === "income-statement" ||
    value === "balance-sheet" ||
    value === "cash-flow"
  );
}

export function isValidAdjustmentSection(
  type: ReportAdjustmentType,
  section: unknown
): section is ReportAdjustmentSection {
  if (typeof section !== "string") {
    return false;
  }
  return REPORT_ADJUSTMENT_SECTIONS[type].some(
    (option) => option.value === section
  );
}
