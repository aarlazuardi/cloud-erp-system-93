import { config } from "dotenv";
import { ObjectId } from "mongodb";

// Load environment variables from .env.local
config({ path: ".env.local" });

console.log("🔧 Loading environment variables...");
console.log("MONGODB_URI exists:", !!process.env.MONGODB_URI);
console.log("MONGODB_DB:", process.env.MONGODB_DB);

import clientPromise from "../lib/mongodb";

async function checkData() {
  try {
    console.log("🔍 Connecting to database...");
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB ?? "cloud-erp");

    // Check users
    console.log("\n👥 USERS:");
    const users = await db.collection("users").find({}).toArray();
    console.log(`Found ${users.length} users`);
    users.forEach((user) => {
      console.log(
        `- ID: ${user._id}, Username: ${user.username}, Role: ${user.role}`
      );
    });

    // Check transactions
    console.log("\n💰 TRANSACTIONS:");
    const transactions = await db.collection("transactions").find({}).toArray();
    console.log(`Found ${transactions.length} transactions`);

    // Group by userId
    const byUser = new Map();
    transactions.forEach((t) => {
      const userId = t.userId?.toString() || "no-user";
      if (!byUser.has(userId)) {
        byUser.set(userId, []);
      }
      byUser.get(userId).push(t);
    });

    byUser.forEach((userTransactions, userId) => {
      console.log(
        `\n📊 User ${userId}: ${userTransactions.length} transactions`
      );
      userTransactions.slice(0, 3).forEach((t) => {
        console.log(
          `  - ${t.type}: ${t.amount} (${t.category}) - ${t.description}`
        );
      });
      if (userTransactions.length > 3) {
        console.log(`  ... and ${userTransactions.length - 3} more`);
      }
    });

    // Check sessions
    console.log("\n🔐 SESSIONS:");
    const sessions = await db.collection("sessions").find({}).toArray();
    console.log(`Found ${sessions.length} sessions`);
    sessions.forEach((session) => {
      console.log(
        `- Token: ${session.token.substring(0, 8)}..., User: ${
          session.username
        }, Expires: ${session.expiresAt}`
      );
    });

    // Check transaction dates
    console.log("\n📅 TRANSACTION DATES:");
    const txs = await db
      .collection("transactions")
      .find({})
      .sort({ date: -1 })
      .toArray();
    txs.forEach((t) => {
      const date = new Date(t.date);
      console.log(
        `${date.toISOString().split("T")[0]} - ${
          t.description
        } - Rp ${t.amount.toLocaleString()}`
      );
    });

    console.log("\n📊 DATE SUMMARY:");
    const now = new Date();
    const thisMonth = txs.filter((t) => {
      const d = new Date(t.date);
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      );
    }).length;

    const thisYear = txs.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear();
    }).length;

    const lastYear = txs.filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear() - 1;
    }).length;

    console.log(`Current date: ${now.toISOString().split("T")[0]}`);
    console.log(
      `This month (${now.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      })}): ${thisMonth} transactions`
    );
    console.log(`This year (2025): ${thisYear} transactions`);
    console.log(`Last year (2024): ${lastYear} transactions`);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

checkData();
