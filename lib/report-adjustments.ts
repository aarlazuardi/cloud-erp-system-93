import { ObjectId, type Collection } from "mongodb";

import clientPromise from "./mongodb";
import {
  type ReportAdjustmentType,
  type ReportAdjustmentSection,
  REPORT_ADJUSTMENT_SECTIONS,
  isValidAdjustmentSection,
} from "./report-adjustments-schema";

type ReportAdjustmentDocument = {
  _id?: ObjectId;
  userId: ObjectId;
  type: ReportAdjustmentType;
  section: ReportAdjustmentSection;
  label: string;
  amount: number;
  description?: string | null;
  effectiveDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type ReportAdjustmentRow = {
  label: string;
  amount: number;
  description?: string;
  isManual: true;
  adjustmentId: string;
};

type PeriodRange = {
  start: Date;
  end: Date;
};

type AdjustmentCollectionBySection = {
  "income-statement": {
    revenues: ReportAdjustmentRow[];
    expenses: ReportAdjustmentRow[];
  };
  "balance-sheet": {
    assets: ReportAdjustmentRow[];
    liabilities: ReportAdjustmentRow[];
    equity: ReportAdjustmentRow[];
  };
  "cash-flow": {
    operating: ReportAdjustmentRow[];
    investing: ReportAdjustmentRow[];
    financing: ReportAdjustmentRow[];
  };
};

async function getAdjustmentsCollection(): Promise<
  Collection<ReportAdjustmentDocument>
> {
  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB ?? "cloud-erp");
  return db.collection<ReportAdjustmentDocument>("report_adjustments");
}

function toReportRow(doc: ReportAdjustmentDocument): ReportAdjustmentRow {
  return {
    label: doc.label,
    amount: Number(doc.amount) || 0,
    description: doc.description ?? undefined,
    isManual: true,
    adjustmentId: doc._id ? doc._id.toString() : "",
  } satisfies ReportAdjustmentRow;
}

export async function createReportAdjustment(input: {
  userId: ObjectId;
  type: ReportAdjustmentType;
  section: ReportAdjustmentSection;
  label: string;
  amount: number;
  description?: string;
  effectiveDate: Date;
}): Promise<ReportAdjustmentDocument> {
  const collection = await getAdjustmentsCollection();
  const now = new Date();
  const document: ReportAdjustmentDocument = {
    userId: input.userId,
    type: input.type,
    section: input.section,
    label: input.label.trim(),
    amount: Number(input.amount) || 0,
    description: input.description?.trim() || null,
    effectiveDate: input.effectiveDate,
    createdAt: now,
    updatedAt: now,
  };

  const { insertedId } = await collection.insertOne(document);
  return {
    ...document,
    _id: insertedId,
  } satisfies ReportAdjustmentDocument;
}

export async function deleteReportAdjustment(
  userId: ObjectId,
  adjustmentId: string
): Promise<boolean> {
  if (!ObjectId.isValid(adjustmentId)) {
    return false;
  }
  const collection = await getAdjustmentsCollection();
  const result = await collection.deleteOne({
    _id: new ObjectId(adjustmentId),
    userId,
  });
  return result.deletedCount === 1;
}

export async function fetchReportAdjustmentsForPeriod(
  userId: ObjectId,
  period: PeriodRange
): Promise<AdjustmentCollectionBySection> {
  const collection = await getAdjustmentsCollection();

  const docs = await collection
    .find({
      userId,
      effectiveDate: { $lt: period.end },
    })
    .toArray();

  const result: AdjustmentCollectionBySection = {
    "income-statement": {
      revenues: [],
      expenses: [],
    },
    "balance-sheet": {
      assets: [],
      liabilities: [],
      equity: [],
    },
    "cash-flow": {
      operating: [],
      investing: [],
      financing: [],
    },
  };

  docs.forEach((doc) => {
    const effectiveDate =
      doc.effectiveDate instanceof Date
        ? doc.effectiveDate
        : new Date(doc.effectiveDate);

    if (Number.isNaN(effectiveDate.getTime())) {
      return;
    }

    const row = toReportRow(doc);

    switch (doc.type) {
      case "income-statement": {
        if (effectiveDate < period.start) {
          return;
        }
        if (!isValidAdjustmentSection(doc.type, doc.section)) {
          return;
        }
        if (doc.section === "revenues") {
          result[doc.type].revenues.push(row);
        } else {
          result[doc.type].expenses.push(row);
        }
        break;
      }
      case "balance-sheet": {
        if (!isValidAdjustmentSection(doc.type, doc.section)) {
          return;
        }
        if (doc.section === "assets") {
          result[doc.type].assets.push(row);
        } else if (doc.section === "liabilities") {
          result[doc.type].liabilities.push(row);
        } else {
          result[doc.type].equity.push(row);
        }
        break;
      }
      case "cash-flow": {
        if (effectiveDate < period.start) {
          return;
        }
        if (!isValidAdjustmentSection(doc.type, doc.section)) {
          return;
        }
        if (doc.section === "operating") {
          result[doc.type].operating.push(row);
        } else if (doc.section === "investing") {
          result[doc.type].investing.push(row);
        } else {
          result[doc.type].financing.push(row);
        }
        break;
      }
      default:
        break;
    }
  });

  return result;
}

export type ReportAdjustmentCollection = AdjustmentCollectionBySection;

export function normaliseAdjustmentSection(
  type: ReportAdjustmentType,
  section: ReportAdjustmentSection
) {
  const options = REPORT_ADJUSTMENT_SECTIONS[type];
  return options.find((option) => option.value === section)?.value ?? section;
}
