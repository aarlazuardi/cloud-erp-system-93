import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI || "";
const ADMIN_USER_ID = "69156e50d7b13bfbe91e4869";

async function ensureAdminUser() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("cloud-erp");
    const adminObjectId = new ObjectId(ADMIN_USER_ID);

    // Check if admin user exists
    let adminUser = await db
      .collection("users")
      .findOne({ _id: adminObjectId });

    if (!adminUser) {
      console.log("⚠️  Admin user not found, creating...");

      const hashedPassword = await bcrypt.hash("admin123", 10);

      await db.collection("users").insertOne({
        _id: adminObjectId,
        username: "admin",
        passwordHash: hashedPassword,
        email: "admin@example.com",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log("✅ Created admin user with ID:", ADMIN_USER_ID);
    } else {
      console.log("✅ Admin user exists:", adminUser.username);

      // Update password to ensure it's correct
      const hashedPassword = await bcrypt.hash("admin123", 10);

      await db.collection("users").updateOne(
        { _id: adminObjectId },
        {
          $set: {
            username: "admin",
            passwordHash: hashedPassword,
            role: "admin",
            updatedAt: new Date(),
          },
        }
      );

      console.log("✅ Updated admin user password");
    }

    // Verify
    adminUser = await db.collection("users").findOne({ _id: adminObjectId });
    console.log("\n📋 Final admin user details:");
    console.log("  ID:", adminUser?._id.toString());
    console.log("  Username:", adminUser?.username);
    console.log("  Role:", adminUser?.role);
    console.log("  Has Password:", !!adminUser?.passwordHash);

    // Count transactions for this user
    const transCount = await db
      .collection("transactions")
      .countDocuments({ userId: adminObjectId });
    console.log("  Transactions:", transCount);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
    console.log("\n✅ Disconnected from MongoDB");
  }
}

ensureAdminUser().catch(console.error);
