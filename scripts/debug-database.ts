import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local FIRST
config({ path: resolve(process.cwd(), ".env.local") });

import clientPromise from "../lib/mongodb";
import { ObjectId } from "mongodb";

const DEFAULT_DB_NAME = process.env.MONGODB_DB || "cloud-erp";

async function debugDatabase() {
  try {
    console.log("🔧 Environment check:");
    console.log("MONGODB_URI exists:", !!process.env.MONGODB_URI);
    console.log("MONGODB_DB:", process.env.MONGODB_DB);
    console.log("DEFAULT_DB_NAME:", DEFAULT_DB_NAME);
    console.log("🔍 Testing database connection...");

    // Test connection
    const client = await clientPromise;
    console.log("✅ MongoDB client connected");

    const db = client.db(DEFAULT_DB_NAME);
    console.log("✅ Database accessed:", DEFAULT_DB_NAME);

    // Check collections
    const collections = await db.listCollections().toArray();
    console.log(
      "📁 Collections:",
      collections.map((c) => c.name)
    );

    // Check transactions
    const transactionsCollection = db.collection("transactions");
    const transactionCount = await transactionsCollection.countDocuments();
    console.log("📊 Total transactions:", transactionCount);

    // Get all transactions
    const allTransactions = await transactionsCollection.find({}).toArray();
    console.log("📋 All transactions:");
    allTransactions.forEach((doc, index) => {
      console.log(`  ${index + 1}. ID: ${doc._id}`);
      console.log(`     User: ${doc.userId}`);
      console.log(`     Type: ${doc.type}`);
      console.log(`     Category: ${doc.category}`);
      console.log(`     Amount: ${doc.amount}`);
      console.log(`     Date: ${doc.date}`);
      console.log(`     Description: ${doc.description}`);
      console.log("     ---");
    });

    // Check users collection
    const usersCollection = db.collection("users");
    const userCount = await usersCollection.countDocuments();
    console.log("👥 Total users:", userCount);

    if (userCount > 0) {
      const users = await usersCollection.find({}).toArray();
      console.log("👤 Users:");
      users.forEach((user, index) => {
        console.log(
          `  ${index + 1}. ID: ${user._id}, Username: ${user.username}`
        );
      });
    }

    console.log("✅ Database debug completed successfully");
  } catch (error) {
    console.error("❌ Database debug failed:", error);
  }
}

debugDatabase();
