import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("🔧 Debug Environment Variables:");
    console.log("- NODE_ENV:", process.env.NODE_ENV);
    console.log("- MONGODB_URI exists:", !!process.env.MONGODB_URI);
    console.log(
      "- MONGODB_URI starts with:",
      process.env.MONGODB_URI?.substring(0, 30)
    );
    console.log("- MONGODB_DB:", process.env.MONGODB_DB || "undefined");

    // Test database connection
    const client = await clientPromise;
    const admin = client.db().admin();
    const dbList = await admin.listDatabases();

    console.log(
      "📚 Available databases:",
      dbList.databases.map((d) => d.name)
    );

    const dbName = process.env.MONGODB_DB ?? "cloud-erp";
    const db = client.db(dbName);

    // Check users
    const users = await db.collection("users").find({}).toArray();
    console.log("👥 Users found:", users.length);

    // Check transactions
    const transactions = await db.collection("transactions").find({}).toArray();
    console.log("💰 Transactions found:", transactions.length);

    // Check all collections
    const collections = await db.listCollections().toArray();
    console.log(
      "📁 Collections:",
      collections.map((c) => c.name)
    );

    return NextResponse.json({
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        MONGODB_DB: process.env.MONGODB_DB || "undefined",
        MONGODB_URI_exists: !!process.env.MONGODB_URI,
        MONGODB_URI_start: process.env.MONGODB_URI?.substring(0, 30),
      },
      databases: dbList.databases.map((d) => d.name),
      currentDB: dbName,
      collections: collections.map((c) => c.name),
      counts: {
        users: users.length,
        transactions: transactions.length,
      },
      users: users.map((u) => ({
        id: u._id?.toString(),
        username: u.username,
        role: u.role,
      })),
      sampleTransactions: transactions.slice(0, 3).map((t) => ({
        id: t._id?.toString(),
        userId: t.userId?.toString(),
        type: t.type,
        amount: t.amount,
        description: t.description,
      })),
    });
  } catch (error) {
    console.error("Debug API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
