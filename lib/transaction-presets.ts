export const FINANCE_ENTRY_TYPES = [
  "income",
  "expense",
  "asset",
  "liability",
  "equity",
] as const;

export type FinanceEntryType = (typeof FINANCE_ENTRY_TYPES)[number];

export type TransactionPresetKey = "cash" | "cogs" | "purchase";

export type CashFlowCategory =
  | "operating"
  | "investing"
  | "financing"
  | "non-cash";

export type JournalTemplate = {
  debitAccount: string;
  creditAccount: string;
  cashImpact: CashFlowCategory;
  description?: string;
};

type TransactionPresetConfig = {
  label: string;
  financeType: Extract<FinanceEntryType, "income" | "expense">;
  category: string;
  cashFlowCategory: CashFlowCategory;
  defaultDescription?: string;
  journal: JournalTemplate;
};

export const TRANSACTION_PRESETS: Record<
  TransactionPresetKey,
  TransactionPresetConfig
> = {
  cash: {
    label: "Cash",
    financeType: "income",
    category: "Cash Receipt",
    cashFlowCategory: "operating",
    defaultDescription: "Penerimaan Kas",
    journal: {
      debitAccount: "1000",
      creditAccount: "4000",
      cashImpact: "operating",
      description: "Penerimaan kas dari penjualan",
    },
  },
  cogs: {
    label: "COGS",
    financeType: "expense",
    category: "Cost of Goods Sold",
    cashFlowCategory: "operating",
    defaultDescription: "Pembelian Bahan Baku",
    journal: {
      debitAccount: "5000",
      creditAccount: "1200",
      cashImpact: "non-cash",
      description: "Pengakuan HPP dari persediaan",
    },
  },
  purchase: {
    label: "Purchase",
    financeType: "expense",
    category: "Purchase",
    cashFlowCategory: "operating",
    defaultDescription: "Pembelian Persediaan",
    journal: {
      debitAccount: "1200",
      creditAccount: "1000",
      cashImpact: "operating",
      description: "Pembelian persediaan tunai",
    },
  },
};

const PRESET_KEYS = Object.keys(TRANSACTION_PRESETS) as TransactionPresetKey[];

export function isTransactionPresetKey(
  value: string | null | undefined
): value is TransactionPresetKey {
  return typeof value === "string" && PRESET_KEYS.includes(value as never);
}

export function normaliseFinanceEntryType(
  value: unknown
): FinanceEntryType | null {
  if (typeof value !== "string") {
    return null;
  }
  const candidate = value.toLowerCase() as FinanceEntryType;
  return FINANCE_ENTRY_TYPES.includes(candidate) ? candidate : null;
}

export function findPresetKeyByLabel(
  label: string | null | undefined
): TransactionPresetKey | null {
  if (!label) {
    return null;
  }
  const match = PRESET_KEYS.find(
    (key) =>
      TRANSACTION_PRESETS[key].label.toLowerCase() === label.toLowerCase()
  );
  return match ?? null;
}
