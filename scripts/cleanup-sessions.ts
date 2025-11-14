import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";
const CORRECT_USER_ID = "69156e50d7b13bfbe91e4869";

async function cleanupSessions() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("cloud-erp");
    const correctUserId = new ObjectId(CORRECT_USER_ID);

    // Get all sessions
    const sessions = await db.collection("sessions").find({}).toArray();
    console.log(`\n📊 Total sessions: ${sessions.length}`);

    // Group by userId
    const sessionsByUser: Record<string, number> = {};
    sessions.forEach((s) => {
      const userId = s.userId?.toString() || "unknown";
      sessionsByUser[userId] = (sessionsByUser[userId] || 0) + 1;
    });

    console.log("\n🔍 Sessions by user:");
    Object.entries(sessionsByUser).forEach(([userId, count]) => {
      const isCorrect = userId === CORRECT_USER_ID;
      console.log(
        `  ${userId}: ${count} session(s) ${isCorrect ? "✅" : "❌"}`
      );
    });

    // Delete sessions with wrong userId
    const deleteResult = await db.collection("sessions").deleteMany({
      userId: { $ne: correctUserId },
    });

    if (deleteResult.deletedCount > 0) {
      console.log(
        `\n🗑️  Deleted ${deleteResult.deletedCount} session(s) with wrong userId`
      );
    } else {
      console.log("\n✅ No sessions to delete");
    }

    // Show remaining sessions
    const remainingSessions = await db.collection("sessions").countDocuments();
    console.log(`\n✅ Remaining sessions: ${remainingSessions}`);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
    console.log("\n✅ Disconnected from MongoDB");
  }
}

cleanupSessions().catch(console.error);
