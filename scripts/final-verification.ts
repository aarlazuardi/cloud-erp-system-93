import { MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";
const CORRECT_USER_ID = "69156e50d7b13bfbe91e4869";

async function finalVerification() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB\n");

    const db = client.db("cloud-erp");
    const correctUserId = new ObjectId(CORRECT_USER_ID);

    console.log("=".repeat(60));
    console.log("🔍 FINAL VERIFICATION REPORT");
    console.log("=".repeat(60));

    // 1. Check users
    console.log("\n📋 USERS:");
    const users = await db.collection("users").find({}).toArray();
    console.log(`  Total users: ${users.length}`);
    users.forEach((u) => {
      const isCorrect = u._id.toString() === CORRECT_USER_ID;
      console.log(
        `  - ${u.username} (${u._id}) ${isCorrect ? "✅ CORRECT" : "❌"}`
      );
    });

    // 2. Check transactions
    console.log("\n💰 TRANSACTIONS:");
    const transactionsByUser = await db
      .collection("transactions")
      .aggregate([{ $group: { _id: "$userId", count: { $sum: 1 } } }])
      .toArray();

    let allTransactionsCorrect = true;
    transactionsByUser.forEach((t) => {
      const userId = t._id.toString();
      const isCorrect = userId === CORRECT_USER_ID;
      if (!isCorrect) allTransactionsCorrect = false;
      console.log(
        `  - User ${userId}: ${t.count} transactions ${isCorrect ? "✅" : "❌"}`
      );
    });

    if (allTransactionsCorrect && transactionsByUser.length === 1) {
      console.log("  ✅ All transactions belong to correct user");
    }

    // 3. Check journal entries
    console.log("\n📖 JOURNAL ENTRIES:");
    const journalsByUser = await db
      .collection("journal_entries")
      .aggregate([{ $group: { _id: "$userId", count: { $sum: 1 } } }])
      .toArray();

    let allJournalsCorrect = true;
    journalsByUser.forEach((j) => {
      const userId = j._id.toString();
      const isCorrect = userId === CORRECT_USER_ID;
      if (!isCorrect) allJournalsCorrect = false;
      console.log(
        `  - User ${userId}: ${j.count} entries ${isCorrect ? "✅" : "❌"}`
      );
    });

    if (allJournalsCorrect && journalsByUser.length === 1) {
      console.log("  ✅ All journal entries belong to correct user");
    }

    // 4. Check sessions
    console.log("\n🔐 SESSIONS:");
    const sessions = await db.collection("sessions").countDocuments();
    const wrongSessions = await db.collection("sessions").countDocuments({
      userId: { $ne: correctUserId },
    });

    console.log(`  Total sessions: ${sessions}`);
    if (wrongSessions > 0) {
      console.log(`  ❌ Sessions with wrong userId: ${wrongSessions}`);
    } else {
      console.log(`  ✅ No sessions with wrong userId`);
    }

    // 5. Financial summary
    console.log("\n💵 FINANCIAL SUMMARY:");
    const totals = await db
      .collection("transactions")
      .aggregate([
        { $match: { userId: correctUserId } },
        {
          $group: {
            _id: "$type",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    totals.forEach((t) => {
      console.log(
        `  ${t._id}: Rp ${t.total.toLocaleString()} (${t.count} transactions)`
      );
    });

    // 6. Calculate Net Income
    const revenueExpense = await db
      .collection("journal_entries")
      .aggregate([
        { $unwind: "$lines" },
        {
          $group: {
            _id: "$lines.accountCode",
            debit: { $sum: "$lines.debit" },
            credit: { $sum: "$lines.credit" },
          },
        },
      ])
      .toArray();

    let totalRevenue = 0;
    let totalExpense = 0;

    revenueExpense.forEach((account) => {
      const code = account._id;
      const debit = account.debit || 0;
      const credit = account.credit || 0;

      if (code >= "4000" && code < "5000") {
        totalRevenue += credit - debit;
      } else if (code >= "5000" && code < "6000") {
        totalExpense += debit - credit;
      }
    });

    const netIncome = totalRevenue - totalExpense;
    console.log(`\n  Total Revenue: Rp ${totalRevenue.toLocaleString()}`);
    console.log(`  Total Expense: Rp ${totalExpense.toLocaleString()}`);
    console.log(`  Net Income: Rp ${netIncome.toLocaleString()}`);

    // 7. Final status
    console.log("\n" + "=".repeat(60));
    if (
      users.length === 1 &&
      users[0]._id.toString() === CORRECT_USER_ID &&
      allTransactionsCorrect &&
      allJournalsCorrect &&
      wrongSessions === 0
    ) {
      console.log("🎉 VERIFICATION PASSED - System is clean!");
      console.log("✅ Admin user ID: " + CORRECT_USER_ID);
      console.log("✅ All data belongs to correct user");
      console.log("✅ No duplicate users or sessions");
    } else {
      console.log("⚠️  VERIFICATION FAILED - Issues detected!");
    }
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
    console.log("✅ Disconnected from MongoDB\n");
  }
}

finalVerification().catch(console.error);
