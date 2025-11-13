import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";
import { MongoClient, type ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

import { TRANSACTION_PRESETS } from "../lib/transaction-presets";

const ENV_FILES = [".env.local", ".env"]; // prioritize Next.js local env

ENV_FILES.forEach((file) => {
  const filepath = resolve(process.cwd(), file);
  if (existsSync(filepath)) {
    loadEnv({ path: filepath });
  }
});

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "cloud-erp";
const seedTag = "sample-seed-v1";

if (!uri) {
  console.error("MONGODB_URI environment variable is not set");
  process.exit(1);
}

const mongoUri: string = uri;

const now = new Date();

const setCurrentMonthDay = (day: number) =>
  new Date(now.getFullYear(), now.getMonth(), Math.min(Math.max(day, 1), 28));

const setPreviousMonthDay = (day: number) =>
  new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    Math.min(Math.max(day, 1), 28)
  );

const sampleAccounts = [
  {
    name: "Cash & Equivalents",
    type: "asset",
    balance: 85000000,
  },
  {
    name: "Accounts Receivable",
    type: "asset",
    balance: 18000000,
  },
  {
    name: "Inventory",
    type: "asset",
    balance: 37000000,
  },
  {
    name: "Prepaid Expenses",
    type: "asset",
    balance: 6000000,
  },
  {
    name: "Accounts Payable",
    type: "liability",
    balance: 22000000,
  },
  {
    name: "Bank Loan Payable",
    type: "liability",
    balance: 30000000,
  },
  {
    name: "Share Capital",
    type: "equity",
    balance: 30000000,
  },
  {
    name: "Retained Earnings",
    type: "equity",
    balance: 64000000,
  },
];

const sampleTransactions = [
  {
    type: "income",
    amount: 45000000,
    date: setCurrentMonthDay(4),
    description: "Penjualan Produk A",
    category: "Sales - Produk A",
    status: "posted",
    cashFlowType: "operating",
    counterparty: "PT Nusantara Makmur",
    presetKey: "cash",
    presetLabel: TRANSACTION_PRESETS.cash.label,
  },
  {
    type: "income",
    amount: 22000000,
    date: setCurrentMonthDay(12),
    description: "Penjualan Jasa Konsultasi",
    category: "Consulting Revenue",
    status: "pending",
    cashFlowType: "operating",
    counterparty: "CV Solusi Maju",
    presetKey: "cash",
    presetLabel: TRANSACTION_PRESETS.cash.label,
  },
  {
    type: "expense",
    amount: 16000000,
    date: setCurrentMonthDay(9),
    description: "Pembelian Bahan Baku",
    category: "Cost of Goods Sold",
    status: "posted",
    cashFlowType: "operating",
    counterparty: "PT Bahan Jaya",
    presetKey: "purchase",
    presetLabel: TRANSACTION_PRESETS.purchase.label,
  },
  {
    type: "expense",
    amount: 7500000,
    date: setCurrentMonthDay(15),
    description: "Gaji Karyawan",
    category: "Payroll Expense",
    status: "posted",
    cashFlowType: "operating",
    counterparty: "Divisi HR",
    presetKey: "cogs",
    presetLabel: TRANSACTION_PRESETS.cogs.label,
  },
  {
    type: "expense",
    amount: 4300000,
    date: setCurrentMonthDay(20),
    description: "Sewa Kantor",
    category: "Rent Expense",
    status: "posted",
    cashFlowType: "operating",
    counterparty: "Graha Office",
  },
  {
    type: "expense",
    amount: 6000000,
    date: setCurrentMonthDay(22),
    description: "Tagihan Utilitas",
    category: "Utilities Expense",
    status: "pending",
    cashFlowType: "operating",
    counterparty: "PLN & PAM",
  },
  {
    type: "expense",
    amount: 28000000,
    date: setCurrentMonthDay(6),
    description: "Pembelian Mesin Produksi",
    category: "Equipment Purchase",
    status: "posted",
    cashFlowType: "investing",
    counterparty: "PT Mesin Sejahtera",
  },
  {
    type: "income",
    amount: 25000000,
    date: setCurrentMonthDay(2),
    description: "Pencairan Pinjaman Bank",
    category: "Bank Loan Proceeds",
    status: "posted",
    cashFlowType: "financing",
    counterparty: "Bank Nasional",
  },
  {
    type: "expense",
    amount: 9500000,
    date: setCurrentMonthDay(26),
    description: "Angsuran Pinjaman Bank",
    category: "Bank Loan Repayment",
    status: "posted",
    cashFlowType: "financing",
    counterparty: "Bank Nasional",
  },
  {
    type: "income",
    amount: 18000000,
    date: setPreviousMonthDay(18),
    description: "Penjualan Produk B",
    category: "Sales - Produk B",
    status: "posted",
    cashFlowType: "operating",
    counterparty: "PT Sentosa Abadi",
    presetKey: "cash",
    presetLabel: TRANSACTION_PRESETS.cash.label,
  },
  {
    type: "expense",
    amount: 8200000,
    date: setPreviousMonthDay(24),
    description: "Biaya Promosi",
    category: "Marketing Expense",
    status: "posted",
    cashFlowType: "operating",
    counterparty: "Media Citra",
  },
];

const adminUser = {
  username: "admin",
  password: "admin123",
  role: "admin",
};

async function seed() {
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(dbName);

    const accountsCollection = db.collection("accounts");
    const transactionsCollection = db.collection("transactions");
    const usersCollection = db.collection("users");

    const timestamp = new Date();
    const adminPasswordHash = await bcrypt.hash(adminUser.password, 10);

    const userResult = await usersCollection.findOneAndUpdate(
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

    const adminRecord =
      userResult?.value ??
      (await usersCollection.findOne<{ _id: ObjectId }>(
        { username: adminUser.username },
        { projection: { _id: 1 } }
      ));

    if (!adminRecord?._id) {
      throw new Error("Failed to resolve admin user identifier for seeding");
    }

    const adminUserId = adminRecord._id;

    await accountsCollection.deleteMany({ seedTag });
    if (sampleAccounts.length) {
      await accountsCollection.insertMany(
        sampleAccounts.map((account) => ({
          ...account,
          userId: adminUserId,
          seedTag,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))
      );
    }

    await transactionsCollection.deleteMany({ seedTag });
    if (sampleTransactions.length) {
      await transactionsCollection.insertMany(
        sampleTransactions.map((transaction) => ({
          ...transaction,
          userId: adminUserId,
          seedTag,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))
      );
    }

    console.log(
      `Seed complete: ${sampleAccounts.length} accounts, ${sampleTransactions.length} transactions, and admin user inserted.`
    );
  } catch (error) {
    console.error("Failed to seed sample data", error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

async function purgeSeedData() {
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db(dbName);

    const accountsCollection = db.collection("accounts");
    const transactionsCollection = db.collection("transactions");
    const usersCollection = db.collection("users");

    const [accountsResult, transactionsResult, usersResult] = await Promise.all(
      [
        accountsCollection.deleteMany({ seedTag }),
        transactionsCollection.deleteMany({ seedTag }),
        usersCollection.deleteMany({ seedTag }),
      ]
    );

    console.log(
      `Purge complete: ${accountsResult.deletedCount} accounts, ${transactionsResult.deletedCount} transactions, and ${usersResult.deletedCount} users removed.`
    );
  } catch (error) {
    console.error("Failed to purge sample data", error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const shouldPurge = args.has("--purge");

  if (shouldPurge) {
    await purgeSeedData();
    return;
  }

  await seed();
}

main();
