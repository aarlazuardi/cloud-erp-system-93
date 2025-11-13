export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export type CashFlowCategory =
  | "operating"
  | "investing"
  | "financing"
  | "non-cash";

export interface AccountDefinition {
  code: string;
  name: string;
  type: AccountType;
  cashFlowCategory?: CashFlowCategory;
  isCash?: boolean;
  isRetainedEarnings?: boolean;
}

export const CHART_OF_ACCOUNTS: Record<string, AccountDefinition> = {
  // Assets (1000-1999)
  "1000": {
    code: "1000",
    name: "Cash & Cash Equivalents",
    type: "asset",
    cashFlowCategory: "operating",
    isCash: true,
  },
  "1100": {
    code: "1100",
    name: "Accounts Receivable",
    type: "asset",
  },
  "1200": {
    code: "1200",
    name: "Inventory",
    type: "asset",
  },
  "1500": {
    code: "1500",
    name: "Fixed Assets",
    type: "asset",
    cashFlowCategory: "investing",
  },
  "1600": {
    code: "1600",
    name: "Accumulated Depreciation",
    type: "asset", // Contra-asset (negative)
  },

  // Liabilities (2000-2999)
  "2100": {
    code: "2100",
    name: "Accounts Payable",
    type: "liability",
  },
  "2200": {
    code: "2200",
    name: "Bank Loans",
    type: "liability",
    cashFlowCategory: "financing",
  },

  // Equity (3000-3999)
  "3100": {
    code: "3100",
    name: "Owner's Equity",
    type: "equity",
    cashFlowCategory: "financing",
  },
  "3200": {
    code: "3200",
    name: "Retained Earnings",
    type: "equity",
    isRetainedEarnings: true,
  },

  // Revenue (4000-4999)
  "4000": {
    code: "4000",
    name: "Sales Revenue",
    type: "revenue",
  },
  "4100": {
    code: "4100",
    name: "Other Revenue",
    type: "revenue",
  },

  // Expenses (5000-5999)
  "5000": {
    code: "5000",
    name: "Cost of Goods Sold",
    type: "expense",
  },
  "5100": {
    code: "5100",
    name: "Operating Expenses",
    type: "expense",
  },
  "5200": {
    code: "5200",
    name: "Depreciation Expense",
    type: "expense",
    cashFlowCategory: "non-cash",
  },
  "5300": {
    code: "5300",
    name: "Tax Expense",
    type: "expense",
  },
};

export function getAccountDefinition(code: string): AccountDefinition | null {
  return CHART_OF_ACCOUNTS[code] ?? null;
}

export function isCashAccount(code: string): boolean {
  return Boolean(CHART_OF_ACCOUNTS[code]?.isCash);
}
