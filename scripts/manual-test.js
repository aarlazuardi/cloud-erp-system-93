// Test with hardcoded values to isolate the problem
import { MongoClient, ObjectId } from "mongodb";

async function testDatabaseConnection() {
  const uri =
    "mongodb+srv://alazuardi7_db_user:O3tUd9zLXbMB5unA@cluster0.xset63p.mongodb.net/cloud-erp?retryWrites=true&w=majority&appName=Cluster0&serverSelectionTimeoutMS=5000&connectTimeoutMS=10000&family=4";

  console.log("🔗 Connecting to MongoDB...");
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("✅ Connected successfully");

    const db = client.db("cloud-erp");

    // Check users collection
    console.log("\n👥 USERS:");
    const users = await db.collection("users").find({}).toArray();
    console.log(`Found ${users.length} users:`);
    users.forEach((user) => {
      console.log(
        `- ID: ${user._id?.toString()}, Username: ${user.username}, Role: ${
          user.role
        }`
      );
    });

    // Check admin user specifically
    const adminUser = await db
      .collection("users")
      .findOne({ username: "admin" });
    console.log(
      "\n🔑 Admin user:",
      adminUser
        ? {
            id: adminUser._id?.toString(),
            username: adminUser.username,
            role: adminUser.role,
          }
        : "Not found"
    );

    // Check transactions
    console.log("\n💰 TRANSACTIONS:");
    const transactions = await db.collection("transactions").find({}).toArray();
    console.log(`Total transactions: ${transactions.length}`);

    // Group by userId
    const byUserId = {};
    transactions.forEach((t) => {
      const userId = t.userId?.toString() || "no-user";
      if (!byUserId[userId]) {
        byUserId[userId] = [];
      }
      byUserId[userId].push(t);
    });

    Object.entries(byUserId).forEach(([userId, userTransactions]) => {
      console.log(
        `\n📊 User ${userId}: ${userTransactions.length} transactions`
      );
      userTransactions.slice(0, 3).forEach((t) => {
        console.log(
          `  - ${t.type}: ${t.amount} (${t.category}) - ${t.description}`
        );
      });
    });

    // Test query with admin user if exists
    if (adminUser) {
      console.log("\n🧪 Testing transaction query for admin user...");
      const adminTransactions = await db
        .collection("transactions")
        .find({
          userId: adminUser._id,
        })
        .toArray();
      console.log(`Admin user has ${adminTransactions.length} transactions`);
    }

    // Check sessions
    console.log("\n🔐 SESSIONS:");
    const sessions = await db.collection("sessions").find({}).toArray();
    console.log(`Found ${sessions.length} sessions`);
    sessions.forEach((session) => {
      console.log(
        `- User: ${
          session.username
        } (${session.userId?.toString()}), Expires: ${session.expiresAt}`
      );
    });
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
  }
}

testDatabaseConnection();
