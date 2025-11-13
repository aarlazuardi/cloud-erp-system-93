import { NextResponse } from "next/server";

import { UnauthorizedError, requireUser } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import {
  TRANSACTION_PRESETS,
  normaliseFinanceEntryType,
  type CashFlowCategory,
  type FinanceEntryType,
  type TransactionPresetKey,
} from "@/lib/transaction-presets";

type TemplateSource = "database" | "preset";

type TemplateResponse = {
  id: string;
  name: string;
  label: string;
  type: FinanceEntryType;
  cashFlowCategory: CashFlowCategory;
  defaultDescription?: string;
  source: TemplateSource;
  presetKey?: TransactionPresetKey;
};

type AggregateRow = {
  _id: {
    category?: unknown;
    type?: unknown;
    cashFlowType?: unknown;
  } | null;
  description?: unknown;
  updatedAt?: unknown;
};

const DEFAULT_DB_NAME = process.env.MONGODB_DB ?? "cloud-erp";

const ADDITIONAL_PRESETS: Array<Omit<TemplateResponse, "id" | "source">> = [
  {
    name: "Sales - Produk A",
    label: "Penjualan Produk A",
    type: "income",
    cashFlowCategory: "operating",
    defaultDescription: "Penjualan Produk A",
  },
  {
    name: "Consulting Revenue",
    label: "Penjualan Jasa Konsultasi",
    type: "income",
    cashFlowCategory: "operating",
    defaultDescription: "Penjualan Jasa Konsultasi",
  },
  {
    name: "Cash Receipt",
    label: "Penerimaan Kas Lainnya",
    type: "income",
    cashFlowCategory: "operating",
    defaultDescription: "Penerimaan Kas",
  },
  {
    name: "Cost of Goods Sold",
    label: "Pembelian Bahan Baku",
    type: "expense",
    cashFlowCategory: "operating",
    defaultDescription: "Pembelian Bahan Baku",
  },
  {
    name: "Payroll Expense",
    label: "Gaji Karyawan",
    type: "expense",
    cashFlowCategory: "operating",
    defaultDescription: "Pembayaran Gaji",
  },
  {
    name: "Rent Expense",
    label: "Sewa Kantor",
    type: "expense",
    cashFlowCategory: "operating",
    defaultDescription: "Pembayaran Sewa Kantor",
  },
  {
    name: "Utilities Expense",
    label: "Tagihan Utilitas",
    type: "expense",
    cashFlowCategory: "operating",
    defaultDescription: "Pembayaran Utilitas",
  },
  {
    name: "Equipment Purchase",
    label: "Pembelian Peralatan",
    type: "expense",
    cashFlowCategory: "investing",
    defaultDescription: "Pembelian Peralatan",
  },
  {
    name: "Bank Loan Proceeds",
    label: "Pencairan Pinjaman Bank",
    type: "income",
    cashFlowCategory: "financing",
    defaultDescription: "Pencairan Pinjaman Bank",
  },
  {
    name: "Bank Loan Repayment",
    label: "Angsuran Pinjaman Bank",
    type: "expense",
    cashFlowCategory: "financing",
    defaultDescription: "Angsuran Pinjaman Bank",
  },
  {
    name: "Owner Investment",
    label: "Setoran Modal Pemilik",
    type: "income",
    cashFlowCategory: "financing",
    defaultDescription: "Setoran Modal Pemilik",
  },
];

function normaliseType(value: unknown): FinanceEntryType | null {
  return normaliseFinanceEntryType(value);
}

function normaliseCashFlow(value: unknown): CashFlowCategory {
  if (value === "investing" || value === "financing" || value === "non-cash") {
    return value;
  }
  return "operating";
}

function normaliseCategory(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normaliseDescription(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function buildId(
  name: string,
  type: FinanceEntryType,
  cashFlow: CashFlowCategory,
  source: TemplateSource
) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${source}:${type}:${cashFlow}:${slug || "general"}`;
}

function buildPresetTemplates(): TemplateResponse[] {
  return (Object.keys(TRANSACTION_PRESETS) as TransactionPresetKey[]).map(
    (key) => {
      const preset = TRANSACTION_PRESETS[key];
      return {
        id: buildId(
          preset.category,
          preset.financeType,
          preset.cashFlowCategory,
          "preset"
        ),
        name: preset.category,
        label: preset.label,
        type: preset.financeType,
        cashFlowCategory: preset.cashFlowCategory,
        defaultDescription: preset.defaultDescription,
        source: "preset" as const,
        presetKey: key,
      } satisfies TemplateResponse;
    }
  );
}

function buildAdditionalTemplates(): TemplateResponse[] {
  return ADDITIONAL_PRESETS.map((template) => ({
    id: buildId(
      template.name,
      template.type,
      template.cashFlowCategory,
      "preset"
    ),
    source: "preset" as const,
    ...template,
  }));
}

export async function GET() {
  try {
    const user = await requireUser();
    const client = await clientPromise;
    const db = client.db(DEFAULT_DB_NAME);

    const cursor = db.collection("transactions").aggregate<AggregateRow>([
      {
        $match: {
          userId: user.userId,
          category: { $type: "string" },
        },
      },
      {
        $group: {
          _id: {
            category: "$category",
            type: "$type",
            cashFlowType: "$cashFlowType",
          },
          description: { $last: "$description" },
          updatedAt: { $max: "$updatedAt" },
        },
      },
      {
        $sort: { updatedAt: -1 },
      },
      {
        $limit: 100,
      },
    ]);

    const templates = new Map<string, TemplateResponse>();

    for await (const doc of cursor) {
      const category = normaliseCategory(doc._id?.category);
      const type = normaliseType(doc._id?.type);
      const cashFlowCategory = normaliseCashFlow(doc._id?.cashFlowType);
      if (!category || !type) {
        continue;
      }
      const id = buildId(category, type, cashFlowCategory, "database");
      if (templates.has(id)) {
        continue;
      }
      templates.set(id, {
        id,
        name: category,
        label: category,
        type,
        cashFlowCategory,
        defaultDescription: normaliseDescription(doc.description),
        source: "database",
      });
    }

    const existingKeys = new Set(
      Array.from(templates.values()).map(
        (item) =>
          `${item.type}::${item.cashFlowCategory}::${item.name.toLowerCase()}`
      )
    );

    const fallbackTemplates: TemplateResponse[] = [];
    const fallbackIds = new Set<string>();

    for (const item of [
      ...buildPresetTemplates(),
      ...buildAdditionalTemplates(),
    ]) {
      const key = `${item.type}::${
        item.cashFlowCategory
      }::${item.name.toLowerCase()}`;
      if (existingKeys.has(key) || fallbackIds.has(item.id)) {
        continue;
      }
      existingKeys.add(key);
      fallbackIds.add(item.id);
      fallbackTemplates.push(item);
    }

    const response: TemplateResponse[] = [
      ...templates.values(),
      ...fallbackTemplates,
    ];

    return NextResponse.json({ data: response });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Finance presets API error", error);
    return NextResponse.json(
      { error: "Failed to load transaction presets." },
      { status: 500 }
    );
  }
}
