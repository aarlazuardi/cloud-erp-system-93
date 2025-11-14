import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "";

async function debugNetIncome() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const db = client.db("cloud-erp");

  console.log("🔍 Debugging Net Income Calculation\n");

  // Test with all-time period (2020-2030)
  const periodStart = new Date(2020, 0, 1);
  const periodEnd = new Date(2030, 11, 31);

  console.log(
    "📅 Period:",
    periodStart.toISOString(),
    "to",
    periodEnd.toISOString()
  );

  // Get all journal entries in period
  const journalCount = await db.collection("journal_entries").countDocuments({
    date: { $gte: periodStart, $lt: periodEnd },
  });

  console.log(`📖 Journal entries in period: ${journalCount}\n`);

  // Aggregate by account code
  const aggregates = await db
    .collection("journal_entries")
    .aggregate([
      { $match: { date: { $gte: periodStart, $lt: periodEnd } } },
      { $unwind: "$lines" },
      {
        $group: {
          _id: "$lines.accountCode",
          debit: { $sum: "$lines.debit" },
          credit: { $sum: "$lines.credit" },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  console.log("💰 Account Balances:");
  let totalRevenue = 0;
  let totalExpense = 0;

  aggregates.forEach((agg) => {
    const code = agg._id;
    const debit = agg.debit || 0;
    const credit = agg.credit || 0;
    const balance = credit - debit;

    // Revenue accounts (4000-4999)
    if (code >= "4000" && code < "5000") {
      totalRevenue += balance;
      console.log(
        `  ${code} (Revenue): Debit ${debit.toLocaleString()}, Credit ${credit.toLocaleString()}, Balance ${balance.toLocaleString()}`
      );
    }
    // Expense accounts (5000-5999)
    else if (code >= "5000" && code < "6000") {
      const expenseAmount = debit - credit;
      totalExpense += expenseAmount;
      console.log(
        `  ${code} (Expense): Debit ${debit.toLocaleString()}, Credit ${credit.toLocaleString()}, Expense ${expenseAmount.toLocaleString()}`
      );
    } else {
      console.log(
        `  ${code} (Other): Debit ${debit.toLocaleString()}, Credit ${credit.toLocaleString()}`
      );
    }
  });

  const netIncome = totalRevenue - totalExpense;

  console.log("\n📊 Summary:");
  console.log(`  Total Revenue: Rp ${totalRevenue.toLocaleString()}`);
  console.log(`  Total Expense: Rp ${totalExpense.toLocaleString()}`);
  console.log(`  Net Income: Rp ${netIncome.toLocaleString()}`);

  await client.close();
}

debugNetIncome().catch(console.error);
