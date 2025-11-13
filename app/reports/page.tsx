"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

type PeriodKey =
  | "current-month"
  | "last-month"
  | "current-quarter"
  | "last-quarter"
  | "year-to-date"
  | "last-year";

type ReportType = "income-statement" | "balance-sheet" | "cash-flow";

type ReportRow = {
  label: string;
  amount: number;
  description?: string;
};

type ReportData = {
  period: string;
  range: {
    start: string;
    end: string;
  };
  generatedAt: string;
  incomeStatement: {
    revenues: ReportRow[];
    expenses: ReportRow[];
    totals: {
      revenue: number;
      expenses: number;
      netIncome: number;
    };
  };
  balanceSheet: {
    assets: ReportRow[];
    liabilities: ReportRow[];
    equity: ReportRow[];
    totals: {
      assets: number;
      liabilities: number;
      equity: number;
    };
  };
  cashFlow: {
    operating: ReportRow[];
    investing: ReportRow[];
    financing: ReportRow[];
    totals: {
      operating: number;
      investing: number;
      financing: number;
      netChange: number;
    };
  };
};

type StatementSection = {
  letter: string;
  title: string;
  rows: ReportRow[];
  summary?: ReportRow[];
  base?: number;
  hideRatio?: boolean;
  emptyLabel: string;
};

const periodOptions: Array<{ value: PeriodKey; label: string }> = [
  { value: "current-month", label: "Current Month" },
  { value: "last-month", label: "Last Month" },
  { value: "current-quarter", label: "Current Quarter" },
  { value: "last-quarter", label: "Last Quarter" },
  { value: "year-to-date", label: "Year To Date" },
  { value: "last-year", label: "Last Year" },
];

const REPORT_TITLES: Record<ReportType, string> = {
  "income-statement": "Income Statement",
  "balance-sheet": "Balance Sheet",
  "cash-flow": "Cash Flow Statement",
};

export default function ReportsPage() {
  const router = useRouter();
  const [reportType, setReportType] = useState<ReportType>("income-statement");
  const [period, setPeriod] = useState<PeriodKey>("current-month");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [pdfExporting, setPdfExporting] = useState<boolean>(false);
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

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat("id-ID", {
        style: "percent",
        maximumFractionDigits: 1,
      }),
    []
  );

  const formatCurrency = (value?: number) =>
    currencyFormatter.format(value ?? 0);

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "-";
    }

    return percentFormatter.format(value);
  };

  const fetchReportData = useCallback(
    async (targetPeriod: PeriodKey) => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ period: targetPeriod });
        const response = await fetch(`/api/reports?${params.toString()}`, {
          cache: "no-store",
        });

        if (response.status === 401) {
          const callback = encodeURIComponent(
            window.location.pathname + window.location.search
          );
          router.replace(`/login?callbackUrl=${callback}`);
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch report (${response.status})`);
        }

        const payload = (await response.json()) as ReportData;
        setData(payload);
      } catch (err) {
        console.error(err);
        setError("Gagal memuat laporan.");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    void fetchReportData("current-month");
  }, [fetchReportData]);

  const handleGenerateReport = () => {
    void fetchReportData(period);
  };

  const handleDownloadExcel = async () => {
    if (!data || downloading) {
      return;
    }

    setError(null);
    setDownloading(true);

    try {
      const params = new URLSearchParams({ period, type: reportType });
      const response = await fetch(`/api/reports/export?${params.toString()}`);

      if (response.status === 401) {
        const callback = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        router.replace(`/login?callbackUrl=${callback}`);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to download Excel (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `report-${reportType}-${period}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Gagal mengunduh file Excel.");
    } finally {
      setDownloading(false);
    }
  };

  const getRowPrimaryLabel = (row: ReportRow) => {
    const description = row.description?.trim();
    return description && description.length > 0 ? description : row.label;
  };

  const getRowSecondaryLabel = (row: ReportRow) => {
    const description = row.description?.trim();
    if (!description || description.length === 0) {
      return null;
    }
    const trimmedLabel = row.label.trim();
    if (!trimmedLabel || trimmedLabel === description) {
      return null;
    }
    return row.label;
  };

  const calculateRatio = (amount: number, base?: number) => {
    if (!base || !Number.isFinite(base) || base === 0) {
      return null;
    }

    return amount / base;
  };

  const renderNoDataState = (message: string) => (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );

  const incomeStatementSections = useMemo<StatementSection[]>(() => {
    if (!data) {
      return [];
    }

    const { revenue, expenses, netIncome } = data.incomeStatement.totals;

    return [
      {
        letter: "A",
        title: "Pendapatan",
        rows: data.incomeStatement.revenues,
        summary: [
          {
            label: "Total Pendapatan",
            amount: revenue,
          },
        ],
        base: revenue,
        emptyLabel: "pendapatan",
      },
      {
        letter: "B",
        title: "Biaya Operasional",
        rows: data.incomeStatement.expenses,
        summary: [
          {
            label: "Total Biaya Operasional",
            amount: expenses,
          },
        ],
        base: revenue,
        emptyLabel: "biaya operasional",
      },
      {
        letter: "C",
        title: "Ringkasan Laba",
        rows: [],
        summary: [
          {
            label: "Laba Bersih",
            amount: netIncome,
          },
        ],
        base: revenue,
        emptyLabel: "ringkasan laba",
      },
    ];
  }, [data]);

  const balanceSheetSections = useMemo<StatementSection[]>(() => {
    if (!data) {
      return [];
    }

    const { assets, liabilities, equity } = data.balanceSheet.totals;

    return [
      {
        letter: "A",
        title: "Aset",
        rows: data.balanceSheet.assets,
        summary: [
          {
            label: "Total Aset",
            amount: assets,
          },
        ],
        base: assets,
        emptyLabel: "aset",
      },
      {
        letter: "B",
        title: "Kewajiban",
        rows: data.balanceSheet.liabilities,
        summary: [
          {
            label: "Total Kewajiban",
            amount: liabilities,
          },
        ],
        base: liabilities,
        emptyLabel: "kewajiban",
      },
      {
        letter: "C",
        title: "Ekuitas",
        rows: data.balanceSheet.equity,
        summary: [
          {
            label: "Total Ekuitas",
            amount: equity,
          },
        ],
        base: equity,
        emptyLabel: "ekuitas",
      },
    ];
  }, [data]);

  const cashFlowSections = useMemo<StatementSection[]>(() => {
    if (!data) {
      return [];
    }

    return [
      {
        letter: "A",
        title: "Arus Kas Operasional",
        rows: data.cashFlow.operating,
        summary: [
          {
            label: "Net Cash Operasional",
            amount: data.cashFlow.totals.operating,
          },
        ],
        hideRatio: true,
        emptyLabel: "aktivitas operasional",
      },
      {
        letter: "B",
        title: "Arus Kas Investasi",
        rows: data.cashFlow.investing,
        summary: [
          {
            label: "Net Cash Investasi",
            amount: data.cashFlow.totals.investing,
          },
        ],
        hideRatio: true,
        emptyLabel: "aktivitas investasi",
      },
      {
        letter: "C",
        title: "Arus Kas Pendanaan",
        rows: data.cashFlow.financing,
        summary: [
          {
            label: "Net Cash Pendanaan",
            amount: data.cashFlow.totals.financing,
          },
        ],
        hideRatio: true,
        emptyLabel: "aktivitas pendanaan",
      },
      {
        letter: "D",
        title: "Ringkasan Kas",
        rows: [],
        summary: [
          {
            label: "Kenaikan Bersih Kas",
            amount: data.cashFlow.totals.netChange,
          },
        ],
        hideRatio: true,
        emptyLabel: "ringkasan kas",
      },
    ];
  }, [data]);

  const renderEmptyRow = (label: string, showRatio: boolean) => (
    <TableRow key={`${label}-empty`}>
      <TableCell
        colSpan={showRatio ? 3 : 2}
        className="text-center text-xs text-muted-foreground"
      >
        Tidak ada data {label}.
      </TableCell>
    </TableRow>
  );

  const renderSection = (section: StatementSection) => {
    const showRatio = !section.hideRatio;
    const hasDataRows = section.rows.length > 0;
    const hasSummaryRows = (section.summary?.length ?? 0) > 0;
    const headerColSpan = showRatio ? 3 : 2;

    return (
      <div
        key={`${section.letter}-${section.title}`}
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[320px] text-slate-600">
                Keterangan
              </TableHead>
              {showRatio && (
                <TableHead className="w-[120px] text-right text-slate-500">
                  Rasio
                </TableHead>
              )}
              <TableHead className="text-right text-slate-600">
                Nominal (Rp)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-slate-100">
              <TableCell colSpan={headerColSpan} className="p-0">
                <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {section.letter}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-800">
                    {section.title}
                  </h3>
                </div>
              </TableCell>
            </TableRow>

            {hasDataRows
              ? section.rows.map((row, index) => {
                  const ratio = calculateRatio(row.amount, section.base);
                  const primary = getRowPrimaryLabel(row);
                  const secondary = getRowSecondaryLabel(row);

                  return (
                    <TableRow key={`${section.title}-row-${index}`}>
                      <TableCell className="align-top">
                        <div className="font-medium text-slate-700">
                          {primary}
                        </div>
                        {secondary && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {secondary}
                          </p>
                        )}
                      </TableCell>
                      {showRatio && (
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatPercent(ratio)}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-medium text-slate-700">
                        {formatCurrency(row.amount)}
                      </TableCell>
                    </TableRow>
                  );
                })
              : null}

            {!hasDataRows && !hasSummaryRows
              ? renderEmptyRow(section.emptyLabel, showRatio)
              : null}

            {section.summary?.map((row, index) => {
              const ratio = calculateRatio(row.amount, section.base);

              return (
                <TableRow
                  key={`${section.title}-summary-${index}`}
                  className="bg-slate-50"
                >
                  <TableCell className="font-semibold text-slate-900">
                    {row.label}
                  </TableCell>
                  {showRatio && (
                    <TableCell className="text-right font-semibold text-slate-900">
                      {formatPercent(ratio)}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-semibold text-slate-900">
                    {formatCurrency(row.amount)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  const handleDownloadPDF = async () => {
    if (!data || pdfExporting) {
      return;
    }

    setError(null);
    setPdfExporting(true);

    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const autoTable = (autoTableModule.default ?? autoTableModule) as (
        doc: unknown,
        options: unknown
      ) => { finalY?: number };

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });

      const margin = 36;
      const usableWidth = doc.internal.pageSize.getWidth() - margin * 2;

      const rangeStart = new Date(data.range.start).toLocaleDateString("id-ID");
      const rangeEnd = new Date(data.range.end).toLocaleDateString("id-ID");
      const generatedAt = new Date(data.generatedAt).toLocaleString("id-ID");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(REPORT_TITLES[reportType], margin, margin);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`Periode: ${data.period}`, margin, margin + 18);
      doc.text(`Range: ${rangeStart} - ${rangeEnd}`, margin, margin + 34);
      doc.text(`Dibuat: ${generatedAt}`, margin, margin + 50);

      const sectionMap: Record<ReportType, StatementSection[]> = {
        "income-statement": incomeStatementSections,
        "balance-sheet": balanceSheetSections,
        "cash-flow": cashFlowSections,
      };

      let nextY = margin + 70;

      for (const section of sectionMap[reportType]) {
        const showRatio = !section.hideRatio;
        const head = [
          showRatio
            ? ["Keterangan", "Rasio", "Nominal (Rp)"]
            : ["Keterangan", "Nominal (Rp)"],
        ];

        const body: Array<
          Array<
            | string
            | number
            | {
                content: string;
                colSpan?: number;
                styles?: Record<string, unknown>;
              }
          >
        > = [];

        body.push([
          {
            content: `${section.letter}. ${section.title}`,
            colSpan: showRatio ? 3 : 2,
            styles: {
              fillColor: [241, 245, 249],
              textColor: [15, 23, 42],
              fontStyle: "bold",
              halign: "left",
            },
          },
        ]);

        if (section.rows.length) {
          for (const row of section.rows) {
            const ratio = calculateRatio(row.amount, section.base);
            const primary = getRowPrimaryLabel(row);
            const secondary = getRowSecondaryLabel(row);
            const label = secondary ? `${primary}\n${secondary}` : primary;

            const rowCells: Array<
              | string
              | number
              | { content: string; styles?: Record<string, unknown> }
            > = [
              {
                content: label,
                styles: secondary
                  ? {
                      cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
                    }
                  : undefined,
              },
            ];

            if (showRatio) {
              rowCells.push(formatPercent(ratio));
            }

            rowCells.push(formatCurrency(row.amount));

            body.push(rowCells);
          }
        }

        if (!section.rows.length && !(section.summary?.length ?? 0)) {
          body.push([
            {
              content: `Tidak ada data ${section.emptyLabel}.`,
              colSpan: showRatio ? 3 : 2,
              styles: {
                textColor: [100, 116, 139],
                fontSize: 9,
                halign: "center",
              },
            },
          ]);
        }

        if (section.summary?.length) {
          for (const row of section.summary) {
            const ratio = calculateRatio(row.amount, section.base);
            const summaryCells: Array<
              | string
              | number
              | { content: string; styles?: Record<string, unknown> }
            > = [
              {
                content: row.label,
                styles: {
                  fontStyle: "bold",
                },
              },
            ];

            if (showRatio) {
              summaryCells.push({
                content: formatPercent(ratio),
                styles: {
                  fontStyle: "bold",
                },
              });
            }

            summaryCells.push({
              content: formatCurrency(row.amount),
              styles: {
                fontStyle: "bold",
              },
            });

            body.push(summaryCells);
          }
        }

        autoTable(doc, {
          startY: nextY,
          head,
          body,
          margin: { left: margin, right: margin },
          tableWidth: usableWidth,
          styles: {
            font: "helvetica",
            fontSize: 10,
            overflow: "linebreak",
            cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
            lineColor: [226, 232, 240],
            lineWidth: 0.5,
          },
          headStyles: {
            fillColor: [248, 250, 252],
            textColor: [71, 85, 105],
            fontStyle: "bold",
            halign: "left",
          },
          bodyStyles: {
            textColor: [51, 65, 85],
          },
          alternateRowStyles: {
            fillColor: [249, 250, 251],
          },
        });

        const autoTableState = (
          doc as unknown as {
            lastAutoTable?: { finalY: number };
          }
        ).lastAutoTable;
        nextY = (autoTableState?.finalY ?? nextY) + 20;
      }

      doc.save(`report-${reportType}-${period}.pdf`);
    } catch (err) {
      console.error("Failed to export PDF", err);
      setError("Gagal mengunduh file PDF.");
    } finally {
      setPdfExporting(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gray-50">
        <AppSidebar activeMenu="reports" />

        <div className="flex-1 overflow-auto">
          <PageHeader title="Financial Reports" />

          <main className="p-6">
            {error && (
              <Card className="mb-6 border-destructive/40">
                <CardContent className="pt-4 text-sm text-destructive">
                  {error}
                </CardContent>
              </Card>
            )}

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Generate Report</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="report-type">Report Type</Label>
                    <Select
                      value={reportType}
                      onValueChange={(value) =>
                        setReportType(value as ReportType)
                      }
                    >
                      <SelectTrigger id="report-type">
                        <SelectValue placeholder="Select report type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income-statement">
                          Income Statement
                        </SelectItem>
                        <SelectItem value="balance-sheet">
                          Balance Sheet
                        </SelectItem>
                        <SelectItem value="cash-flow">Cash Flow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="period">Period</Label>
                    <Select
                      value={period}
                      onValueChange={(value) => setPeriod(value as PeriodKey)}
                    >
                      <SelectTrigger id="period">
                        <SelectValue placeholder="Select period" />
                      </SelectTrigger>
                      <SelectContent>
                        {periodOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      className="w-full"
                      onClick={handleGenerateReport}
                      disabled={loading}
                    >
                      {loading ? "Memuat..." : "Generate Report"}
                    </Button>
                  </div>
                </div>
                {data && !loading && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Periode: {data.period} - Diperbarui: {""}
                    {new Date(data.generatedAt).toLocaleString("id-ID")}
                  </p>
                )}
              </CardContent>
            </Card>

            <Tabs
              value={reportType}
              onValueChange={(value) => setReportType(value as ReportType)}
            >
              <TabsList className="mb-4 grid w-full grid-cols-3">
                <TabsTrigger value="income-statement">
                  Income Statement
                </TabsTrigger>
                <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
                <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
              </TabsList>

              <TabsContent value="income-statement">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Income Statement</CardTitle>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadPDF}
                        disabled={!data || pdfExporting}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {pdfExporting ? "Mengunduh..." : "PDF"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadExcel}
                        disabled={!data || downloading}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        {downloading ? "Mengunduh..." : "Excel"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loading && !data ? (
                      <div className="space-y-2">
                        <Skeleton className="h-6 w-1/2" />
                        <Skeleton className="h-6 w-2/3" />
                        <Skeleton className="h-6 w-1/3" />
                      </div>
                    ) : data ? (
                      <div className="space-y-4">
                        {incomeStatementSections.map((section) =>
                          renderSection(section)
                        )}
                      </div>
                    ) : (
                      renderNoDataState(
                        "Belum ada data Income Statement untuk periode ini."
                      )
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="balance-sheet">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Balance Sheet</CardTitle>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadPDF}
                        disabled={!data || pdfExporting}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {pdfExporting ? "Mengunduh..." : "PDF"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadExcel}
                        disabled={!data || downloading}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        {downloading ? "Mengunduh..." : "Excel"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loading && !data ? (
                      <Skeleton className="h-32 w-full" />
                    ) : data ? (
                      <div className="space-y-4">
                        {balanceSheetSections.map((section) =>
                          renderSection(section)
                        )}
                      </div>
                    ) : (
                      renderNoDataState(
                        "Belum ada data Balance Sheet untuk periode ini."
                      )
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="cash-flow">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Cash Flow Statement</CardTitle>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadPDF}
                        disabled={!data || pdfExporting}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {pdfExporting ? "Mengunduh..." : "PDF"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadExcel}
                        disabled={!data || downloading}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        {downloading ? "Mengunduh..." : "Excel"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loading && !data ? (
                      <Skeleton className="h-32 w-full" />
                    ) : data ? (
                      <div className="space-y-4">
                        {cashFlowSections.map((section) =>
                          renderSection(section)
                        )}
                      </div>
                    ) : (
                      renderNoDataState(
                        "Belum ada data Cash Flow untuk periode ini."
                      )
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
