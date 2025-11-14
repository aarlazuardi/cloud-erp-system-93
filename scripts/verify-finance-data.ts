import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";
const DATABASE_NAME = "cloud-erp";

async function verifyFinanceData() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db(DATABASE_NAME);

    // Check transactions
    const transactionsCount = await db
      .collection("transactions")
      .countDocuments();
    console.log(`\n📊 Total Transactions: ${transactionsCount}`);

    const transactions = await db
      .collection("transactions")
      .find({})
      .project({
        _id: 1,
        userId: 1,
        type: 1,
        amount: 1,
        date: 1,
        description: 1,
        status: 1,
      })
      .sort({ date: -1 })
      .limit(5)
      .toArray();

    console.log("\n🔍 Latest 5 Transactions:");
    transactions.forEach((t, idx) => {
      console.log(
        `${idx + 1}. ${t.type} - Rp ${t.amount.toLocaleString()} - ${
          t.description
        } (${t.status})`
      );
      console.log(
        `   Date: ${t.date.toISOString().split("T")[0]}, UserId: ${t.userId}`
      );
    });

    // Check journal entries
    const journalCount = await db
      .collection("journal_entries")
      .countDocuments();
    console.log(`\n📖 Total Journal Entries: ${journalCount}`);

    // Calculate totals by type
    const totals = await db
      .collection("transactions")
      .aggregate([
        {
          $group: {
            _id: "$type",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    console.log("\n💰 Totals by Type:");
    totals.forEach((t) => {
      console.log(
        `${t._id}: Rp ${t.total.toLocaleString()} (${t.count} transactions)`
      );
    });

    // Calculate net income from journal entries
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

    console.log("\n📈 Account Balances from Journal:");
    let totalRevenue = 0;
    let totalExpense = 0;

    revenueExpense.forEach((account) => {
      const code = account._id;
      const debit = account.debit || 0;
      const credit = account.credit || 0;
      const balance = credit - debit;

      // Revenue accounts (4000-4999) have credit balance
      if (code >= "4000" && code < "5000") {
        totalRevenue += balance;
        console.log(`  ${code} (Revenue): Rp ${balance.toLocaleString()}`);
      }
      // Expense accounts (5000-5999) have debit balance
      else if (code >= "5000" && code < "6000") {
        const expenseAmount = debit - credit;
        totalExpense += expenseAmount;
        console.log(
          `  ${code} (Expense): Rp ${expenseAmount.toLocaleString()}`
        );
      }
    });

    const netIncome = totalRevenue - totalExpense;
    console.log("\n💵 Summary:");
    console.log(`  Total Revenue: Rp ${totalRevenue.toLocaleString()}`);
    console.log(`  Total Expense: Rp ${totalExpense.toLocaleString()}`);
    console.log(`  Net Income: Rp ${netIncome.toLocaleString()}`);

    // Calculate cash balance
    const cashTransactions = await db
      .collection("journal_entries")
      .aggregate([
        { $unwind: "$lines" },
        { $match: { "lines.accountCode": "1000" } }, // Cash account
        {
          $group: {
            _id: null,
            totalDebit: { $sum: "$lines.debit" },
            totalCredit: { $sum: "$lines.credit" },
          },
        },
      ])
      .toArray();

    if (cashTransactions.length > 0) {
      const cashBalance =
        cashTransactions[0].totalDebit - cashTransactions[0].totalCredit;
      console.log(`  Cash Balance: Rp ${cashBalance.toLocaleString()}`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
    console.log("\n✅ Disconnected from MongoDB");
  }
}

verifyFinanceData().catch(console.error);
