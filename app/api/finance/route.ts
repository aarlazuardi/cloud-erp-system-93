import { NextResponse } from "next/server";

import { UnauthorizedError, requireUser } from "@/lib/auth";
import {
  DEFAULT_CATEGORY_BY_TYPE,
  buildFinanceOverview,
  createTransaction,
  type CreateTransactionInput,
} from "@/lib/finance";
import {
  TRANSACTION_PRESETS,
  isTransactionPresetKey,
  normaliseFinanceEntryType,
} from "@/lib/transaction-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const overview = await buildFinanceOverview(user.userId);
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Finance API error", error);
    return NextResponse.json(
      { error: "Failed to load finance data." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than zero." },
        { status: 400 }
      );
    }

    const dateValue = body.date ?? body.transactionDate;
    if (!dateValue) {
      return NextResponse.json(
        { error: "Transaction date is required." },
        { status: 400 }
      );
    }

    const descriptionRaw =
      typeof body.description === "string" ? body.description.trim() : "";
    const categoryRaw =
      typeof body.category === "string" ? body.category.trim() : "";
    const counterpartyValue =
      typeof body.counterparty === "string" && body.counterparty.trim()
        ? body.counterparty.trim()
        : null;
    const presetKeyRaw =
      typeof body.presetKey === "string" ? body.presetKey.trim() : "";
    const presetLabelRaw =
      typeof body.presetLabel === "string" ? body.presetLabel.trim() : "";

    let presetKey: CreateTransactionInput["presetKey"] = null;
    let presetLabel: CreateTransactionInput["presetLabel"] = null;

    if (isTransactionPresetKey(presetKeyRaw)) {
      presetKey = presetKeyRaw;
      presetLabel = TRANSACTION_PRESETS[presetKeyRaw].label;
    } else if (presetLabelRaw) {
      presetLabel = presetLabelRaw;
    }

    let type: CreateTransactionInput["type"];
    if (presetKey && isTransactionPresetKey(presetKey)) {
      type = TRANSACTION_PRESETS[presetKey].financeType;
    } else {
      type = normaliseFinanceEntryType(body.type) ?? "income";
    }

    let category = categoryRaw || DEFAULT_CATEGORY_BY_TYPE[type];
    if (presetKey && isTransactionPresetKey(presetKey)) {
      category = TRANSACTION_PRESETS[presetKey].category;
    }

    let description = descriptionRaw;
    if (!description && presetKey && isTransactionPresetKey(presetKey)) {
      description =
        TRANSACTION_PRESETS[presetKey].defaultDescription ??
        TRANSACTION_PRESETS[presetKey].label;
    }
    if (!description) {
      description = category;
    }

    let cashFlowType: CreateTransactionInput["cashFlowType"] =
      body.cashFlowType === "investing" ||
      body.cashFlowType === "financing" ||
      body.cashFlowType === "non-cash"
        ? body.cashFlowType
        : "operating";

    if (presetKey && isTransactionPresetKey(presetKey)) {
      cashFlowType = TRANSACTION_PRESETS[presetKey].cashFlowCategory;
    }

    const status: CreateTransactionInput["status"] =
      body.status === "pending" ? "pending" : "posted";

    const input: CreateTransactionInput = {
      type,
      amount,
      date: new Date(dateValue),
      description,
      category,
      status,
      cashFlowType,
      counterparty: counterpartyValue,
      presetKey,
      presetLabel,
    };

    const created = await createTransaction(user.userId, input);

    return NextResponse.json(
      {
        message: "Transaction created.",
        transactionId:
          typeof created._id === "object" && created._id
            ? created._id.toString()
            : null,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create transaction error", error);
    const message =
      error instanceof Error ? error.message : "Failed to create transaction.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
