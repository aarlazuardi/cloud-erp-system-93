import { MongoClient, ObjectId } from "mongodb";

async function cleanupSessions() {
  const uri = "mongodb+srv://alazuardi7_db_user:O3tUd9zLXbMB5unA@cluster0.xset63p.mongodb.net/cloud-erp?retryWrites=true&w=majority&appName=Cluster0&serverSelectionTimeoutMS=5000&connectTimeoutMS=10000&family=4";
  
  console.log("🔗 Connecting to MongoDB...");
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db("cloud-erp");
    
    const CORRECT_USER_ID = "69156e50d7b13bfbe91e4869";
    
    console.log("🧹 Cleaning up sessions...");
    
    // Delete all sessions that don't belong to the correct user
    const deleteResult = await db.collection("sessions").deleteMany({
      userId: { $ne: new ObjectId(CORRECT_USER_ID) }
    });
    
    console.log(`🗑️ Deleted ${deleteResult.deletedCount} incorrect sessions`);
    
    // Check remaining sessions
    const sessions = await db.collection("sessions").find({}).toArray();
    console.log(`✅ Remaining sessions: ${sessions.length}`);
    sessions.forEach(session => {
      console.log(`- User: ${session.username} (${session.userId?.toString()})`);
    });
    
    console.log("🎯 Sessions cleanup complete!");
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
  }
}

cleanupSessions();