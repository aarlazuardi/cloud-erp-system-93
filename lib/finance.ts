import { ObjectId } from "mongodb";

import clientPromise from "./mongodb";
import {
  deleteJournal,
  postJournal,
  replaceJournal,
  type JournalDraft,
  type JournalEntryDocument,
} from "./journal";
import { getAccountDefinition } from "./chart-of-accounts";
import { fetchReportAdjustmentsForPeriod } from "./report-adjustments";
import {
  TRANSACTION_PRESETS,
  isTransactionPresetKey,
  normaliseFinanceEntryType,
  type FinanceEntryType,
  type TransactionPresetKey,
} from "./transaction-presets";

export type PeriodKey =
  | "current-month"
  | "last-month"
  | "current-quarter"
  | "last-quarter"
  | "year-to-date"
  | "last-year"
  | "all-time";

type CashFlowType = "operating" | "investing" | "financing" | "non-cash";

export const DEFAULT_CATEGORY_BY_TYPE: Record<FinanceEntryType, string> = {
  income: "General Income",
  expense: "General Expense",
  asset: "General Asset",
  liability: "General Liability",
  equity: "General Equity",
};

const ACCOUNT_CODES = {
  CASH: "1000",
  ACCOUNTS_RECEIVABLE: "1100",
  INVENTORY: "1200",
  FIXED_ASSET: "1500",
  ACCUMULATED_DEPRECIATION: "1600",
  ACCOUNTS_PAYABLE: "2100",
  LOAN: "2200",
  OWNER_EQUITY: "3100",
  RETAINED_EARNINGS: "3200",
  SALES_REVENUE: "4000",
  OTHER_REVENUE: "4100",
  COST_OF_GOODS: "5000",
  OPERATING_EXPENSE: "5100",
  DEPRECIATION_EXPENSE: "5200",
  TAX_EXPENSE: "5300",
} as const;

type TransactionJournalSource = {
  amount: number;
  type: FinanceEntryType;
  date: Date;
  description: string;
  category: string;
  status: "posted" | "pending";
  cashFlowType: CashFlowType;
  presetKey?: TransactionPresetKey;
};

function toObjectId(value: unknown): ObjectId | null {
  if (!value) {
    return null;
  }
  if (value instanceof ObjectId) {
    return value;
  }
  if (typeof value === "string" && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return null;
}

function normaliseMemo(description: string, category: string): string {
  const trimmed = description.trim();
  return trimmed.length ? trimmed : category;
}

function chooseRevenueAccount(category: string): string {
  const name = category.toLowerCase();
  return name.includes("lain") || name.includes("jasa")
    ? ACCOUNT_CODES.OTHER_REVENUE
    : ACCOUNT_CODES.SALES_REVENUE;
}

function chooseExpenseAccount(
  category: string,
  cashFlowType: CashFlowType
): string {
  if (cashFlowType === "non-cash") {
    return ACCOUNT_CODES.DEPRECIATION_EXPENSE;
  }

  const name = category.toLowerCase();
  if (name.includes("hpp") || name.includes("cogs")) {
    return ACCOUNT_CODES.COST_OF_GOODS;
  }
  if (name.includes("pajak")) {
    return ACCOUNT_CODES.TAX_EXPENSE;
  }
  if (name.includes("penyusutan")) {
    return ACCOUNT_CODES.DEPRECIATION_EXPENSE;
  }
  return ACCOUNT_CODES.OPERATING_EXPENSE;
}

function chooseAssetAccount(source: TransactionJournalSource): string {
  const name = source.category.toLowerCase();
  if (name.includes("persediaan")) {
    return ACCOUNT_CODES.INVENTORY;
  }
  if (name.includes("penyusutan")) {
    return ACCOUNT_CODES.ACCUMULATED_DEPRECIATION;
  }
  if (source.cashFlowType === "operating") {
    return ACCOUNT_CODES.INVENTORY;
  }
  return ACCOUNT_CODES.FIXED_ASSET;
}

function chooseLiabilityAccount(category: string): string {
  const name = category.toLowerCase();
  if (name.includes("usaha") || name.includes("supplier")) {
    return ACCOUNT_CODES.ACCOUNTS_PAYABLE;
  }
  return ACCOUNT_CODES.LOAN;
}

function buildJournalDraftForTransaction(
  _userId: ObjectId,
  source: TransactionJournalSource,
  referenceId?: string
): JournalDraft {
  const amount = Math.abs(source.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Journal amount must be greater than zero.");
  }

  const memo = normaliseMemo(source.description, source.category);

  // Handle preset transactions first
  if (source.presetKey && isTransactionPresetKey(source.presetKey)) {
    const preset = TRANSACTION_PRESETS[source.presetKey];
    const description = memo || preset.journal.description || preset.label;

    // Validate preset accounts exist
    if (!getAccountDefinition(preset.journal.debitAccount)) {
      throw new Error(
        `Preset debit account ${preset.journal.debitAccount} not found in chart of accounts.`
      );
    }
    if (!getAccountDefinition(preset.journal.creditAccount)) {
      throw new Error(
        `Preset credit account ${preset.journal.creditAccount} not found in chart of accounts.`
      );
    }

    return {
      referenceId,
      date: source.date,
      memo,
      lines: [
        {
          accountCode: preset.journal.debitAccount,
          debit: amount,
          description,
        },
        {
          accountCode: preset.journal.creditAccount,
          credit: amount,
          description,
        },
      ],
    } satisfies JournalDraft;
  }

  // Standard transaction handling with proper double-entry logic
  let debitAccount: string;
  let creditAccount: string;

  const lineDescription = memo || source.category;

  switch (source.type) {
    case "income": {
      // Income transactions - only affect income statement
      if (source.cashFlowType === "non-cash") {
        // Non-cash income (like accrued revenue)
        debitAccount = ACCOUNT_CODES.ACCOUNTS_RECEIVABLE;
      } else {
        debitAccount =
          source.status === "pending"
            ? ACCOUNT_CODES.ACCOUNTS_RECEIVABLE
            : ACCOUNT_CODES.CASH;
      }
      creditAccount = chooseRevenueAccount(source.category);
      break;
    }

    case "expense": {
      // Expense transactions - only affect income statement
      debitAccount = chooseExpenseAccount(source.category, source.cashFlowType);

      if (source.cashFlowType === "non-cash") {
        // Non-cash expenses (like depreciation) credit accumulated depreciation
        creditAccount = ACCOUNT_CODES.ACCUMULATED_DEPRECIATION;
      } else {
        creditAccount =
          source.status === "pending"
            ? ACCOUNT_CODES.ACCOUNTS_PAYABLE
            : ACCOUNT_CODES.CASH;
      }
      break;
    }

    case "asset": {
      // Asset transactions - should only appear in assets section
      debitAccount = chooseAssetAccount(source);

      if (source.cashFlowType === "non-cash") {
        // Non-cash asset transactions - balance with another asset account
        creditAccount = ACCOUNT_CODES.ACCUMULATED_DEPRECIATION; // or create a contra-asset
      } else {
        // For cash asset transactions, we need to avoid double-counting in balance sheet
        // Use a temporary clearing account or handle differently
        creditAccount = ACCOUNT_CODES.OWNER_EQUITY; // Temporary - will be handled in reporting
      }
      break;
    }

    case "liability": {
      // Liability transactions - should only appear in liabilities section
      if (source.cashFlowType === "non-cash") {
        // Non-cash liability - balance with owner's equity
        debitAccount = ACCOUNT_CODES.OWNER_EQUITY;
      } else {
        // Cash liability - this is tricky as it affects both cash and liability
        // We'll handle this in reporting to show only in liability section
        debitAccount = ACCOUNT_CODES.OWNER_EQUITY; // Temporary - handled in reporting
      }
      creditAccount = chooseLiabilityAccount(source.category);
      break;
    }

    case "equity": {
      // Equity transactions - should only appear in equity section
      debitAccount =
        source.cashFlowType === "non-cash"
          ? chooseAssetAccount(source) // Non-cash equity contribution (asset)
          : ACCOUNT_CODES.OWNER_EQUITY; // Will be handled specially in reporting
      creditAccount = ACCOUNT_CODES.OWNER_EQUITY;
      break;
    }

    default: {
      // Default fallback
      debitAccount = ACCOUNT_CODES.CASH;
      creditAccount = ACCOUNT_CODES.SALES_REVENUE;
      break;
    }
  }

  // Validate accounts exist in chart of accounts
  if (!getAccountDefinition(debitAccount)) {
    throw new Error(
      `Debit account ${debitAccount} not found in chart of accounts.`
    );
  }
  if (!getAccountDefinition(creditAccount)) {
    throw new Error(
      `Credit account ${creditAccount} not found in chart of accounts.`
    );
  }

  return {
    referenceId,
    date: source.date,
    memo,
    lines: [
      {
        accountCode: debitAccount,
        debit: amount,
        description: lineDescription,
      },
      {
        accountCode: creditAccount,
        credit: amount,
        description: lineDescription,
      },
    ],
  } satisfies JournalDraft;
}

type TransactionDocument = {
  _id?: ObjectId;
  [key: string]: unknown;
  userId?: ObjectId;
  presetKey?: string | null;
  presetLabel?: string | null;
  journalEntryId?: ObjectId | string | null;
};

type NormalizedTransaction = {
  id: string;
  amount: number;
  type: FinanceEntryType;
  date: Date;
  description: string;
  category: string;
  status: string;
  cashFlowType: CashFlowType;
  counterparty?: string;
  presetKey?: TransactionPresetKey | null;
  presetLabel?: string | null;
};

export type CreateTransactionInput = {
  type: FinanceEntryType;
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
  type?: FinanceEntryType;
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
  isManual?: boolean;
  adjustmentId?: string;
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
    cashBalance: number;
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
    type: FinanceEntryType;
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
    cogs: ReportRow[];
    expenses: ReportRow[];
    totals: {
      revenue: number;
      cogs: number;
      grossProfit: number;
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
    validation: {
      isBalanced: boolean;
      difference: number;
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

/**
 * Calculate cash balance consistently across all pages
 * This ensures dashboard, finance, and reports show the same cash balance
 */
function calculateCashBalance(transactions: NormalizedTransaction[]): number {
  let cashBalance = 0;

  // Include non-cash transactions if they are cash-related assets (opening balance, etc.)
  const cashAffectingTransactions = transactions.filter((t) => {
    if (t.cashFlowType !== "non-cash") {
      return true; // Include all cash flow transactions
    }

    // Special case: Include cash-related assets even if marked as non-cash
    const isCashAsset =
      t.type === "asset" &&
      (t.category?.toLowerCase().includes("cash") ||
        t.category?.toLowerCase().includes("opening") ||
        t.description?.toLowerCase().includes("kas") ||
        t.description?.toLowerCase().includes("cash") ||
        t.description?.toLowerCase().includes("awal"));

    return isCashAsset;
  });

  cashAffectingTransactions.forEach((transaction) => {
    switch (transaction.type) {
      case "income":
        cashBalance += transaction.amount; // Cash inflow
        break;
      case "expense":
        cashBalance -= transaction.amount; // Cash outflow
        break;
      case "asset":
        // Check if this is a cash asset (opening balance, etc.)
        const isCashAsset =
          transaction.category?.toLowerCase().includes("cash") ||
          transaction.category?.toLowerCase().includes("opening") ||
          transaction.description?.toLowerCase().includes("kas") ||
          transaction.description?.toLowerCase().includes("cash") ||
          transaction.description?.toLowerCase().includes("awal");

        if (isCashAsset) {
          // Cash asset = increase in cash balance
          cashBalance += transaction.amount;
        } else {
          // Non-cash asset based on cash flow type:
          if (transaction.cashFlowType === "operating") {
            // Operating = asset purchase with cash (reduces cash balance)
            cashBalance -= transaction.amount;
          } else if (transaction.cashFlowType === "investing") {
            // Investing = typically equipment purchase (reduces cash balance)
            cashBalance -= transaction.amount;
          } else {
            // Financing or other = neutral (no cash impact)
            // Do nothing to cash balance
          }
        }
        break;
      case "liability":
        cashBalance += transaction.amount; // Borrowing = cash inflow
        break;
      case "equity":
        cashBalance += transaction.amount; // Capital injection = cash inflow
        break;
    }
  });

  return cashBalance;
}

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
  const type = normaliseFinanceEntryType(doc.type) ?? "income";
  const amount = Math.abs(toNumber(doc.amount));
  const date = toDate(doc.date);

  if (!date) {
    return null;
  }

  const category =
    typeof doc.category === "string" && doc.category.trim().length
      ? doc.category
      : DEFAULT_CATEGORY_BY_TYPE[type];

  const statusRaw =
    typeof doc.status === "string" ? doc.status.toLowerCase() : "posted";
  const status = statusRaw === "pending" ? "pending" : "posted";

  const cashFlowType: CashFlowType =
    doc.cashFlowType === "investing" ||
    doc.cashFlowType === "financing" ||
    doc.cashFlowType === "non-cash"
      ? (doc.cashFlowType as CashFlowType)
      : "operating";

  const presetKeyValue =
    typeof doc.presetKey === "string" && doc.presetKey.trim().length
      ? doc.presetKey.trim()
      : null;
  const presetKey =
    presetKeyValue && isTransactionPresetKey(presetKeyValue)
      ? presetKeyValue
      : null;

  const presetLabelValue =
    typeof doc.presetLabel === "string" && doc.presetLabel.trim().length
      ? doc.presetLabel.trim()
      : null;

  const presetLabel = presetKey
    ? TRANSACTION_PRESETS[presetKey].label
    : presetLabelValue;

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
    presetKey,
    presetLabel,
  };
}

async function fetchTransactions(
  userId: ObjectId
): Promise<NormalizedTransaction[]> {
  console.log("🔍 Fetching transactions for userId:", userId.toString());
  const client = await clientPromise;
  const db = client.db(DEFAULT_DB_NAME);
  
  // Debug: Check all userIds in transactions collection
  const allTransactions = await db.collection<TransactionDocument>("transactions").find({}).toArray();
  console.log("📋 Total transactions in DB:", allTransactions.length);
  const userIds = [...new Set(allTransactions.map(t => t.userId?.toString()).filter(Boolean))];
  console.log("👥 All userIds in DB:", userIds);
  console.log("🔍 Looking for userId:", userId.toString());
  console.log("📍 userId exists in DB:", userIds.includes(userId.toString()));
  
  const documents = await db
    .collection<TransactionDocument>("transactions")
    .find({ userId })
    .toArray();

  console.log("📋 Raw documents from DB for this user:", documents.length);
  console.log("📄 Sample raw documents:", documents.slice(0, 2));
  
  const normalized = documents
    .map((doc) => normaliseTransaction(doc))
    .filter((item): item is NormalizedTransaction => Boolean(item));

  console.log("✅ Normalized transactions:", normalized.length);
  console.log("📊 Sample transactions:", normalized.slice(0, 3));

  return normalized;
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
  const collection = db.collection<TransactionDocument>("transactions");

  const now = new Date();
  const category =
    typeof input.category === "string" && input.category.trim().length
      ? input.category
      : DEFAULT_CATEGORY_BY_TYPE[input.type];
  const document = {
    userId,
    type: input.type,
    amount: Math.abs(input.amount),
    date,
    description: input.description,
    category,
    status: input.status,
    cashFlowType: input.cashFlowType,
    counterparty: input.counterparty ?? null,
    presetKey: input.presetKey ?? null,
    presetLabel: input.presetLabel ?? null,
    journalEntryId: null as ObjectId | null,
    createdAt: now,
    updatedAt: now,
  };

  let insertedId: ObjectId | null = null;

  try {
    const result = await collection.insertOne(document);
    insertedId = result.insertedId;
    if (!insertedId) {
      throw new Error("Failed to create transaction identifier.");
    }

    const effectivePresetKey = input.presetKey ?? undefined;

    const journalDraft = buildJournalDraftForTransaction(
      userId,
      {
        amount: input.amount,
        type: input.type,
        date,
        description: input.description,
        category,
        status: input.status,
        cashFlowType: input.cashFlowType,
        presetKey: effectivePresetKey,
      },
      insertedId.toString()
    );

    const journalEntry = await postJournal(userId, journalDraft);

    if (!journalEntry._id) {
      throw new Error("Failed to create journal entry identifier.");
    }

    const updatedAt = new Date();

    await collection.updateOne(
      { _id: insertedId, userId },
      {
        $set: {
          journalEntryId: journalEntry._id,
          updatedAt,
        },
      }
    );

    document.journalEntryId = journalEntry._id;
    document.updatedAt = updatedAt;

    return {
      ...document,
      _id: insertedId,
    } satisfies TransactionDocument;
  } catch (error) {
    if (insertedId) {
      await collection.deleteOne({ _id: insertedId, userId });
    }
    throw error;
  }
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
    const normalizedType = normaliseFinanceEntryType(changes.type);
    if (normalizedType) {
      update.type = normalizedType;
    }
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
      changes.cashFlowType === "financing" ||
      changes.cashFlowType === "non-cash"
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

  const targetId = new ObjectId(id);

  const result = await collection.updateOne(
    { _id: targetId, userId },
    { $set: update }
  );

  if (result.matchedCount === 0) {
    throw new Error("Transaction not found.");
  }

  const storedDoc = await collection.findOne({ _id: targetId, userId });

  if (!storedDoc) {
    throw new Error("Transaction not found after update.");
  }

  const normalized = normaliseTransaction(storedDoc as TransactionDocument);
  if (!normalized) {
    throw new Error("Failed to normalize updated transaction.");
  }

  const effectivePresetKey =
    normalized.presetKey && isTransactionPresetKey(normalized.presetKey)
      ? normalized.presetKey
      : undefined;

  const journalDraft = buildJournalDraftForTransaction(
    userId,
    {
      amount: normalized.amount,
      type: normalized.type,
      date: normalized.date,
      description: normalized.description,
      category: normalized.category,
      status: normalized.status === "pending" ? "pending" : "posted",
      cashFlowType: normalized.cashFlowType,
      presetKey: effectivePresetKey,
    },
    storedDoc._id?.toString()
  );

  const journalEntryId = toObjectId(storedDoc.journalEntryId);

  if (journalEntryId) {
    await replaceJournal(journalEntryId, userId, journalDraft);
  } else {
    const journalEntry = await postJournal(userId, journalDraft);
    await collection.updateOne(
      { _id: targetId, userId },
      { $set: { journalEntryId: journalEntry._id } }
    );
  }

  return normalized;
}

export async function deleteTransaction(id: string, userId: ObjectId) {
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid transaction identifier.");
  }

  const client = await clientPromise;
  const db = client.db(DEFAULT_DB_NAME);
  const collection = db.collection<TransactionDocument>("transactions");
  const targetId = new ObjectId(id);

  const existing = await collection.findOne({ _id: targetId, userId });

  if (!existing) {
    throw new Error("Transaction not found.");
  }

  const result = await collection.deleteOne({ _id: targetId, userId });

  if (result.deletedCount === 0) {
    throw new Error("Transaction not found.");
  }

  const journalEntryId = toObjectId(existing.journalEntryId);
  if (journalEntryId) {
    await deleteJournal(journalEntryId, userId);
  }

  return { success: true } as const;
}

function getPeriodRange(key: PeriodKey, reference = new Date()): PeriodRange {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const makeLabel = (label: string) => label;

  switch (key) {
    case "all-time": {
      // Show all data from 2020 to 2030 (wide range)
      const start = new Date(2020, 0, 1);
      const end = new Date(2030, 11, 31);
      return {
        start,
        end,
        label: makeLabel("All Time"),
      };
    }
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
    const sign = !signed
      ? 1
      : transaction.type === "income"
      ? 1
      : transaction.type === "expense"
      ? -1
      : 0;
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
    const sign = !signed
      ? 1
      : transaction.type === "income"
      ? 1
      : transaction.type === "expense"
      ? -1
      : 0;
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

  // Filter out non-cash transactions for cash flow statement, but include cash assets
  const cashTransactions = transactions.filter((transaction) => {
    if (transaction.cashFlowType !== "non-cash") {
      return true; // Include all cash flow transactions
    }

    // Special case: Include cash-related assets even if marked as non-cash
    const isCashAsset =
      transaction.type === "asset" &&
      (transaction.category?.toLowerCase().includes("cash") ||
        transaction.category?.toLowerCase().includes("opening") ||
        transaction.description?.toLowerCase().includes("kas") ||
        transaction.description?.toLowerCase().includes("cash") ||
        transaction.description?.toLowerCase().includes("awal"));

    return isCashAsset;
  });

  const rows = cashTransactions.map((transaction) => {
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

    // Proper cash flow impact calculation
    // Income increases cash (+), Expenses decrease cash (-)
    // Assets purchased decrease cash (-), Liabilities taken increase cash (+)
    // Equity contributions increase cash (+)
    let amount: number;
    switch (transaction.type) {
      case "income":
        amount = transaction.amount; // Positive cash inflow
        break;
      case "expense":
        amount = -transaction.amount; // Negative cash outflow
        break;
      case "asset":
        // Check if it's cash/opening balance asset
        const isCashAsset =
          transaction.category?.toLowerCase().includes("kas") ||
          transaction.category?.toLowerCase().includes("cash") ||
          transaction.category?.toLowerCase().includes("opening") ||
          transaction.category?.toLowerCase().includes("awal") ||
          transaction.description?.toLowerCase().includes("kas") ||
          transaction.description?.toLowerCase().includes("cash") ||
          transaction.description?.toLowerCase().includes("awal");

        if (isCashAsset) {
          // Cash opening balance - exclude from cash flow statement
          // as it represents starting position, not a cash transaction
          amount = 0;
        } else {
          // Asset purchases reduce cash (cash outflow)
          amount = -transaction.amount;
        }
        break;
      case "liability":
        amount = transaction.amount; // Cash inflow from borrowing
        break;
      case "equity":
        amount = transaction.amount; // Cash inflow from equity contribution
        break;
      default:
        amount = 0;
    }

    return {
      label: labelBase,
      description,
      amount,
    };
  });

  return rows
    .filter((row) => Math.abs(row.amount) > 0.01) // Filter out zero amounts
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
      cashBalance: number;
      sortKey: number;
    }
  >();

  // Sort transactions by date to calculate progressive cash balance
  const sortedTransactions = transactions
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let runningCashBalance = 0;

  sortedTransactions.forEach((transaction) => {
    const key = `${transaction.date.getFullYear()}-${transaction.date.getMonth()}`;
    const sortKey =
      transaction.date.getFullYear() * 12 + transaction.date.getMonth();
    const label = transaction.date.toLocaleString("en-US", {
      month: "short",
      year: "numeric",
    });
    const entry = map.get(key) ?? {
      label,
      income: 0,
      expenses: 0,
      cashBalance: runningCashBalance,
      sortKey,
    };

    // Update cash balance based on transaction type and cash flow impact
    if (transaction.cashFlowType !== "non-cash") {
      switch (transaction.type) {
        case "income":
          entry.income += transaction.amount;
          runningCashBalance += transaction.amount;
          break;
        case "expense":
          entry.expenses += transaction.amount;
          runningCashBalance -= transaction.amount;
          break;
        case "asset":
          // Asset transactions based on cash flow type:
          if (transaction.cashFlowType === "operating") {
            // Operating = asset purchase with cash (reduces cash balance)
            runningCashBalance -= transaction.amount;
          } else {
            // Investing/Financing = typically opening balance, cash injection, or non-cash asset recognition
            // For simplicity, add to cash balance (most common case is opening balance)
            runningCashBalance += transaction.amount;
          }
          break;
        case "liability":
          // Borrowing increases cash (shown in income for cash flow impact)
          runningCashBalance += transaction.amount;
          break;
        case "equity":
          // Equity contributions increase cash (shown in income for cash flow impact)
          runningCashBalance += transaction.amount;
          break;
      }
    } else {
      // Non-cash transactions still count as income/expense for P&L
      switch (transaction.type) {
        case "income":
          entry.income += transaction.amount;
          break;
        case "expense":
          entry.expenses += transaction.amount;
          break;
      }
    }

    entry.cashBalance = runningCashBalance;
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
  } else if (cashBalance < 100000) {
    notifications.add(
      "Cash balance is running low. Consider cash flow planning."
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
  userId: ObjectId,
  periodKey: PeriodKey = "all-time"
): Promise<DashboardSnapshot> {
  console.log(
    "📊 Building dashboard snapshot for user:",
    userId.toString(),
    "period:",
    periodKey
  );
  const transactions = await fetchTransactions(userId);
  console.log("📈 Total transactions fetched:", transactions.length);

  const period = getPeriodRange(periodKey);
  const periodTransactions = filterByPeriod(transactions, period);
  console.log("📅 Transactions in period:", periodTransactions.length);

  // Calculate all finance types for current month
  const incomeThisMonth = sumTransactions(
    periodTransactions.filter((transaction) => transaction.type === "income")
  );
  const expensesThisMonth = sumTransactions(
    periodTransactions.filter((transaction) => transaction.type === "expense")
  );
  const assetsThisMonth = sumTransactions(
    periodTransactions.filter((transaction) => transaction.type === "asset")
  );
  const liabilitiesThisMonth = sumTransactions(
    periodTransactions.filter((transaction) => transaction.type === "liability")
  );
  const equityThisMonth = sumTransactions(
    periodTransactions.filter((transaction) => transaction.type === "equity")
  );

  // Use consistent cash balance calculation
  const cashBalance = calculateCashBalance(transactions);

  const result = {
    metrics: {
      incomeThisMonth,
      expensesThisMonth,
      cashBalance,
    },
    monthlyTrend: buildMonthlyTrend(transactions),
    notifications: buildNotifications(transactions, cashBalance),
  };

  console.log("✅ Dashboard snapshot result:", result);
  return result;
}

export async function buildFinanceOverview(
  userId: ObjectId,
  periodKey: PeriodKey = "all-time"
): Promise<FinanceOverview> {
  const transactions = await fetchTransactions(userId);
  const period = getPeriodRange(periodKey);

  // Use consistent cash balance calculation across all pages
  const cashBalance = calculateCashBalance(transactions);

  // Calculate receivables and payables from asset/liability transactions
  const accountsReceivable = transactions
    .filter(
      (t) =>
        t.type === "asset" && t.category.toLowerCase().includes("receivable")
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const accountsPayable = transactions
    .filter(
      (t) =>
        t.type === "liability" && t.category.toLowerCase().includes("payable")
    )
    .reduce((sum, t) => sum + t.amount, 0);

  const netIncomeMTD = await calculateNetIncomeForPeriod(userId, period);

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

type BalanceSheetSections = {
  assets: ReportRow[];
  liabilities: ReportRow[];
  equity: ReportRow[];
  cashBalance: number;
  receivables: number;
  payables: number;
};

async function loadBalanceSheetSections(
  userId: ObjectId,
  upTo: Date
): Promise<BalanceSheetSections> {
  // Load transactions directly to respect user categorization
  const transactions = await fetchTransactions(userId);
  const relevantTransactions = transactions.filter(
    (transaction) => transaction.date < upTo
  );

  const assets: ReportRow[] = [];
  const liabilities: ReportRow[] = [];
  const equity: ReportRow[] = [];
  let cashBalance = 0;
  let receivables = 0;
  let payables = 0;

  // Group transactions by their user-selected type
  const assetTransactions = relevantTransactions.filter(
    (t) => t.type === "asset"
  );
  const liabilityTransactions = relevantTransactions.filter(
    (t) => t.type === "liability"
  );
  const equityTransactions = relevantTransactions.filter(
    (t) => t.type === "equity"
  );

  // Calculate cash balance from cash-affecting transactions
  const cashAffectingTransactions = relevantTransactions.filter(
    (t) => t.cashFlowType !== "non-cash"
  );

  cashAffectingTransactions.forEach((transaction) => {
    switch (transaction.type) {
      case "income":
        cashBalance += transaction.amount;
        break;
      case "expense":
        cashBalance -= transaction.amount;
        break;
      case "asset":
        cashBalance -= transaction.amount; // Asset purchase reduces cash
        break;
      case "liability":
        cashBalance += transaction.amount; // Borrowing increases cash
        break;
      case "equity":
        cashBalance += transaction.amount; // Equity contribution increases cash
        break;
    }
  });

  // Group asset transactions by category
  const assetCategories = new Map<string, number>();
  assetTransactions.forEach((transaction) => {
    const current = assetCategories.get(transaction.category) || 0;
    assetCategories.set(transaction.category, current + transaction.amount);
  });

  // Add cash as an asset ONLY if user specifically recorded cash transactions as assets
  // Check if there are any asset transactions with cash-related categories
  const hasCashAssetTransactions = assetTransactions.some(
    (t) =>
      t.category.toLowerCase().includes("cash") ||
      t.category.toLowerCase().includes("kas")
  );

  // If user has cash asset transactions OR positive cash balance from operations, show it
  if (
    hasCashAssetTransactions ||
    (cashBalance > 0.01 && assetTransactions.length === 0)
  ) {
    // Only show calculated cash balance if no explicit cash asset transactions exist
    if (!hasCashAssetTransactions && cashBalance > 0.01) {
      assets.push({ label: "Cash & Cash Equivalents", amount: cashBalance });
    }
  }

  // Add all other asset categories
  assetCategories.forEach((amount, category) => {
    if (Math.abs(amount) > 0.01) {
      assets.push({ label: category, amount });
    }
  });

  // Group liability transactions by category
  const liabilityCategories = new Map<string, number>();
  liabilityTransactions.forEach((transaction) => {
    const current = liabilityCategories.get(transaction.category) || 0;
    liabilityCategories.set(transaction.category, current + transaction.amount);
  });

  liabilityCategories.forEach((amount, category) => {
    if (Math.abs(amount) > 0.01) {
      liabilities.push({ label: category, amount });
      // Update payables if this is a payable liability
      if (category.toLowerCase().includes("payable")) {
        payables += amount;
      }
    }
  });

  // Group equity transactions by category
  const equityCategories = new Map<string, number>();
  equityTransactions.forEach((transaction) => {
    const current = equityCategories.get(transaction.category) || 0;
    equityCategories.set(transaction.category, current + transaction.amount);
  });

  equityCategories.forEach((amount, category) => {
    if (Math.abs(amount) > 0.01) {
      equity.push({ label: category, amount });
    }
  });

  // Only calculate retained earnings if there are actual income/expense transactions
  // This prevents automatic balancing entries that duplicate transaction effects
  const incomeTransactions = relevantTransactions.filter(
    (t) => t.type === "income"
  );
  const expenseTransactions = relevantTransactions.filter(
    (t) => t.type === "expense"
  );

  // Only add retained earnings if there are actual income/expense activities
  if (incomeTransactions.length > 0 || expenseTransactions.length > 0) {
    const totalRevenue = incomeTransactions.reduce(
      (sum, t) => sum + t.amount,
      0
    );
    const totalExpenses = expenseTransactions.reduce(
      (sum, t) => sum + t.amount,
      0
    );
    const netIncome = totalRevenue - totalExpenses;

    if (Math.abs(netIncome) > 0.01) {
      equity.push({ label: "Retained Earnings", amount: netIncome });
    }
  }

  const sortByMagnitude = (rows: ReportRow[]) =>
    rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return {
    assets: sortByMagnitude(assets),
    liabilities: sortByMagnitude(liabilities),
    equity: sortByMagnitude(equity),
    cashBalance,
    receivables,
    payables,
  };
}

async function calculateNetIncomeForPeriod(
  userId: ObjectId,
  period: PeriodRange
): Promise<number> {
  const client = await clientPromise;
  const db = client.db(DEFAULT_DB_NAME);

  const match: Record<string, unknown> = { userId };
  if (period.start) {
    match.date = {
      ...(match.date as Record<string, unknown> | undefined),
      $gte: period.start,
    };
  }
  if (period.end) {
    match.date = {
      ...(match.date as Record<string, unknown> | undefined),
      $lt: period.end,
    };
  }

  const aggregates = await db
    .collection<JournalEntryDocument>("journal_entries")
    .aggregate([
      { $match: match },
      { $unwind: "$lines" },
      {
        $group: {
          _id: "$lines.accountCode",
          debit: { $sum: "$lines.debit" },
          credit: { $sum: "$lines.credit" },
        },
      },
    ])
    .toArray();

  let revenueTotal = 0;
  let expenseTotal = 0;

  aggregates.forEach((aggregate) => {
    const code = typeof aggregate._id === "string" ? aggregate._id : null;
    if (!code) {
      return;
    }

    const account = getAccountDefinition(code);
    if (!account) {
      return;
    }

    const debit = toNumber(aggregate.debit);
    const credit = toNumber(aggregate.credit);

    if (account.type === "revenue") {
      revenueTotal += credit - debit;
    } else if (account.type === "expense") {
      expenseTotal += debit - credit;
    }
  });

  return revenueTotal - expenseTotal;
}

function ensureBalanceSheetCompleteness(sections: BalanceSheetSections) {
  const assets = sections.assets.length ? [...sections.assets] : [];
  const liabilities = sections.liabilities.length
    ? [...sections.liabilities]
    : [];
  const equity = sections.equity.length ? [...sections.equity] : [];

  // Only add cash if it actually exists in the journal entries
  // Don't automatically create cash entries that would duplicate transaction effects
  const derivedCash = sections.cashBalance;
  let cashAccountExists = assets.some(
    (asset) =>
      asset.label.toLowerCase().includes("cash") ||
      asset.label.toLowerCase().includes("kas")
  );

  // Only add cash entry if there are actual cash transactions in the journal
  // and no cash account already exists
  if (!cashAccountExists && Math.abs(derivedCash) > 0.01) {
    // Check if cash balance comes from actual cash account transactions
    // Rather than automatically adding it
    assets.unshift({ label: "Cash & Cash Equivalents", amount: derivedCash });
  }

  // Ensure receivables are represented if they exist
  if (Math.abs(sections.receivables) > 0.01) {
    const receivableExists = assets.some(
      (asset) =>
        asset.label.toLowerCase().includes("receivable") ||
        asset.label.toLowerCase().includes("piutang")
    );
    if (!receivableExists) {
      assets.push({
        label: "Accounts Receivable",
        amount: sections.receivables,
      });
    }
  }

  // Ensure payables are represented if they exist
  if (Math.abs(sections.payables) > 0.01) {
    const payableExists = liabilities.some(
      (liability) =>
        liability.label.toLowerCase().includes("payable") ||
        liability.label.toLowerCase().includes("utang")
    );
    if (!payableExists) {
      liabilities.push({
        label: "Accounts Payable",
        amount: sections.payables,
      });
    }
  }

  // Calculate totals for balance sheet equation validation
  const totalAssets = assets.reduce((sum, row) => sum + row.amount, 0);
  const totalLiabilities = liabilities.reduce(
    (sum, row) => sum + row.amount,
    0
  );
  const currentEquityTotal = equity.reduce((sum, row) => sum + row.amount, 0);

  // Required equity to balance: Assets - Liabilities
  const requiredEquity = totalAssets - totalLiabilities;
  const equityImbalance = requiredEquity - currentEquityTotal;

  // Handle balance sheet equation: Assets = Liabilities + Equity
  if (Math.abs(equityImbalance) > 0.01) {
    // Check if retained earnings already exists
    const retainedEarningsIndex = equity.findIndex(
      (item) =>
        item.label.toLowerCase().includes("retained") ||
        item.label.toLowerCase().includes("laba ditahan")
    );

    if (retainedEarningsIndex >= 0) {
      // Adjust existing retained earnings
      equity[retainedEarningsIndex] = {
        ...equity[retainedEarningsIndex],
        amount: equity[retainedEarningsIndex].amount + equityImbalance,
      };
    } else {
      // Create new retained earnings entry
      equity.push({
        label: "Retained Earnings",
        amount: equityImbalance,
      });
    }
  }

  // Final validation - ensure balance
  const finalTotalAssets = assets.reduce((sum, row) => sum + row.amount, 0);
  const finalTotalLiabilities = liabilities.reduce(
    (sum, row) => sum + row.amount,
    0
  );
  const finalTotalEquity = equity.reduce((sum, row) => sum + row.amount, 0);

  const balanceCheck = Math.abs(
    finalTotalAssets - (finalTotalLiabilities + finalTotalEquity)
  );
  if (balanceCheck > 0.02) {
    console.warn(
      `Balance sheet out of balance by ${balanceCheck.toFixed(
        2
      )}. Assets: ${finalTotalAssets}, Liabilities: ${finalTotalLiabilities}, Equity: ${finalTotalEquity}`
    );

    // Emergency balancing entry
    equity.push({
      label: "Balance Sheet Adjustment",
      amount: finalTotalAssets - finalTotalLiabilities - finalTotalEquity,
    });
  }

  // Sort by magnitude for better presentation
  const sortByMagnitude = (rows: ReportRow[]) =>
    rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return {
    assets: sortByMagnitude(assets),
    liabilities: sortByMagnitude(liabilities),
    equity: sortByMagnitude(equity),
  };
}

export async function buildReportData(
  userId: ObjectId,
  periodKey: PeriodKey
): Promise<ReportData> {
  const transactions = await fetchTransactions(userId);
  const period = getPeriodRange(periodKey);
  const periodTransactions = filterByPeriod(transactions, period);

  const adjustments = await fetchReportAdjustmentsForPeriod(userId, period);

  const baseRevenueRows = aggregateByCategory(
    periodTransactions.filter((transaction) => transaction.type === "income"),
    "Uncategorised Income"
  ).map((row) => ({ ...row, isManual: false }));

  // Separate COGS from other expenses
  const allExpenseTransactions = periodTransactions.filter(
    (transaction) => transaction.type === "expense"
  );
  const cogsTransactions = allExpenseTransactions.filter(
    (transaction) =>
      transaction.category?.toLowerCase().includes("cost of goods") ||
      transaction.category?.toLowerCase().includes("cogs") ||
      transaction.category?.toLowerCase().includes("hpp")
  );
  const operatingExpenseTransactions = allExpenseTransactions.filter(
    (transaction) =>
      !transaction.category?.toLowerCase().includes("cost of goods") &&
      !transaction.category?.toLowerCase().includes("cogs") &&
      !transaction.category?.toLowerCase().includes("hpp")
  );

  const baseCOGSRows = aggregateByCategory(
    cogsTransactions,
    "Uncategorised COGS"
  ).map((row) => ({ ...row, isManual: false }));

  const baseExpenseRows = aggregateByCategory(
    operatingExpenseTransactions,
    "Uncategorised Expense"
  ).map((row) => ({ ...row, isManual: false }));

  const revenueRows = [
    ...baseRevenueRows,
    ...adjustments["income-statement"].revenues,
  ];

  const cogsRows = [
    ...baseCOGSRows,
    // Add COGS adjustments if needed
  ];

  const expenseRows = [
    ...baseExpenseRows,
    ...adjustments["income-statement"].expenses,
  ];

  const totalRevenue = revenueRows.reduce((sum, row) => sum + row.amount, 0);
  const totalCOGS = cogsRows.reduce((sum, row) => sum + row.amount, 0);
  const grossProfit = totalRevenue - totalCOGS;
  const totalExpenses = expenseRows.reduce((sum, row) => sum + row.amount, 0);

  const baseBalanceSections = await loadBalanceSheetSections(
    userId,
    period.end
  );

  const mergedBalanceSections = {
    assets: [
      ...baseBalanceSections.assets,
      ...adjustments["balance-sheet"].assets,
    ],
    liabilities: [
      ...baseBalanceSections.liabilities,
      ...adjustments["balance-sheet"].liabilities,
    ],
    equity: [
      ...baseBalanceSections.equity,
      ...adjustments["balance-sheet"].equity,
    ],
    cashBalance: baseBalanceSections.cashBalance,
    receivables: baseBalanceSections.receivables,
    payables: baseBalanceSections.payables,
  } satisfies BalanceSheetSections;

  // Use the actual journal-based balance sheet without forcing artificial completeness
  const balanceSheet = {
    assets: mergedBalanceSections.assets.sort(
      (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
    ),
    liabilities: mergedBalanceSections.liabilities.sort(
      (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
    ),
    equity: mergedBalanceSections.equity.sort(
      (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
    ),
  };

  // No automatic balancing - show only what user selected
  // Each transaction appears only in its chosen category (asset/liability/equity)
  // This respects user intent and prevents duplicate entries

  const operatingTransactions = periodTransactions.filter(
    (transaction) => transaction.cashFlowType === "operating"
  );
  const investingTransactions = periodTransactions.filter(
    (transaction) => transaction.cashFlowType === "investing"
  );
  const financingTransactions = periodTransactions.filter(
    (transaction) => transaction.cashFlowType === "financing"
  );

  const operating = [
    ...mapCashFlowRows(operatingTransactions, "Operating Activities").map(
      (row) => ({ ...row, isManual: false })
    ),
    ...adjustments["cash-flow"].operating,
  ];
  const investing = [
    ...mapCashFlowRows(investingTransactions, "Investing Activities").map(
      (row) => ({ ...row, isManual: false })
    ),
    ...adjustments["cash-flow"].investing,
  ];
  const financing = [
    ...mapCashFlowRows(financingTransactions, "Financing Activities").map(
      (row) => ({ ...row, isManual: false })
    ),
    ...adjustments["cash-flow"].financing,
  ];

  const totalOperating = operating.reduce((sum, row) => sum + row.amount, 0);
  const totalInvesting = investing.reduce((sum, row) => sum + row.amount, 0);
  const totalFinancing = financing.reduce((sum, row) => sum + row.amount, 0);

  // Calculate totals for validation
  const totalAssets = balanceSheet.assets.reduce(
    (sum, row) => sum + row.amount,
    0
  );
  const totalLiabilities = balanceSheet.liabilities.reduce(
    (sum, row) => sum + row.amount,
    0
  );
  const totalEquity = balanceSheet.equity.reduce(
    (sum, row) => sum + row.amount,
    0
  );

  // Validate accounting equation (for reporting purposes)
  const balanceSheetDifference = totalAssets - (totalLiabilities + totalEquity);
  const isBalanced = Math.abs(balanceSheetDifference) < 0.01;

  return {
    period: period.label,
    range: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    },
    generatedAt: new Date().toISOString(),
    incomeStatement: {
      revenues: revenueRows,
      cogs: cogsRows,
      expenses: expenseRows,
      totals: {
        revenue: totalRevenue,
        cogs: totalCOGS,
        grossProfit: grossProfit,
        expenses: totalExpenses,
        netIncome: grossProfit - totalExpenses,
      },
    },
    balanceSheet: {
      assets: balanceSheet.assets,
      liabilities: balanceSheet.liabilities,
      equity: balanceSheet.equity,
      totals: {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity,
      },
      // Include balance validation info
      validation: {
        isBalanced,
        difference: balanceSheetDifference,
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
