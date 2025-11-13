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
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

checkData();
