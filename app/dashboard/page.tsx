"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

type DashboardMetrics = {
  metrics: {
    incomeThisMonth: number;
    expensesThisMonth: number;
    cashBalance: number;
  };
  monthlyTrend: Array<{
    label: string;
    income: number;
    expenses: number;
    cashBalance: number;
  }>;
  notifications: string[];
};

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardMetrics | null>(null);
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

  const compactFormatter = useMemo(
    () =>
      new Intl.NumberFormat("id-ID", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    []
  );

  const calculateChange = (current?: number, previous?: number) => {
    if (typeof current !== "number" || typeof previous !== "number") {
      return null;
    }
    if (previous === 0) {
      return current === 0 ? 0 : null;
    }
    const delta = ((current - previous) / Math.abs(previous)) * 100;
    return Number.isFinite(delta) ? delta : null;
  };

  useEffect(() => {
    let ignore = false;

    const redirectToLogin = async () => {
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
    };

    const loadData = async () => {
      setLoading(true);
      console.log("🔄 Loading dashboard data...");
      try {
        console.log("🔐 Checking session...");
        const sessionResponse = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "include",
        });

        console.log("📊 Session response status:", sessionResponse.status);
        if (!sessionResponse.ok) {
          if (sessionResponse.status === 401) {
            console.log("❌ Session expired, redirecting to login");
            await redirectToLogin();
            return;
          }

          console.warn(
            "Session verification failed with status",
            sessionResponse.status
          );
          await redirectToLogin();
          return;
        }

        const sessionData = await sessionResponse.json();
        console.log("✅ Session valid:", sessionData);

        console.log("📈 Fetching dashboard data...");
        const response = await fetch("/api/dashboard", {
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch dashboard data");
        }
        const payload = (await response.json()) as DashboardMetrics;
        if (!ignore) {
          setData(payload);
          setError(null);
        }
      } catch (err) {
        console.error(err);
        if (!ignore) {
          setError("Tidak dapat memuat data dashboard. Silakan coba lagi.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      ignore = true;
    };
  }, [router]);

  const monthlyTrend = data?.monthlyTrend ?? [];
  const currentTrend = monthlyTrend.at(-1);
  const previousTrend = monthlyTrend.at(-2);

  const statCards = [
    {
      key: "income",
      title: "Total Income This Month",
      description: "Pendapatan bulan berjalan",
      value: formatCurrency(data?.metrics.incomeThisMonth),
      change: calculateChange(currentTrend?.income, previousTrend?.income),
      gradient: "from-emerald-500/20 via-emerald-500/10 to-white",
      accent: "bg-emerald-500/25",
      textColor: "text-emerald-600",
    },
    {
      key: "expenses",
      title: "Total Expenses This Month",
      description: "Pengeluaran bulan berjalan",
      value: formatCurrency(data?.metrics.expensesThisMonth),
      change: calculateChange(currentTrend?.expenses, previousTrend?.expenses),
      gradient: "from-rose-500/20 via-rose-500/10 to-white",
      accent: "bg-rose-500/25",
      textColor: "text-rose-600",
    },
    {
      key: "cash",
      title: "Cash Balance",
      description: "Saldo kas terkini",
      value: formatCurrency(data?.metrics.cashBalance),
      change: null,
      gradient: "from-sky-500/20 via-sky-500/10 to-white",
      accent: "bg-sky-500/25",
      textColor: "text-sky-600",
    },
  ];

  const chartConfig = {
    income: {
      label: "Pendapatan",
      color: "#22c55e", // Green for income
    },
    expenses: {
      label: "Pengeluaran",
      color: "#ef4444", // Red for expenses
    },
    cashBalance: {
      label: "Saldo Kas",
      color: "#06b6d4", // Blue for cash balance
    },
  } as const;

  const chartData = monthlyTrend.map((entry) => ({
    label: entry.label,
    income: entry.income,
    expenses: entry.expenses,
    cashBalance: entry.cashBalance || 0,
  }));

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <AppSidebar activeMenu="dashboard" />

        <div className="flex-1 overflow-auto">
          <PageHeader title="Dashboard" showLogo={true} />

          <main className="space-y-6 p-6">
            {error && (
              <Card className="mb-6 border-destructive/40">
                <CardContent className="pt-4 text-sm text-destructive">
                  {error}
                </CardContent>
              </Card>
            )}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {statCards.map((card) => (
                <Card
                  key={card.key}
                  className={cn(
                    "relative overflow-hidden border-none shadow-lg backdrop-blur",
                    "bg-gradient-to-br",
                    card.gradient
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl",
                      card.accent
                    )}
                  />
                  <CardHeader className="pb-2">
                    <CardTitle
                      className={cn("text-sm font-semibold", card.textColor)}
                    >
                      {card.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {loading ? (
                      <Skeleton className="h-8 w-32" />
                    ) : (
                      <div className="text-3xl font-bold tracking-tight text-slate-900">
                        {card.value}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {card.description}
                    </p>
                    {!loading && card.change !== null && (
                      <p
                        className={cn(
                          "text-xs font-medium",
                          card.change >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        )}
                      >
                        <span aria-hidden>{card.change >= 0 ? "▲" : "▼"}</span>{" "}
                        {`${card.change >= 0 ? "+" : "-"}${Math.abs(
                          card.change
                        ).toFixed(1)}%`}
                        <span className="text-muted-foreground">
                          {" "}
                          dibanding bulan lalu
                        </span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-4">
              <Card className="col-span-1 overflow-hidden border-none shadow-lg lg:col-span-3">
                <CardHeader className="flex flex-col gap-2 border-b bg-white/60 pb-4">
                  <div>
                    <CardTitle className="text-lg font-semibold text-slate-900">
                      Analisis Income vs Expenses
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Perbandingan performa pendapatan dan pengeluaran tiap
                      bulan.
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {loading ? (
                    <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
                      Memuat data tren…
                    </div>
                  ) : chartData.length ? (
                    <div className="space-y-6">
                      <ChartContainer
                        config={chartConfig}
                        className="h-[320px] w-full"
                      >
                        <BarChart data={chartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tickMargin={8}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tickMargin={12}
                            tickFormatter={(value) =>
                              compactFormatter.format(value)
                            }
                          />
                          <ChartTooltip
                            cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                            content={
                              <ChartTooltipContent
                                labelFormatter={(label) => `Periode ${label}`}
                                formatter={(value, name) => (
                                  <div className="flex w-full items-center justify-between gap-3">
                                    <span className="text-muted-foreground">
                                      {name}
                                    </span>
                                    <span className="font-mono text-sm font-semibold text-slate-900">
                                      {formatCurrency(Number(value))}
                                    </span>
                                  </div>
                                )}
                              />
                            }
                          />
                          <ChartLegend
                            verticalAlign="top"
                            content={<ChartLegendContent className="pt-0" />}
                          />
                          <Bar
                            dataKey="income"
                            name="Pendapatan"
                            fill="var(--color-income)"
                            radius={[2, 2, 0, 0]}
                            maxBarSize={20}
                          />
                          <Bar
                            dataKey="expenses"
                            name="Pengeluaran"
                            fill="var(--color-expenses)"
                            radius={[2, 2, 0, 0]}
                            maxBarSize={20}
                          />
                          <Bar
                            dataKey="assets"
                            name="Aset"
                            fill="var(--color-assets)"
                            radius={[2, 2, 0, 0]}
                            maxBarSize={20}
                          />
                          <Bar
                            dataKey="liabilities"
                            name="Liabilitas"
                            fill="var(--color-liabilities)"
                            radius={[2, 2, 0, 0]}
                            maxBarSize={20}
                          />
                          <Bar
                            dataKey="equity"
                            name="Ekuitas"
                            fill="var(--color-equity)"
                            radius={[2, 2, 0, 0]}
                            maxBarSize={20}
                          />
                          <Bar
                            dataKey="cashBalance"
                            name="Saldo Kas"
                            fill="var(--color-cashBalance)"
                            radius={[2, 2, 0, 0]}
                            maxBarSize={20}
                          />
                        </BarChart>
                      </ChartContainer>

                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/70">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-4 py-3 text-left">Periode</th>
                              <th className="px-4 py-3 text-right">Income</th>
                              <th className="px-4 py-3 text-right">Expenses</th>
                              <th className="px-4 py-3 text-right">
                                Cash Balance
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white/70">
                            {chartData.map((entry, index) => (
                              <tr key={entry.label}>
                                <td className="px-4 py-3 font-medium text-slate-700">
                                  {entry.label}
                                </td>
                                <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                                  {formatCurrency(entry.income)}
                                </td>
                                <td className="px-4 py-3 text-right text-red-600 font-medium">
                                  {formatCurrency(entry.expenses)}
                                </td>

                                <td className="px-4 py-3 text-right text-cyan-600 font-medium">
                                  {formatCurrency(entry.cashBalance)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-80 items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/10 text-sm text-muted-foreground">
                      Belum ada data tren keuangan.
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="border-none bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-white shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    Notifications
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Update terbaru dari aktivitas operasional.
                  </p>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-3/4" />
                      <Skeleton className="h-10 w-2/3" />
                    </div>
                  ) : data && data.notifications.length ? (
                    <ul className="space-y-3 text-sm">
                      {data.notifications.map((note, index) => (
                        <li
                          key={`${note}-${index}`}
                          className="relative rounded-lg border border-indigo-100 bg-white/70 px-4 py-3 text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-white"
                        >
                          <span className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-indigo-400" />
                          <span className="pl-4 text-sm leading-relaxed">
                            {note}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-dashed border-indigo-200 bg-white/60 p-4 text-sm text-muted-foreground">
                      Tidak ada notifikasi saat ini.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
