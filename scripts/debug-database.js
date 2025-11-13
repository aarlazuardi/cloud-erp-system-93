const clientPromise = require("../lib/mongodb.ts").default;
const { ObjectId } = require("mongodb");

const DEFAULT_DB_NAME = process.env.MONGODB_DB_NAME || "erp_system";

async function debugDatabase() {
  try {
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
    process.exit(0);
  } catch (error) {
    console.error("❌ Database debug failed:", error);
    process.exit(1);
  }
}

debugDatabase();
