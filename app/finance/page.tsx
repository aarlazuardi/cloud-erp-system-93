"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Edit3,
  FileText,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import type { FinanceEntryType } from "@/lib/transaction-presets";

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
    type: FinanceEntryType;
    amount: number;
    status: string;
    category: string;
    displayType: string;
  }>;
};

export default function FinancePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const getStatusLabel = useCallback((status: string | undefined | null) => {
    const key = (status ?? "").toLowerCase();
    if (key === "posted") {
      return "Diposting";
    }
    if (key === "pending") {
      return "Menunggu";
    }
    return status ?? "-";
  }, []);

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

  const redirectToLogin = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {
      /* ignore logout errors */
    });
    const callback = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    router.replace(`/login?callbackUrl=${callback}`);
  }, [router]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "include",
      });

      if (!sessionResponse.ok) {
        console.warn(
          "Session verification failed with status",
          sessionResponse.status
        );
        await redirectToLogin();
        return;
      }

      const response = await fetch("/api/finance", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) {
          await redirectToLogin();
          return;
        }
        throw new Error("Gagal mengambil data keuangan");
      }
      const payload = (await response.json()) as FinanceData;
      setData(payload);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Tidak dapat memuat data keuangan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [redirectToLogin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleNewTransaction = () => {
    router.push("/finance/transaction");
  };

  const handleViewReports = () => {
    router.push("/reports");
  };

  const handleEditTransaction = (id: string) => {
    if (!id) {
      return;
    }
    router.push(`/finance/transaction?id=${encodeURIComponent(id)}`);
  };

  const handleToggleStatus = async (
    transaction: FinanceData["recentTransactions"][number]
  ) => {
    if (!transaction.id) {
      return;
    }

    const currentStatus =
      (transaction.status ?? "").toLowerCase() === "posted"
        ? "posted"
        : "pending";
    const nextStatus = currentStatus === "posted" ? "pending" : "posted";

    setActionId(transaction.id);

    try {
      const response = await fetch(`/api/finance/${transaction.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
        credentials: "include",
      });

      if (response.status === 401) {
        await redirectToLogin();
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ?? "Gagal memperbarui status transaksi."
        );
      }

      toast({
        title: "Status diperbarui",
        description: `Status transaksi diubah menjadi ${getStatusLabel(
          nextStatus
        )}.`,
      });
      await loadData();
    } catch (err) {
      console.error(err);
      toast({
        title: "Operasi gagal",
        description:
          err instanceof Error
            ? err.message
            : "Tidak dapat memperbarui status transaksi.",
        variant: "destructive",
      });
    } finally {
      setActionId(null);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!id) {
      return;
    }

    const confirmed = window.confirm("Hapus transaksi ini?");
    if (!confirmed) {
      return;
    }

    setActionId(id);

    try {
      const response = await fetch(`/api/finance/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.status === 401) {
        await redirectToLogin();
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Gagal menghapus transaksi.");
      }

      toast({
        title: "Transaksi dihapus",
        description: "Transaksi berhasil dihapus.",
      });
      await loadData();
    } catch (err) {
      console.error(err);
      toast({
        title: "Operasi gagal",
        description:
          err instanceof Error
            ? err.message
            : "Tidak dapat menghapus transaksi.",
        variant: "destructive",
      });
    } finally {
      setActionId(null);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gray-50">
        <AppSidebar activeMenu="finance" />

        <div className="flex-1 overflow-auto">
          <PageHeader title="Keuangan">
            <Button onClick={handleNewTransaction}>
              <Plus className="mr-2 h-4 w-4" /> Transaksi Baru
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
                    Net Income This Month
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
                  <FileText className="mr-2 h-4 w-4" /> Lihat Laporan
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
                      <TableHead className="w-[60px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
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
                            {getStatusLabel(transaction.status)}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={actionId === transaction.id}
                                >
                                  {actionId === transaction.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MoreVertical className="h-4 w-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleEditTransaction(transaction.id)
                                  }
                                >
                                  <Edit3 className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleToggleStatus(transaction)
                                  }
                                >
                                  <RefreshCcw className="mr-2 h-4 w-4" />
                                  {getStatusLabel(
                                    (transaction.status ?? "").toLowerCase() ===
                                      "posted"
                                      ? "pending"
                                      : "posted"
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() =>
                                    handleDeleteTransaction(transaction.id)
                                  }
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Hapus
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={6}
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
