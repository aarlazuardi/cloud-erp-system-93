import { ObjectId } from "mongodb";

import clientPromise from "./mongodb";
import {
  TRANSACTION_PRESETS,
  isTransactionPresetKey,
  type JournalTemplate,
} from "./transaction-presets";
import { getAccountDefinition } from "./chart-of-accounts";

export type JournalEntryDocument = {
  _id?: ObjectId;
  userId: ObjectId;
  referenceId?: string;
  date: Date;
  memo?: string;
  lines: Array<JournalLineDocument>;
  createdAt: Date;
  updatedAt: Date;
};

export type JournalLineDocument = {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
};

export type JournalDraftLine = {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
};

export type JournalDraft = {
  referenceId?: string;
  date: Date;
  memo?: string;
  lines: JournalDraftLine[];
};

export class JournalValidationError extends Error {}

function normaliseLines(lines: JournalDraftLine[]): JournalLineDocument[] {
  if (!lines.length) {
    throw new JournalValidationError("Journal must contain at least one line.");
  }

  const normalisedLines = lines.map((line) => {
    const account = getAccountDefinition(line.accountCode);
    if (!account) {
      throw new JournalValidationError(
        `Account ${line.accountCode} is not defined in chart of accounts.`
      );
    }

    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);

    if (debit < 0 || credit < 0) {
      throw new JournalValidationError(
        "Debit and credit amounts cannot be negative."
      );
    }

    if (debit === 0 && credit === 0) {
      throw new JournalValidationError(
        "Each line must contain a debit or credit."
      );
    }

    if (debit > 0 && credit > 0) {
      throw new JournalValidationError(
        "A single line cannot contain both debit and credit values."
      );
    }

    return {
      accountCode: line.accountCode,
      debit,
      credit,
      description: line.description,
    } satisfies JournalLineDocument;
  });

  const totalDebit = normalisedLines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = normalisedLines.reduce(
    (sum, line) => sum + line.credit,
    0
  );

  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new JournalValidationError(
      `Journal is out of balance. Debit ${totalDebit} vs Credit ${totalCredit}.`
    );
  }

  return normalisedLines;
}

export async function postJournal(
  userId: ObjectId,
  draft: JournalDraft
): Promise<JournalEntryDocument> {
  const normalisedLines = normaliseLines(draft.lines);

  const entry: JournalEntryDocument = {
    userId,
    referenceId: draft.referenceId,
    date: draft.date,
    memo: draft.memo,
    lines: normalisedLines,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB ?? "cloud-erp");
  const { insertedId } = await db
    .collection<JournalEntryDocument>("journal_entries")
    .insertOne(entry);

  return {
    ...entry,
    _id: insertedId,
  };
}

export async function replaceJournal(
  entryId: ObjectId,
  userId: ObjectId,
  draft: JournalDraft
): Promise<JournalEntryDocument> {
  const normalisedLines = normaliseLines(draft.lines);

  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB ?? "cloud-erp");

  const collection = db.collection<JournalEntryDocument>("journal_entries");

  await collection.findOneAndUpdate(
    { _id: entryId, userId },
    {
      $set: {
        referenceId: draft.referenceId,
        date: draft.date,
        memo: draft.memo,
        lines: normalisedLines,
        updatedAt: new Date(),
      },
    }
  );

  const entry = await collection.findOne({ _id: entryId, userId });

  if (!entry) {
    throw new JournalValidationError("Journal entry not found for update.");
  }

  return entry;
}

export async function deleteJournal(
  entryId: ObjectId,
  userId: ObjectId
): Promise<void> {
  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB ?? "cloud-erp");
  const result = await db
    .collection<JournalEntryDocument>("journal_entries")
    .deleteOne({ _id: entryId, userId });

  if (result.deletedCount === 0) {
    throw new JournalValidationError("Journal entry not found for deletion.");
  }
}

export function buildJournalFromPreset(options: {
  presetKey: string;
  date: Date;
  userId: ObjectId;
  memo?: string;
  amount: number;
}): JournalDraft {
  if (!isTransactionPresetKey(options.presetKey)) {
    throw new JournalValidationError("Unsupported transaction preset.");
  }

  const preset = TRANSACTION_PRESETS[options.presetKey];
  const amount = Math.abs(options.amount);

  const debitLine = {
    accountCode: preset.journal.debitAccount,
    debit: amount,
    description: preset.journal.description,
  } satisfies JournalDraftLine;

  const creditLine = {
    accountCode: preset.journal.creditAccount,
    credit: amount,
    description: preset.journal.description,
  } satisfies JournalDraftLine;

  return {
    date: options.date,
    memo: options.memo,
    lines: [debitLine, creditLine],
  } satisfies JournalDraft;
}

export function inferFinanceTypeFromAccounts(
  template: JournalTemplate
): "income" | "expense" | "asset" | "liability" | "equity" {
  const debitAccount = getAccountDefinition(template.debitAccount);
  const creditAccount = getAccountDefinition(template.creditAccount);
  if (!debitAccount || !creditAccount) {
    return "asset";
  }

  if (creditAccount.type === "revenue") {
    return "income";
  }
  if (debitAccount.type === "expense") {
    return "expense";
  }
  if (debitAccount.type === "revenue") {
    return "income";
  }
  if (creditAccount.type === "expense") {
    return "expense";
  }
  if (debitAccount.type === "equity" || creditAccount.type === "equity") {
    return "equity";
  }
  if (debitAccount.type === "liability" || creditAccount.type === "liability") {
    return "liability";
  }
  return "asset";
}
