import { NextResponse } from "next/server";

import { UnauthorizedError, requireUser } from "@/lib/auth";
import {
  deleteTransaction,
  updateTransaction,
  type UpdateTransactionInput,
} from "@/lib/finance";
import {
  TRANSACTION_PRESETS,
  isTransactionPresetKey,
  normaliseFinanceEntryType,
} from "@/lib/transaction-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const body = await request.json();

    const amount =
      body.amount === undefined || body.amount === null
        ? undefined
        : Number(body.amount);
    const dateValue = body.date ?? body.transactionDate ?? null;

    const statusRaw =
      typeof body.status === "string" ? body.status.trim() : undefined;
    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : undefined;

    const presetKeyRaw =
      typeof body.presetKey === "string" ? body.presetKey.trim() : "";
    const presetLabelRaw =
      typeof body.presetLabel === "string" ? body.presetLabel.trim() : "";

    let presetKey: UpdateTransactionInput["presetKey"];
    let presetLabel: UpdateTransactionInput["presetLabel"];
    let type: UpdateTransactionInput["type"];
    let category: UpdateTransactionInput["category"];

    if (isTransactionPresetKey(presetKeyRaw)) {
      presetKey = presetKeyRaw;
      presetLabel = TRANSACTION_PRESETS[presetKeyRaw].label;
      type = TRANSACTION_PRESETS[presetKeyRaw].financeType;
      category = TRANSACTION_PRESETS[presetKeyRaw].category;
    } else {
      presetKey = presetKeyRaw || undefined;
      presetLabel = presetLabelRaw || undefined;
      const typeCandidate = normaliseFinanceEntryType(body.type);
      type = typeCandidate ?? undefined;
      category = typeof body.category === "string" ? body.category : undefined;
    }

    const input: UpdateTransactionInput = {
      amount,
      date: dateValue ? new Date(dateValue) : undefined,
      description,
      status:
        statusRaw === "pending"
          ? "pending"
          : statusRaw === "posted"
          ? "posted"
          : undefined,
      cashFlowType:
        body.cashFlowType === "investing" ||
        body.cashFlowType === "financing" ||
        body.cashFlowType === "non-cash"
          ? body.cashFlowType
          : body.cashFlowType === "operating"
          ? "operating"
          : undefined,
      counterparty:
        typeof body.counterparty === "string" && body.counterparty.trim()
          ? body.counterparty.trim()
          : body.counterparty === null
          ? null
          : undefined,
      presetKey,
      presetLabel,
      type,
      category,
    };

    if (presetKey && isTransactionPresetKey(presetKey)) {
      input.cashFlowType = TRANSACTION_PRESETS[presetKey].cashFlowCategory;
    }

    const updated = await updateTransaction(params.id, user.userId, input);

    return NextResponse.json({
      message: "Transaction updated.",
      transaction: updated,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Update transaction error", error);
    const message =
      error instanceof Error ? error.message : "Failed to update transaction.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const user = await requireUser();
    await deleteTransaction(params.id, user.userId);
    return NextResponse.json({ message: "Transaction deleted." });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete transaction error", error);
    const message =
      error instanceof Error ? error.message : "Failed to delete transaction.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
