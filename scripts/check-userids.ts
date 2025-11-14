import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";

async function checkUserIds() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const db = client.db("cloud-erp");
  const userIds = await db
    .collection("transactions")
    .aggregate([{ $group: { _id: "$userId", count: { $sum: 1 } } }])
    .toArray();

  console.log("UserIds in transactions:");
  userIds.forEach((u) => console.log(`  ${u._id}: ${u.count} transactions`));

  await client.close();
}

checkUserIds().catch(console.error);
