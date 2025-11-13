"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type FinanceData = {
  metrics: {
    cashBalance: number;
    accountsReceivable: number;
    accountsPayable: number;
    netIncomeMTD: number;
  };
  recentTransactions: Array<{
    id: string;
    date: string;
    description: string;
    type: "income" | "expense";
    amount: number;
    status: string;
    category: string;
    displayType?: string;
  }>;
};

export default function FinancePage() {
  const router = useRouter();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }),
    []
  );

  const formatCurrency = (value?: number) =>
    currencyFormatter.format(value ?? 0);

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? "-"
      : parsed.toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/finance", { cache: "no-store" });
      if (response.status === 401) {
        const callback = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        router.replace(`/login?callbackUrl=${callback}`);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch finance data");
      }
      const payload = (await response.json()) as FinanceData;
      setData(payload);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Tidak dapat memuat data keuangan.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleNewTransaction = () => {
    router.push("/finance/transaction");
  };

  const handleViewReports = () => {
    router.push("/reports");
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gray-50">
        <AppSidebar activeMenu="finance" />

        <div className="flex-1 overflow-auto">
          <PageHeader title="Finance">
            <Button onClick={handleNewTransaction}>
              <Plus className="mr-2 h-4 w-4" /> New Transaction
            </Button>
          </PageHeader>

          <main className="p-6 space-y-6">
            {error && (
              <Card className="border-destructive/40">
                <CardContent className="pt-4 text-sm text-destructive">
                  {error}
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Cash Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-7 w-24" />
                  ) : (
                    <div className="text-2xl font-bold text-muted-foreground">
                      {formatCurrency(data?.metrics.cashBalance)}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Accounts Receivable
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-7 w-24" />
                  ) : (
                    <div className="text-2xl font-bold text-muted-foreground">
                      {formatCurrency(data?.metrics.accountsReceivable)}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Accounts Payable
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-7 w-24" />
                  ) : (
                    <div className="text-2xl font-bold text-muted-foreground">
                      {formatCurrency(data?.metrics.accountsPayable)}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500">
                    Net Income MTD
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-7 w-24" />
                  ) : (
                    <div
                      className={`text-2xl font-bold ${
                        (data?.metrics.netIncomeMTD ?? 0) < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatCurrency(data?.metrics.netIncomeMTD)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center">
                <CardTitle>Recent Transactions</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={handleViewReports}
                >
                  <FileText className="mr-2 h-4 w-4" /> View Reports
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground"
                        >
                          Memuat transaksi…
                        </TableCell>
                      </TableRow>
                    ) : data && data.recentTransactions.length ? (
                      data.recentTransactions.map((transaction) => (
                        <TableRow key={transaction.id || transaction.date}>
                          <TableCell>{formatDate(transaction.date)}</TableCell>
                          <TableCell>{transaction.description}</TableCell>
                          <TableCell className="capitalize">
                            {transaction.displayType ||
                              transaction.category ||
                              transaction.type}
                          </TableCell>
                          <TableCell>
                            {formatCurrency(transaction.amount)}
                          </TableCell>
                          <TableCell className="text-right capitalize">
                            {transaction.status}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground"
                        >
                          Tidak ada transaksi terbaru.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
