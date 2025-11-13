import { ObjectId } from "mongodb";

import clientPromise from "./mongodb";
import {
  TRANSACTION_PRESETS,
  isTransactionPresetKey,
  type TransactionPresetKey,
} from "./transaction-presets";

export type PeriodKey =
  | "current-month"
  | "last-month"
  | "current-quarter"
  | "last-quarter"
  | "year-to-date"
  | "last-year";

type CashFlowType = "operating" | "investing" | "financing";

type TransactionDocument = {
  _id?: {
    toString(): string;
  };
  [key: string]: unknown;
  userId?: ObjectId;
  presetKey?: string | null;
  presetLabel?: string | null;
};

type NormalizedTransaction = {
  id: string;
  amount: number;
  type: "income" | "expense";
  date: Date;
  description: string;
  category: string;
  status: string;
  cashFlowType: CashFlowType;
  counterparty?: string;
  presetKey?: string | null;
  presetLabel?: string | null;
};

export type CreateTransactionInput = {
  type: "income" | "expense";
  amount: number;
  date: Date;
  description: string;
  category: string;
  status: "posted" | "pending";
  cashFlowType: CashFlowType;
  counterparty?: string | null;
  presetKey?: TransactionPresetKey | null;
  presetLabel?: string | null;
};

export type UpdateTransactionInput = {
  type?: "income" | "expense";
  amount?: number;
  date?: Date;
  description?: string;
  category?: string;
  status?: "posted" | "pending";
  cashFlowType?: CashFlowType;
  counterparty?: string | null;
  presetKey?: TransactionPresetKey | null;
  presetLabel?: string | null;
};

type ReportRow = {
  label: string;
  amount: number;
  description?: string;
};

export interface DashboardSnapshot {
  metrics: {
    incomeThisMonth: number;
    expensesThisMonth: number;
    cashBalance: number;
  };
  monthlyTrend: Array<{
    label: string;
    income: number;
    expenses: number;
  }>;
  notifications: string[];
}

export interface FinanceOverview {
  metrics: {
    cashBalance: number;
    accountsReceivable: number;
    accountsPayable: number;
    netIncomeMTD: number;
  };
  recentTransactions: Array<{
    id: string;
    date: string;
    description: string;
    type: "income" | "expense";
    amount: number;
    status: string;
    category: string;
    displayType: string;
  }>;
}

export interface ReportData {
  period: string;
  range: {
    start: string;
    end: string;
  };
  generatedAt: string;
  incomeStatement: {
    revenues: ReportRow[];
    expenses: ReportRow[];
    totals: {
      revenue: number;
      expenses: number;
      netIncome: number;
    };
  };
  balanceSheet: {
    assets: ReportRow[];
    liabilities: ReportRow[];
    equity: ReportRow[];
    totals: {
      assets: number;
      liabilities: number;
      equity: number;
    };
  };
  cashFlow: {
    operating: ReportRow[];
    investing: ReportRow[];
    financing: ReportRow[];
    totals: {
      operating: number;
      investing: number;
      financing: number;
      netChange: number;
    };
  };
}

type PeriodRange = {
  start: Date;
  end: Date;
  label: string;
};

const DEFAULT_DB_NAME = process.env.MONGODB_DB ?? "cloud-erp";

function toNumber(value: unknown): number {
  const result =
    typeof value === "number" ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(result) ? result : 0;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normaliseTransaction(
  doc: TransactionDocument
): NormalizedTransaction | null {
  const id = typeof doc._id?.toString === "function" ? doc._id.toString() : "";
  const type = doc.type === "expense" ? "expense" : "income";
  const amount = Math.abs(toNumber(doc.amount));
  const date = toDate(doc.date);

  if (!date) {
    return null;
  }

  const category =
    typeof doc.category === "string"
      ? doc.category
      : type === "income"
      ? "General Income"
      : "General Expense";

  const status = typeof doc.status === "string" ? doc.status : "posted";

  const cashFlowType: CashFlowType =
    doc.cashFlowType === "investing" || doc.cashFlowType === "financing"
      ? (doc.cashFlowType as CashFlowType)
      : "operating";

  return {
    id,
    type,
    amount,
    date,
    description: typeof doc.description === "string" ? doc.description : "",
    category,
    status,
    cashFlowType,
    counterparty:
      typeof doc.counterparty === "string" ? doc.counterparty : undefined,
    presetKey:
      typeof doc.presetKey === "string" && doc.presetKey.trim()
        ? doc.presetKey
        : null,
    presetLabel:
      typeof doc.presetLabel === "string" && doc.presetLabel.trim()
        ? doc.presetLabel
        : null,
  };
}

async function fetchTransactions(
  userId: ObjectId
): Promise<NormalizedTransaction[]> {
  const client = await clientPromise;
  const db = client.db(DEFAULT_DB_NAME);
  const documents = await db
    .collection<TransactionDocument>("transactions")
    .find({ userId })
    .toArray();

  return documents
    .map((doc) => normaliseTransaction(doc))
    .filter((item): item is NormalizedTransaction => Boolean(item));
}

export async function createTransaction(
  userId: ObjectId,
  input: CreateTransactionInput
) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid transaction date.");
  }

  const client = await clientPromise;
  const db = client.db(DEFAULT_DB_NAME);

  const now = new Date();
  const document = {
    userId,
    type: input.type,
    amount: Math.abs(input.amount),
    date,
    description: input.description,
    category: input.category,
    status: input.status,
    cashFlowType: input.cashFlowType,
    counterparty: input.counterparty ?? null,
    presetKey: input.presetKey ?? null,
    presetLabel: input.presetLabel ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection("transactions").insertOne(document);

  return {
    ...document,
    _id: result.insertedId,
  } satisfies TransactionDocument;
}

export async function updateTransaction(
  id: string,
  userId: ObjectId,
  changes: UpdateTransactionInput
) {
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid transaction identifier.");
  }

  const client = await clientPromise;
  const db = client.db(DEFAULT_DB_NAME);
  const collection = db.collection<TransactionDocument>("transactions");

  const update: Record<string, unknown> = {};

  if (changes.amount !== undefined) {
    if (!Number.isFinite(changes.amount) || changes.amount <= 0) {
      throw new Error("Amount must be greater than zero.");
    }
    update.amount = Math.abs(changes.amount);
  }

  if (changes.date !== undefined) {
    const parsed = new Date(changes.date);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Invalid transaction date.");
    }
    update.date = parsed;
  }

  if (changes.type !== undefined) {
    update.type = changes.type === "expense" ? "expense" : "income";
  }

  if (changes.description !== undefined) {
    update.description = changes.description;
  }

  if (changes.category !== undefined) {
    update.category = changes.category;
  }

  if (changes.status !== undefined) {
    update.status = changes.status === "pending" ? "pending" : "posted";
  }

  if (changes.cashFlowType !== undefined) {
    update.cashFlowType =
      changes.cashFlowType === "investing" ||
      changes.cashFlowType === "financing"
        ? changes.cashFlowType
        : "operating";
  }

  if (changes.counterparty !== undefined) {
    update.counterparty = changes.counterparty;
  }

  if (changes.presetKey !== undefined) {
    if (
      changes.presetKey === null ||
      (typeof changes.presetKey === "string" &&
        isTransactionPresetKey(changes.presetKey))
    ) {
      update.presetKey = changes.presetKey;
      if (changes.presetKey && isTransactionPresetKey(changes.presetKey)) {
        update.presetLabel = TRANSACTION_PRESETS[changes.presetKey].label;
      }
    }
  }

  if (changes.presetLabel !== undefined) {
    update.presetLabel = changes.presetLabel;
  }

  if (Object.keys(update).length === 0) {
    throw new Error("No valid fields provided for update.");
  }

  update.updatedAt = new Date();

  const updatedDoc = await collection.findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!updatedDoc) {
    throw new Error("Transaction not found.");
  }

  const normalized = normaliseTransaction(updatedDoc as TransactionDocument);
  if (!normalized) {
    throw new Error("Failed to normalize updated transaction.");
  }

  return normalized;
}

export async function deleteTransaction(id: string, userId: ObjectId) {
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid transaction identifier.");
  }

  const client = await clientPromise;
  const db = client.db(DEFAULT_DB_NAME);
  const result = await db
    .collection("transactions")
    .deleteOne({ _id: new ObjectId(id), userId });

  if (result.deletedCount === 0) {
    throw new Error("Transaction not found.");
  }

  return { success: true } as const;
}

function getPeriodRange(key: PeriodKey, reference = new Date()): PeriodRange {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const makeLabel = (label: string) => label;

  switch (key) {
    case "last-month": {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      return {
        start,
        end,
        label: makeLabel(
          `Last Month (${start.toLocaleString("en-US", {
            month: "short",
            year: "numeric",
          })})`
        ),
      };
    }
    case "current-quarter": {
      const quarterStartMonth = Math.floor(month / 3) * 3;
      const start = new Date(year, quarterStartMonth, 1);
      const end = new Date(year, quarterStartMonth + 3, 1);
      return {
        start,
        end,
        label: makeLabel(
          `Current Quarter (${start.toLocaleString("en-US", {
            month: "short",
          })} - ${new Date(end.getTime() - 1).toLocaleString("en-US", {
            month: "short",
            year: "numeric",
          })})`
        ),
      };
    }
    case "last-quarter": {
      const quarterStartMonth = Math.floor((month - 3) / 3) * 3;
      const start = new Date(year, quarterStartMonth, 1);
      const end = new Date(year, quarterStartMonth + 3, 1);
      return {
        start,
        end,
        label: makeLabel(
          `Last Quarter (${start.toLocaleString("en-US", {
            month: "short",
          })} - ${new Date(end.getTime() - 1).toLocaleString("en-US", {
            month: "short",
            year: "numeric",
          })})`
        ),
      };
    }
    case "year-to-date": {
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      return {
        start,
        end,
        label: makeLabel(`Year to Date (${year})`),
      };
    }
    case "last-year": {
      const start = new Date(year - 1, 0, 1);
      const end = new Date(year, 0, 1);
      return {
        start,
        end,
        label: makeLabel(`Last Year (${year - 1})`),
      };
    }
    case "current-month":
    default: {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 1);
      return {
        start,
        end,
        label: makeLabel(
          `Current Month (${start.toLocaleString("en-US", {
            month: "long",
            year: "numeric",
          })})`
        ),
      };
    }
  }
}

function filterByPeriod(
  transactions: NormalizedTransaction[],
  period: PeriodRange
) {
  return transactions.filter(
    (transaction) =>
      transaction.date >= period.start && transaction.date < period.end
  );
}

function sumTransactions(
  transactions: NormalizedTransaction[],
  options?: { signed?: boolean }
) {
  const signed = options?.signed ?? false;
  return transactions.reduce((total, transaction) => {
    const sign = signed && transaction.type === "expense" ? -1 : 1;
    return total + transaction.amount * sign;
  }, 0);
}

function aggregateByCategory(
  transactions: NormalizedTransaction[],
  fallbackLabel: string,
  options?: { signed?: boolean }
): ReportRow[] {
  const map = new Map<string, number>();
  const signed = options?.signed ?? false;

  transactions.forEach((transaction) => {
    const label = transaction.category || fallbackLabel;
    const sign = signed && transaction.type === "expense" ? -1 : 1;
    const current = map.get(label) ?? 0;
    map.set(label, current + transaction.amount * sign);
  });

  return Array.from(map.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function mapCashFlowRows(
  transactions: NormalizedTransaction[],
  fallbackLabel: string
): ReportRow[] {
  if (!transactions.length) {
    return [];
  }

  const rows = transactions.map((transaction) => {
    const rawDescription =
      typeof transaction.description === "string"
        ? transaction.description.trim()
        : "";
    const category =
      typeof transaction.category === "string"
        ? transaction.category.trim()
        : "";
    const presetLabelRaw =
      typeof transaction.presetLabel === "string"
        ? transaction.presetLabel.trim()
        : "";
    const presetLabel = presetLabelRaw.length
      ? presetLabelRaw
      : transaction.presetKey && isTransactionPresetKey(transaction.presetKey)
      ? TRANSACTION_PRESETS[transaction.presetKey].label
      : "";

    const labelBase = category.length
      ? category
      : presetLabel.length
      ? presetLabel
      : fallbackLabel;

    const description = rawDescription.length ? rawDescription : undefined;

    const amount =
      transaction.type === "expense" ? -transaction.amount : transaction.amount;

    return {
      label: labelBase,
      description,
      amount,
    };
  });

  return rows
    .map((row) =>
      row.description && row.description === row.label
        ? { ...row, description: undefined }
        : row
    )
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function buildMonthlyTrend(transactions: NormalizedTransaction[]) {
  const map = new Map<
    string,
    {
      label: string;
      income: number;
      expenses: number;
      sortKey: number;
    }
  >();

  transactions.forEach((transaction) => {
    const key = `${transaction.date.getFullYear()}-${transaction.date.getMonth()}`;
    const sortKey =
      transaction.date.getFullYear() * 12 + transaction.date.getMonth();
    const label = transaction.date.toLocaleString("en-US", {
      month: "short",
      year: "numeric",
    });
    const entry = map.get(key) ?? { label, income: 0, expenses: 0, sortKey };

    if (transaction.type === "income") {
      entry.income += transaction.amount;
    } else {
      entry.expenses += transaction.amount;
    }

    map.set(key, entry);
  });

  return Array.from(map.values())
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(-6)
    .map(({ sortKey, ...rest }) => rest);
}

function buildNotifications(
  transactions: NormalizedTransaction[],
  cashBalance: number
): string[] {
  const notifications = new Set<string>();
  const now = new Date();

  if (cashBalance < 0) {
    notifications.add(
      "Cash balance is negative. Review cash flow requirements."
    );
  }

  const pendingIncome = transactions.filter(
    (transaction) =>
      transaction.type === "income" && transaction.status === "pending"
  );
  if (pendingIncome.length) {
    notifications.add(
      `${pendingIncome.length} income transaction(s) pending collection.`
    );
  }

  const overdueExpenses = transactions.filter(
    (transaction) =>
      transaction.type === "expense" &&
      transaction.status === "pending" &&
      transaction.date.getTime() < now.getTime()
  );
  if (overdueExpenses.length) {
    notifications.add(
      `${overdueExpenses.length} expense transaction(s) awaiting settlement.`
    );
  }

  return Array.from(notifications);
}

export async function buildDashboardSnapshot(
  userId: ObjectId
): Promise<DashboardSnapshot> {
  const transactions = await fetchTransactions(userId);
  const period = getPeriodRange("current-month");
  const periodTransactions = filterByPeriod(transactions, period);

  const incomeThisMonth = sumTransactions(
    periodTransactions.filter((transaction) => transaction.type === "income")
  );
  const expensesThisMonth = sumTransactions(
    periodTransactions.filter((transaction) => transaction.type === "expense")
  );
  const cashBalance = sumTransactions(transactions, { signed: true });

  return {
    metrics: {
      incomeThisMonth,
      expensesThisMonth,
      cashBalance,
    },
    monthlyTrend: buildMonthlyTrend(transactions),
    notifications: buildNotifications(transactions, cashBalance),
  };
}

export async function buildFinanceOverview(
  userId: ObjectId
): Promise<FinanceOverview> {
  const transactions = await fetchTransactions(userId);
  const period = getPeriodRange("current-month");
  const periodTransactions = filterByPeriod(transactions, period);

  const cashBalance = sumTransactions(transactions, { signed: true });
  const accountsReceivable = sumTransactions(
    transactions.filter(
      (transaction) =>
        transaction.type === "income" && transaction.status === "pending"
    )
  );
  const accountsPayable = sumTransactions(
    transactions.filter(
      (transaction) =>
        transaction.type === "expense" && transaction.status === "pending"
    )
  );
  const netIncomeMTD =
    sumTransactions(
      periodTransactions.filter((transaction) => transaction.type === "income")
    ) -
    sumTransactions(
      periodTransactions.filter((transaction) => transaction.type === "expense")
    );

  const recentTransactions = transactions
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10)
    .map((transaction) => ({
      id: transaction.id,
      date: transaction.date.toISOString(),
      description: transaction.description || transaction.category,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      category: transaction.category,
      cashFlowType: transaction.cashFlowType,
      presetKey: transaction.presetKey ?? undefined,
      presetLabel: transaction.presetLabel ?? undefined,
      displayType:
        transaction.presetLabel && transaction.presetLabel.length
          ? transaction.presetLabel
          : transaction.presetKey &&
            isTransactionPresetKey(transaction.presetKey)
          ? TRANSACTION_PRESETS[transaction.presetKey].label
          : transaction.category || transaction.type,
    }));

  return {
    metrics: {
      cashBalance,
      accountsReceivable,
      accountsPayable,
      netIncomeMTD,
    },
    recentTransactions,
  };
}

type AccountDocument = {
  name?: string;
  label?: string;
  balance?: number;
  amount?: number;
  type?: string;
  userId?: ObjectId;
};

function normaliseAccounts(docs: AccountDocument[]): {
  assets: ReportRow[];
  liabilities: ReportRow[];
  equity: ReportRow[];
} {
  const assets: ReportRow[] = [];
  const liabilities: ReportRow[] = [];
  const equity: ReportRow[] = [];

  docs.forEach((doc) => {
    const amount = toNumber(doc.balance ?? doc.amount);
    const label = doc.name ?? doc.label ?? "Untitled";
    switch (doc.type) {
      case "asset":
        assets.push({ label, amount });
        break;
      case "liability":
        liabilities.push({ label, amount });
        break;
      case "equity":
        equity.push({ label, amount });
        break;
      default:
        break;
    }
  });

  const sortByAmount = (rows: ReportRow[]) =>
    rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return {
    assets: sortByAmount(assets),
    liabilities: sortByAmount(liabilities),
    equity: sortByAmount(equity),
  };
}

function ensureBalanceSheetCompleteness(
  source: {
    assets: ReportRow[];
    liabilities: ReportRow[];
    equity: ReportRow[];
  },
  fallback: { cashBalance: number; receivables: number; payables: number }
) {
  const assets = source.assets.length ? [...source.assets] : [];
  const liabilities = source.liabilities.length ? [...source.liabilities] : [];
  const equity = source.equity.length ? [...source.equity] : [];

  const derivedCash = Math.max(fallback.cashBalance, 0);

  if (!assets.length && (derivedCash !== 0 || fallback.receivables !== 0)) {
    if (derivedCash) {
      assets.push({ label: "Cash & Equivalents", amount: derivedCash });
    }
    if (fallback.receivables) {
      assets.push({
        label: "Accounts Receivable",
        amount: fallback.receivables,
      });
    }
  }

  if (!liabilities.length && fallback.payables) {
    liabilities.push({ label: "Accounts Payable", amount: fallback.payables });
  }

  const totalAssets = assets.reduce((sum, row) => sum + row.amount, 0);
  const totalLiabilities = liabilities.reduce(
    (sum, row) => sum + row.amount,
    0
  );
  const equityTotal = equity.reduce((sum, row) => sum + row.amount, 0);

  if (!equity.length && totalAssets - totalLiabilities !== 0) {
    equity.push({
      label: "Retained Earnings",
      amount: totalAssets - totalLiabilities,
    });
  } else if (
    equity.length &&
    Math.abs(totalAssets - totalLiabilities - equityTotal) > 0.01
  ) {
    equity.push({
      label: "Balance Adjustment",
      amount: totalAssets - totalLiabilities - equityTotal,
    });
  }

  return { assets, liabilities, equity };
}

export async function buildReportData(
  userId: ObjectId,
  periodKey: PeriodKey
): Promise<ReportData> {
  const transactions = await fetchTransactions(userId);
  const period = getPeriodRange(periodKey);
  const periodTransactions = filterByPeriod(transactions, period);

  const revenues = aggregateByCategory(
    periodTransactions.filter((transaction) => transaction.type === "income"),
    "Uncategorised Income"
  );
  const expenses = aggregateByCategory(
    periodTransactions.filter((transaction) => transaction.type === "expense"),
    "Uncategorised Expense"
  );

  const totalRevenue = revenues.reduce((sum, row) => sum + row.amount, 0);
  const totalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);

  const client = await clientPromise;
  const db = client.db(DEFAULT_DB_NAME);
  const accountDocs = await db
    .collection<AccountDocument>("accounts")
    .find({ userId })
    .toArray();
  const accounts = normaliseAccounts(accountDocs);
  const cashBalance = sumTransactions(transactions, { signed: true });
  const receivables = sumTransactions(
    transactions.filter(
      (transaction) =>
        transaction.type === "income" && transaction.status === "pending"
    )
  );
  const payables = sumTransactions(
    transactions.filter(
      (transaction) =>
        transaction.type === "expense" && transaction.status === "pending"
    )
  );

  const balanceSheet = ensureBalanceSheetCompleteness(accounts, {
    cashBalance,
    receivables,
    payables,
  });

  const operatingTransactions = periodTransactions.filter(
    (transaction) => transaction.cashFlowType === "operating"
  );
  const investingTransactions = periodTransactions.filter(
    (transaction) => transaction.cashFlowType === "investing"
  );
  const financingTransactions = periodTransactions.filter(
    (transaction) => transaction.cashFlowType === "financing"
  );

  const operating = mapCashFlowRows(
    operatingTransactions,
    "Operating Activities"
  );
  const investing = mapCashFlowRows(
    investingTransactions,
    "Investing Activities"
  );
  const financing = mapCashFlowRows(
    financingTransactions,
    "Financing Activities"
  );

  const totalOperating = operating.reduce((sum, row) => sum + row.amount, 0);
  const totalInvesting = investing.reduce((sum, row) => sum + row.amount, 0);
  const totalFinancing = financing.reduce((sum, row) => sum + row.amount, 0);

  return {
    period: period.label,
    range: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    },
    generatedAt: new Date().toISOString(),
    incomeStatement: {
      revenues,
      expenses,
      totals: {
        revenue: totalRevenue,
        expenses: totalExpenses,
        netIncome: totalRevenue - totalExpenses,
      },
    },
    balanceSheet: {
      assets: balanceSheet.assets,
      liabilities: balanceSheet.liabilities,
      equity: balanceSheet.equity,
      totals: {
        assets: balanceSheet.assets.reduce((sum, row) => sum + row.amount, 0),
        liabilities: balanceSheet.liabilities.reduce(
          (sum, row) => sum + row.amount,
          0
        ),
        equity: balanceSheet.equity.reduce((sum, row) => sum + row.amount, 0),
      },
    },
    cashFlow: {
      operating,
      investing,
      financing,
      totals: {
        operating: totalOperating,
        investing: totalInvesting,
        financing: totalFinancing,
        netChange: totalOperating + totalInvesting + totalFinancing,
      },
    },
  };
}
