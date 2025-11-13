export type TransactionPresetKey = "cash" | "cogs" | "purchase";

export type CashFlowCategory = "operating" | "investing" | "financing";

type TransactionPresetConfig = {
  label: string;
  financeType: "income" | "expense";
  category: string;
  cashFlowCategory: CashFlowCategory;
  defaultDescription?: string;
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
  },
  cogs: {
    label: "COGS",
    financeType: "expense",
    category: "Cost of Goods Sold",
    cashFlowCategory: "operating",
    defaultDescription: "Pembelian Bahan Baku",
  },
  purchase: {
    label: "Purchase",
    financeType: "expense",
    category: "Purchase",
    cashFlowCategory: "operating",
    defaultDescription: "Pembelian Persediaan",
  },
};

const PRESET_KEYS = Object.keys(TRANSACTION_PRESETS) as TransactionPresetKey[];

export function isTransactionPresetKey(
  value: string | null | undefined
): value is TransactionPresetKey {
  return typeof value === "string" && PRESET_KEYS.includes(value as never);
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
