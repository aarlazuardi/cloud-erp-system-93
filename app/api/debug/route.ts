import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    console.log("🔍 Debug API called");

    // Test authentication
    const user = await requireUser();
    console.log("✅ User authenticated:", user.userId);

    // Test database connection
    const client = await clientPromise;
    const db = client.db("cloud-erp");

    // Get transactions for this user
    const transactions = await db
      .collection("transactions")
      .find({ userId: user.userId })
      .toArray();

    console.log("📊 Transactions found:", transactions.length);

    // Get user info
    const userInfo = await db.collection("users").findOne({ _id: user.userId });

    return NextResponse.json({
      success: true,
      user: {
        id: user.userId,
        username: userInfo?.username || "unknown",
      },
      transactionCount: transactions.length,
      transactions: transactions.map((t) => ({
        id: t._id,
        type: t.type,
        amount: t.amount,
        category: t.category,
        date: t.date,
        description: t.description,
      })),
    });
  } catch (error) {
    console.error("❌ Debug API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
