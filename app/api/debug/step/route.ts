import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { buildDashboardSnapshot } from "@/lib/finance";
import clientPromise from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("🔍 Step-by-step dashboard debug");

    // Use the hardcoded admin user ID
    const userId = new ObjectId("69156e50d7b13bfbe91e4869");
    console.log("👤 Using userId:", userId.toString());

    // Step 1: Check raw database
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB ?? "cloud-erp");

    const rawTransactions = await db
      .collection("transactions")
      .find({ userId })
      .toArray();
    console.log("📋 Raw transactions from DB:", rawTransactions.length);

    // Step 2: Test buildDashboardSnapshot
    console.log("📊 Calling buildDashboardSnapshot...");
    const snapshot = await buildDashboardSnapshot(userId, "all-time");
    console.log("📈 Snapshot result:", snapshot);

    // Step 3: Manual calculation
    let manualIncome = 0;
    let manualExpenses = 0;
    let manualCash = 0;

    rawTransactions.forEach((t) => {
      console.log(`Transaction: ${t.type} - ${t.amount} - ${t.description}`);

      if (t.type === "income") {
        manualIncome += t.amount;
        manualCash += t.amount;
      } else if (t.type === "expense") {
        manualExpenses += t.amount;
        manualCash -= t.amount;
      } else if (t.type === "asset") {
        manualCash += t.amount; // Asset increases cash (opening balance)
      } else if (t.type === "liability") {
        manualCash += t.amount; // Liability increases cash
      } else if (t.type === "equity") {
        manualCash += t.amount; // Equity increases cash
      }
    });

    console.log("🧮 Manual calculations:");
    console.log("- Income:", manualIncome);
    console.log("- Expenses:", manualExpenses);
    console.log("- Cash:", manualCash);

    return NextResponse.json({
      userId: userId.toString(),
      rawTransactionCount: rawTransactions.length,
      rawTransactionsSample: rawTransactions.slice(0, 5).map((t) => ({
        id: t._id?.toString(),
        type: t.type,
        amount: t.amount,
        date: t.date,
        description: t.description,
        category: t.category,
      })),
      snapshot,
      manualCalculations: {
        income: manualIncome,
        expenses: manualExpenses,
        cash: manualCash,
      },
      comparison: {
        incomeMatch: snapshot.metrics.incomeThisMonth === manualIncome,
        expensesMatch: snapshot.metrics.expensesThisMonth === manualExpenses,
        cashMatch: snapshot.metrics.cashBalance === manualCash,
      },
    });
  } catch (error) {
    console.error("Debug step error:", error);
    return NextResponse.json(
      { error: String(error), stack: error.stack },
      { status: 500 }
    );
  }
}
