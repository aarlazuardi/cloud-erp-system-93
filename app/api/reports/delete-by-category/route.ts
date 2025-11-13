import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { requireUser } from "@/lib/auth";

function getPeriodDates(period: string) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  switch (period) {
    case "current-month":
      return {
        start: new Date(currentYear, currentMonth, 1),
        end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999),
      };
    case "last-month":
      return {
        start: new Date(currentYear, currentMonth - 1, 1),
        end: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999),
      };
    case "year-to-date":
      return {
        start: new Date(currentYear, 0, 1),
        end: now,
      };
    case "last-year":
      return {
        start: new Date(currentYear - 1, 0, 1),
        end: new Date(currentYear - 1, 11, 31, 23, 59, 59, 999),
      };
    case "all-time":
      return {
        start: new Date(2020, 0, 1), // arbitrary old date
        end: now,
      };
    default:
      return null;
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { category, period, type } = body;

    if (!category || !period || !type) {
      return NextResponse.json(
        { error: "Category, period, and type are required" },
        { status: 400 }
      );
    }

    // Get period range
    const periodRange = getPeriodDates(period);
    if (!periodRange) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("erp_system");
    const collection = db.collection("transactions");

    // Build filter for transactions to delete
    const filter: any = {
      userId: new ObjectId(user.userId),
      category: category,
      date: {
        $gte: periodRange.start,
        $lte: periodRange.end,
      },
    };

    // Add type filter for income/expense
    if (type === "income" || type === "expense") {
      filter.type = type;
    }

    // Delete all transactions matching the criteria
    const result = await collection.deleteMany(filter);

    return NextResponse.json(
      {
        message: "Transactions deleted successfully",
        deletedCount: result.deletedCount,
        category: category,
        period: period,
        type: type,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Delete by category error:", error);
    return NextResponse.json(
      { error: "Failed to delete transactions" },
      { status: 500 }
    );
  }
}
