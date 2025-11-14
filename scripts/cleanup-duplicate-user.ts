import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";

async function cleanupData() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("cloud-erp");

    // UserId yang benar (14 transaksi)
    const correctUserId = new ObjectId("69156e50d7b13bfbe91e4869");
    const wrongUserId = new ObjectId("6916038c0a00b49767d14b20");

    console.log("\n🔍 Checking data before cleanup...");

    // Check transactions
    const wrongTransactions = await db
      .collection("transactions")
      .find({ userId: wrongUserId })
      .toArray();
    console.log(
      `Found ${wrongTransactions.length} transaction(s) with wrong userId`
    );

    // Check journal entries
    const wrongJournals = await db
      .collection("journal_entries")
      .find({ userId: wrongUserId })
      .toArray();
    console.log(
      `Found ${wrongJournals.length} journal entry(ies) with wrong userId`
    );

    // Check users
    const wrongUser = await db
      .collection("users")
      .findOne({ _id: wrongUserId });
    if (wrongUser) {
      console.log(
        `Found user record with wrong userId: ${wrongUser.username || "N/A"}`
      );
    }

    // Delete transactions with wrong userId
    if (wrongTransactions.length > 0) {
      const transResult = await db
        .collection("transactions")
        .deleteMany({ userId: wrongUserId });
      console.log(`\n🗑️  Deleted ${transResult.deletedCount} transaction(s)`);
    }

    // Delete journal entries with wrong userId
    if (wrongJournals.length > 0) {
      const journalResult = await db
        .collection("journal_entries")
        .deleteMany({ userId: wrongUserId });
      console.log(
        `🗑️  Deleted ${journalResult.deletedCount} journal entry(ies)`
      );
    }

    // Delete user with wrong userId
    if (wrongUser) {
      const userResult = await db
        .collection("users")
        .deleteOne({ _id: wrongUserId });
      console.log(`🗑️  Deleted ${userResult.deletedCount} user record(s)`);
    }

    // Verify correct data still exists
    console.log("\n✅ Verifying remaining data...");
    const correctTransCount = await db
      .collection("transactions")
      .countDocuments({ userId: correctUserId });
    console.log(`Transactions with correct userId: ${correctTransCount}`);

    const correctJournalCount = await db
      .collection("journal_entries")
      .countDocuments({ userId: correctUserId });
    console.log(`Journal entries with correct userId: ${correctJournalCount}`);

    // Ensure correct user exists
    let correctUser = await db
      .collection("users")
      .findOne({ _id: correctUserId });

    if (!correctUser) {
      console.log("\n⚠️  Correct user not found, creating admin user...");
      const bcrypt = require("bcrypt");
      const hashedPassword = await bcrypt.hash("admin123", 10);

      await db.collection("users").insertOne({
        _id: correctUserId,
        username: "admin",
        password: hashedPassword,
        email: "admin@example.com",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log("✅ Created admin user with correct userId");
    } else {
      console.log(`✅ Correct user exists: ${correctUser.username || "admin"}`);
    }

    console.log("\n🎉 Cleanup completed successfully!");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
    console.log("\n✅ Disconnected from MongoDB");
  }
}

cleanupData().catch(console.error);
