import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const ENV_FILES = [".env.local", ".env"];

ENV_FILES.forEach((file) => {
  const filepath = resolve(process.cwd(), file);
  if (existsSync(filepath)) {
    loadEnv({ path: filepath });
  }
});

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "cloud-erp";

const adminUser = {
  username: "admin",
  password: "admin123",
  role: "admin",
};

async function createAdmin() {
  if (!uri) {
    console.error("MONGODB_URI environment variable is not set");
    console.log("Fallback: Admin credentials are available for direct login");
    console.log(`Username: ${adminUser.username}`);
    console.log(`Password: ${adminUser.password}`);
    return;
  }

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    family: 4,
  });

  try {
    console.log("Attempting to connect to MongoDB...");
    await client.connect();
    console.log("Connected successfully to MongoDB");

    const db = client.db(dbName);
    const usersCollection = db.collection("users");

    const timestamp = new Date();
    const adminPasswordHash = await bcrypt.hash(adminUser.password, 10);

    const result = await usersCollection.findOneAndUpdate(
      { username: adminUser.username },
      {
        $set: {
          username: adminUser.username,
          passwordHash: adminPasswordHash,
          role: adminUser.role,
          updatedAt: timestamp,
        },
        $setOnInsert: {
          createdAt: timestamp,
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    if (result?.value) {
      console.log("✅ Admin user created/updated successfully!");
      console.log(`Username: ${adminUser.username}`);
      console.log(`Password: ${adminUser.password}`);
      console.log(`Role: ${adminUser.role}`);
    } else {
      console.log("❌ Failed to create admin user");
    }
  } catch (error) {
    console.error("Failed to create admin user:", error);
    console.log("\n🔄 Fallback mode activated:");
    console.log("You can still login using the built-in admin credentials:");
    console.log(`Username: ${adminUser.username}`);
    console.log(`Password: ${adminUser.password}`);
    console.log("The login system will work in offline mode for admin user.");
  } finally {
    await client.close();
  }
}

createAdmin();
