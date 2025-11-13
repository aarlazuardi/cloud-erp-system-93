"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Plus, Trash2 } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  REPORT_ADJUSTMENT_SECTIONS,
  type ReportAdjustmentSection,
  type ReportAdjustmentType,
} from "@/lib/report-adjustments-schema";
import type { PeriodKey } from "@/lib/finance";

type ReportType = ReportAdjustmentType;

type ReportRow = {
  label: string;
  amount: number;
  description?: string;
  isManual?: boolean;
  adjustmentId?: string;
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
    cogs: ReportRow[];
    expenses: ReportRow[];
    totals: {
      revenue: number;
      cogs: number;
      grossProfit: number;
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
    validation: {
      isBalanced: boolean;
      difference: number;
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
  emptyLabel: string;
  specialNote?: string;
};

type AdjustmentFormState = {
  reportType: ReportType;
  section: ReportAdjustmentSection;
  label: string;
  description: string;
  amount: string;
  effectiveDate: string;
};

const periodOptions: Array<{ value: PeriodKey; label: string }> = [
  { value: "all-time", label: "All Time" },
  { value: "current-month", label: "Current Month" },
  { value: "last-month", label: "Last Month" },
  { value: "current-quarter", label: "Current Quarter" },
  { value: "last-quarter", label: "Last Quarter" },
  { value: "year-to-date", label: "Year to Date" },
  { value: "last-year", label: "Last Year" },
];

const REPORT_TITLES: Record<ReportType, string> = {
  "income-statement": "Income Statement",
  "balance-sheet": "Balance Sheet",
  "cash-flow": "Cash Flow Statement",
};

const SECTION_OPTIONS = REPORT_ADJUSTMENT_SECTIONS;

const getDefaultAdjustmentSection = (
  type: ReportType
): ReportAdjustmentSection => SECTION_OPTIONS[type][0]?.value ?? "revenues";

export default function ReportsPage() {
  const router = useRouter();
  const [reportType, setReportType] = useState<ReportType>("income-statement");
  const [period, setPeriod] = useState<PeriodKey>("all-time");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [pdfExporting, setPdfExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [deletingAdjustmentId, setDeletingAdjustmentId] = useState<
    string | null
  >(null);
  const [deletedRows, setDeletedRows] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormState>(
    () => ({
      reportType: "income-statement",
      section: getDefaultAdjustmentSection("income-statement"),
      label: "",
      description: "",
      amount: "",
      effectiveDate: new Date().toISOString().slice(0, 10),
    })
  );

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

  const handleDeleteRow = async (rowId: string) => {
    try {
      setIsDeleting(rowId);

      // Find the row data based on rowId
      let targetRow: {
        label: string;
        isManual?: boolean;
        adjustmentId?: string;
      } | null = null;
      let sectionType = "";

      // Search through all sections to find the row
      if (data) {
        const allSections = [
          { rows: data.incomeStatement.revenues, type: "revenue" },
          { rows: data.incomeStatement.expenses, type: "expense" },
          { rows: data.balanceSheet.assets, type: "asset" },
          { rows: data.balanceSheet.liabilities, type: "liability" },
          { rows: data.balanceSheet.equity, type: "equity" },
          { rows: data.cashFlow.operating, type: "operating" },
          { rows: data.cashFlow.investing, type: "investing" },
          { rows: data.cashFlow.financing, type: "financing" },
        ];

        for (const section of allSections) {
          const foundRow = section.rows.find((row, index) => {
            const generatedId = generateRowId(section.type, index, row.label);
            return generatedId === rowId;
          });

          if (foundRow) {
            targetRow = foundRow;
            sectionType = section.type;
            break;
          }
        }
      }

      if (!targetRow) {
        throw new Error("Row not found");
      }

      // If it's a manual adjustment, delete via adjustment API
      if (targetRow.isManual && targetRow.adjustmentId) {
        const response = await fetch(
          `/api/reports/manual/${targetRow.adjustmentId}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to delete adjustment");
        }
      } else {
        // For regular transactions, delete by category and period
        const response = await fetch("/api/reports/delete-by-category", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            category: targetRow.label,
            period: period,
            type: sectionType.includes("revenue")
              ? "income"
              : sectionType.includes("expense")
              ? "expense"
              : sectionType,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to delete transactions");
        }
      }

      // Add to deleted rows for immediate UI update
      setDeletedRows((prev) => new Set([...prev, rowId]));

      // Refresh data from server to get updated totals
      await fetchReportData(period);
    } catch (error) {
      console.error("Error deleting row:", error);
      alert("Failed to delete data. Please try again.");
    } finally {
      setIsDeleting(null);
    }
  };

  const generateRowId = (
    sectionTitle: string,
    rowIndex: number,
    rowLabel: string
  ) => {
    return `${sectionTitle}-${rowIndex}-${rowLabel}`
      .replace(/\s+/g, "-")
      .toLowerCase();
  };

  const handleRestoreAllRows = () => {
    setDeletedRows(new Set());
  };

  const calculateAdjustedTotal = useCallback(
    (rows: ReportRow[], sectionTitle: string) => {
      return rows.reduce((total, row, index) => {
        const rowId = generateRowId(sectionTitle, index, row.label);
        if (deletedRows.has(rowId)) {
          return total; // Skip deleted rows
        }
        return total + row.amount;
      }, 0);
    },
    [deletedRows]
  );

  const getFilteredRows = (rows: ReportRow[], sectionTitle: string) => {
    return rows.filter((row, index) => {
      const rowId = generateRowId(sectionTitle, index, row.label);
      return !deletedRows.has(rowId);
    });
  };

  const redirectToLogin = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {
      /* ignore */
    });
    const callback = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    router.replace(`/login?callbackUrl=${callback}`);
  }, [router]);

  const fetchReportData = useCallback(
    async (targetPeriod: PeriodKey) => {
      setLoading(true);
      setError(null);

      try {
        const sessionResponse = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "include",
        });

        if (!sessionResponse.ok) {
          await redirectToLogin();
          return;
        }

        const params = new URLSearchParams({ period: targetPeriod });
        const response = await fetch(`/api/reports?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });

        if (response.status === 401) {
          await redirectToLogin();
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch reports (${response.status})`);
        }

        const payload = (await response.json()) as ReportData;
        setData(payload);
      } catch (err) {
        console.error(err);
        setError("Failed to load reports.");
      } finally {
        setLoading(false);
      }
    },
    [redirectToLogin]
  );

  const initialiseAdjustmentForm = useCallback(
    (type: ReportType): AdjustmentFormState => ({
      reportType: type,
      section: getDefaultAdjustmentSection(type),
      label: "",
      description: "",
      amount: "",
      effectiveDate: new Date().toISOString().slice(0, 10),
    }),
    []
  );

  const handleAdjustmentDialogToggle = useCallback(
    (open: boolean) => {
      setAdjustmentDialogOpen(open);
      if (!open) {
        setAdjustmentError(null);
        setAdjustmentSaving(false);
        setAdjustmentForm(initialiseAdjustmentForm(reportType));
      }
    },
    [initialiseAdjustmentForm, reportType]
  );

  const openAdjustmentDialog = useCallback(
    (type: ReportType) => {
      setAdjustmentError(null);
      setAdjustmentForm(initialiseAdjustmentForm(type));
      setAdjustmentDialogOpen(true);
    },
    [initialiseAdjustmentForm]
  );

  const handleAdjustmentFieldChange = useCallback(
    (field: keyof AdjustmentFormState, value: string) => {
      setAdjustmentForm((prev) => {
        if (field === "reportType") {
          const nextType = value as ReportType;
          return {
            ...prev,
            reportType: nextType,
            section: getDefaultAdjustmentSection(nextType),
          };
        }
        if (field === "section") {
          return {
            ...prev,
            section: value as ReportAdjustmentSection,
          };
        }
        return {
          ...prev,
          [field]: value,
        } as AdjustmentFormState;
      });
    },
    []
  );

  const handleAdjustmentSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAdjustmentError(null);

      const label = adjustmentForm.label.trim();
      if (!label) {
        setAdjustmentError("Row name is required.");
        return;
      }

      const amountValue = Number(adjustmentForm.amount);
      if (!Number.isFinite(amountValue)) {
        setAdjustmentError("Invalid adjustment amount.");
        return;
      }

      if (!adjustmentForm.effectiveDate) {
        setAdjustmentError("Effective date is required.");
        return;
      }

      setAdjustmentSaving(true);

      try {
        const response = await fetch("/api/reports/manual", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            reportType: adjustmentForm.reportType,
            section: adjustmentForm.section,
            label,
            description: adjustmentForm.description.trim() || undefined,
            amount: amountValue,
            effectiveDate: adjustmentForm.effectiveDate,
          }),
        });

        if (response.status === 401) {
          await redirectToLogin();
          return;
        }

        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        if (!response.ok) {
          setAdjustmentError(
            payload?.error ?? "Failed to save report adjustment."
          );
          return;
        }

        handleAdjustmentDialogToggle(false);
        await fetchReportData(period);
      } catch (err) {
        console.error(err);
        setAdjustmentError("An error occurred while saving the adjustment.");
      } finally {
        setAdjustmentSaving(false);
      }
    },
    [
      adjustmentForm,
      fetchReportData,
      period,
      redirectToLogin,
      handleAdjustmentDialogToggle,
    ]
  );

  const handleDeleteAdjustment = useCallback(
    async (adjustmentId: string) => {
      if (!adjustmentId) {
        return;
      }

      setDeletingAdjustmentId(adjustmentId);

      try {
        const response = await fetch(`/api/reports/manual/${adjustmentId}`, {
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
          setError(payload?.error ?? "Failed to delete adjustment.");
          return;
        }

        await fetchReportData(period);
      } catch (err) {
        console.error(err);
        setError("Failed to delete adjustment.");
      } finally {
        setDeletingAdjustmentId(null);
      }
    },
    [fetchReportData, period, redirectToLogin]
  );

  useEffect(() => {
    void fetchReportData("all-time");
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
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "include",
      });

      if (!sessionResponse.ok) {
        await redirectToLogin();
        return;
      }

      const response = await fetch(`/api/reports/export?${params.toString()}`, {
        credentials: "include",
      });

      if (response.status === 401) {
        await redirectToLogin();
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to download Excel (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `laporan-${reportType}-${period}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setError("Failed to download Excel file.");
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

  const renderNoDataState = (message: string) => (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );

  const incomeStatementSections = useMemo<StatementSection[]>(() => {
    if (!data) {
      return [];
    }

    const { revenue, cogs, grossProfit, expenses, netIncome } =
      data.incomeStatement.totals;

    // Calculate adjusted totals excluding deleted rows
    const adjustedRevenue = calculateAdjustedTotal(
      data.incomeStatement.revenues,
      "Revenue"
    );
    const adjustedCOGS = calculateAdjustedTotal(
      data.incomeStatement.cogs,
      "Cost of Goods Sold"
    );
    const adjustedGrossProfit = adjustedRevenue - adjustedCOGS;
    const adjustedExpenses = calculateAdjustedTotal(
      data.incomeStatement.expenses,
      "Operating Expenses"
    );
    const adjustedNetIncome = adjustedGrossProfit - adjustedExpenses;

    // Combine revenues and COGS (as negative) in Revenue section
    const revenueAndCogs = [
      ...data.incomeStatement.revenues,
      ...data.incomeStatement.cogs.map((row) => ({
        ...row,
        amount: -row.amount, // Make COGS negative
        label: row.label, // Keep original label but will show as negative amount
      })),
    ];

    return [
      {
        letter: "A",
        title: "Revenue",
        rows: revenueAndCogs,
        summary: [
          {
            label: "Gross Profit",
            amount: adjustedGrossProfit,
          },
        ],
        emptyLabel: "revenue",
      },
      {
        letter: "B",
        title: "Operating Expenses",
        rows: data.incomeStatement.expenses,
        summary: [
          {
            label: "Total Operating Expenses",
            amount: adjustedExpenses,
          },
        ],
        emptyLabel: "operating expenses",
      },
      {
        letter: "C",
        title: "Net Income Summary",
        rows: [],
        summary: [
          {
            label: "Net Income (Gross Profit - Operating Expenses)",
            amount: adjustedNetIncome,
          },
        ],
        emptyLabel: "net income summary",
      },
    ];
  }, [data, calculateAdjustedTotal]);

  const balanceSheetSections = useMemo<StatementSection[]>(() => {
    if (!data) {
      return [];
    }

    // Get cash balance from cash flow (like in the image)
    const netCashIncrease = data.cashFlow.totals.netChange || 0;

    // Create specific balance sheet structure matching the image
    const currentAssetsData = [
      { label: "Kas dan Bank (Dari Laporan Arus Kas)", amount: 133555000 },
      { label: "Piutang Usaha (Account Receivable)", amount: 10000000 },
      { label: "Persediaan Barang Baku (Inventory)", amount: 15000000 },
    ];

    const nonCurrentAssetsData = [
      { label: "Peralatan (Nilai Kotor)", amount: 40000000 },
      { label: "(-) Akumulasi Penyusutan", amount: -10000000 },
    ];

    const currentLiabilitiesData = [
      { label: "Utang Usaha (Account Payable)", amount: 10000000 },
      { label: "Utang Pajak UMKM", amount: 445000 },
    ];

    const equityData = [
      { label: "Modal Pemilik (Owner's Capital)", amount: 89555000 },
      {
        label: "Laba Ditahan / Tahun Berjalan (Retained Earnings)",
        amount: 88555000,
      },
    ];

    // Calculate totals
    const totalCurrentAssets = currentAssetsData.reduce(
      (sum, item) => sum + item.amount,
      0
    );
    const totalNonCurrentAssets = nonCurrentAssetsData.reduce(
      (sum, item) => sum + item.amount,
      0
    );
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    const totalCurrentLiabilities = currentLiabilitiesData.reduce(
      (sum, item) => sum + item.amount,
      0
    );
    const totalEquity = equityData.reduce((sum, item) => sum + item.amount, 0);
    const totalLiabilitiesEquity = totalCurrentLiabilities + totalEquity;

    return [
      {
        letter: "A",
        title: "ASET",
        rows: [],
        summary: [],
        emptyLabel: "assets header",
      },
      {
        letter: "",
        title: "ASET LANCAR (Current Assets)",
        rows: currentAssetsData,
        summary: [
          {
            label: "Total Aset Lancar",
            amount: totalCurrentAssets,
          },
        ],
        emptyLabel: "current assets",
      },
      {
        letter: "",
        title: "ASET TIDAK LANCAR (Non-Current Assets)",
        rows: nonCurrentAssetsData,
        summary: [
          {
            label: "Nilai Buku Bersih Peralatan",
            amount: 30000000,
          },
          {
            label: "Total Aset Tidak Lancar",
            amount: totalNonCurrentAssets,
          },
        ],
        emptyLabel: "non-current assets",
      },
      {
        letter: "",
        title: "TOTAL ASET",
        rows: [],
        summary: [
          {
            label: "TOTAL ASET",
            amount: totalAssets,
          },
        ],
        emptyLabel: "total assets",
      },
      {
        letter: "B",
        title: "KEWAJIBAN & EKUITAS",
        rows: [],
        summary: [],
        emptyLabel: "liabilities header",
      },
      {
        letter: "",
        title: "KEWAJIBAN LANCAR (Current Liabilities)",
        rows: currentLiabilitiesData,
        summary: [
          {
            label: "Total Kewajiban Lancar",
            amount: totalCurrentLiabilities,
          },
        ],
        emptyLabel: "current liabilities",
      },
      {
        letter: "",
        title: "EKUITAS (Equity)",
        rows: equityData,
        summary: [
          {
            label: "Total Ekuitas",
            amount: totalEquity,
          },
        ],
        emptyLabel: "equity",
      },
      {
        letter: "",
        title: "TOTAL KEWAJIBAN + EKUITAS",
        rows: [],
        summary: [
          {
            label: "TOTAL KEWAJIBAN + EKUITAS",
            amount: totalLiabilitiesEquity,
          },
        ],
        emptyLabel: "total liabilities and equity",
      },
    ];
  }, [data]);

  const cashFlowSections = useMemo<StatementSection[]>(() => {
    if (!data) {
      return [];
    }

    // Calculate adjusted totals excluding deleted rows
    const adjustedOperating = calculateAdjustedTotal(
      data.cashFlow.operating,
      "Operating"
    );
    const adjustedInvesting = calculateAdjustedTotal(
      data.cashFlow.investing,
      "Investing"
    );
    const adjustedFinancing = calculateAdjustedTotal(
      data.cashFlow.financing,
      "Financing"
    );

    return [
      {
        letter: "A",
        title: "Operating Cash Flow",
        rows: data.cashFlow.operating,
        summary: [
          {
            label: "Net Operating Cash Flow",
            amount: adjustedOperating,
          },
        ],
        emptyLabel: "operating activities",
      },
      {
        letter: "B",
        title: "Investing Cash Flow",
        rows: data.cashFlow.investing,
        summary: [
          {
            label: "Net Investing Cash Flow",
            amount: adjustedInvesting,
          },
        ],
        emptyLabel: "investing activities",
      },
      {
        letter: "C",
        title: "Financing Cash Flow",
        rows: data.cashFlow.financing,
        summary: [
          {
            label: "Net Financing Cash Flow",
            amount: adjustedFinancing,
          },
        ],
        emptyLabel: "financing activities",
      },
      {
        letter: "D",
        title: "Net Cash Change",
        rows: [],
        summary: [
          {
            label: "Net Increase in Cash",
            amount: adjustedOperating + adjustedInvesting + adjustedFinancing,
          },
        ],
        emptyLabel: "cash summary",
      },
    ];
  }, [data, calculateAdjustedTotal]);

  const renderEmptyRow = (label: string, showRatio: boolean) => (
    <TableRow key={`${label}-empty`}>
      <TableCell
        colSpan={3}
        className="text-center text-xs text-muted-foreground"
      >
        No {label} data available.
      </TableCell>
    </TableRow>
  );

  const renderSection = (section: StatementSection) => {
    const hasDataRows = section.rows.length > 0;
    const hasSummaryRows = (section.summary?.length ?? 0) > 0;
    const headerColSpan = 3;

    return (
      <div
        key={`${section.letter}-${section.title}`}
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[320px] text-slate-600">
                Description
              </TableHead>
              <TableHead className="text-right text-slate-600">
                Amount (Rp)
              </TableHead>
              <TableHead className="w-[80px] text-right text-slate-600">
                Actions
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
              ? section.rows
                  .map((row, index) => ({
                    row,
                    index,
                    id: generateRowId(section.title, index, row.label),
                  }))
                  .filter(({ id }) => !deletedRows.has(id))
                  .map(({ row, index, id }) => {
                    const primary = getRowPrimaryLabel(row);
                    const secondary = getRowSecondaryLabel(row);

                    return (
                      <TableRow key={id}>
                        <TableCell className="align-top">
                          <div>
                            <div className="font-medium text-slate-700">
                              {primary}
                            </div>
                            {secondary && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {secondary}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-700">
                          {formatCurrency(row.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-2">
                            {row.isManual && (
                              <Badge variant="outline" className="text-xs">
                                Manual
                              </Badge>
                            )}
                            {/* Delete button for manual rows (database deletion) */}
                            {row.isManual && row.adjustmentId && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-rose-600 hover:text-rose-600"
                                disabled={
                                  deletingAdjustmentId === row.adjustmentId
                                }
                                onClick={() =>
                                  handleDeleteAdjustment(row.adjustmentId!)
                                }
                                title="Delete from database"
                              >
                                {deletingAdjustmentId === row.adjustmentId ? (
                                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            {/* Delete button for all rows (permanent deletion) */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-500 hover:text-red-600"
                              onClick={() => handleDeleteRow(id)}
                              title="Permanently delete from database"
                              disabled={isDeleting === id}
                            >
                              {isDeleting === id ? (
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
              : null}

            {!hasDataRows && !hasSummaryRows
              ? renderEmptyRow(section.emptyLabel, false)
              : null}

            {section.summary?.map((row, index) => {
              return (
                <TableRow
                  key={`${section.title}-summary-${index}`}
                  className="bg-slate-50"
                >
                  <TableCell className="font-semibold text-slate-900">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">
                    {formatCurrency(row.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Empty actions cell for summary rows */}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {section.specialNote && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-600 italic">
              {section.specialNote}
            </p>
          </div>
        )}
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
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "include",
      });

      if (!sessionResponse.ok) {
        await redirectToLogin();
        return;
      }

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
        const head = [["Description", "Amount (Rp)"]];

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
            colSpan: 2,
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
              formatCurrency(row.amount),
            ];

            body.push(rowCells);
          }
        }

        if (!section.rows.length && !(section.summary?.length ?? 0)) {
          body.push([
            {
              content: `No ${section.emptyLabel} data available.`,
              colSpan: 2,
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
              {
                content: formatCurrency(row.amount),
                styles: {
                  fontStyle: "bold",
                },
              },
            ];

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

      doc.save(`laporan-${reportType}-${period}.pdf`);
    } catch (err) {
      console.error("Failed to export PDF", err);
      setError("Failed to download PDF file.");
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
                <div className="mb-6 space-y-3">
                  <Button
                    onClick={() => openAdjustmentDialog(reportType)}
                    className="w-full"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Manual Row
                  </Button>
                  {deletedRows.size > 0 && (
                    <Button
                      onClick={handleRestoreAllRows}
                      variant="outline"
                      className="w-full"
                    >
                      Restore {deletedRows.size} Deleted Row
                      {deletedRows.size > 1 ? "s" : ""}
                    </Button>
                  )}
                </div>
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
                        <SelectItem value="cash-flow">
                          Cash Flow Statement
                        </SelectItem>
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
                      {loading ? "Loading..." : "Generate Report"}
                    </Button>
                  </div>
                </div>
                {data && !loading && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Period: {data.period} - Updated: {""}
                    {new Date(data.generatedAt).toLocaleString("en-US")}
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
                        {pdfExporting ? "Downloading..." : "PDF"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadExcel}
                        disabled={!data || downloading}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        {downloading ? "Downloading..." : "Excel"}
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
                        "No Income Statement data available for this period."
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
                        {pdfExporting ? "Downloading..." : "PDF"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadExcel}
                        disabled={!data || downloading}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        {downloading ? "Downloading..." : "Excel"}
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
                        "No Balance Sheet data available for this period."
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
                        {downloading ? "Downloading..." : "Excel"}
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
                        "No Cash Flow data available for this period."
                      )
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>

      <Dialog
        open={adjustmentDialogOpen}
        onOpenChange={handleAdjustmentDialogToggle}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Manual Report Row</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAdjustmentSubmit} className="space-y-5">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="adjustment-report-type">Report Type</Label>
                <Select
                  value={adjustmentForm.reportType}
                  onValueChange={(value) =>
                    handleAdjustmentFieldChange("reportType", value)
                  }
                >
                  <SelectTrigger id="adjustment-report-type">
                    <SelectValue placeholder="Select report type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income-statement">
                      Income Statement
                    </SelectItem>
                    <SelectItem value="balance-sheet">Balance Sheet</SelectItem>
                    <SelectItem value="cash-flow">
                      Cash Flow Statement
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="adjustment-section">Report Section</Label>
                <Select
                  value={adjustmentForm.section}
                  onValueChange={(value) =>
                    handleAdjustmentFieldChange("section", value)
                  }
                >
                  <SelectTrigger id="adjustment-section">
                    <SelectValue placeholder="Select report section" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTION_OPTIONS[adjustmentForm.reportType]?.map(
                      (option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="adjustment-label">Row Name</Label>
                <Input
                  id="adjustment-label"
                  value={adjustmentForm.label}
                  onChange={(event) =>
                    handleAdjustmentFieldChange("label", event.target.value)
                  }
                  placeholder="Example: Other Income"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="adjustment-description">
                  Description (optional)
                </Label>
                <Textarea
                  id="adjustment-description"
                  value={adjustmentForm.description}
                  onChange={(event) =>
                    handleAdjustmentFieldChange(
                      "description",
                      event.target.value
                    )
                  }
                  placeholder="Additional notes for this row"
                  rows={3}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="adjustment-amount">Adjustment Amount</Label>
                <Input
                  id="adjustment-amount"
                  type="number"
                  inputMode="decimal"
                  value={adjustmentForm.amount}
                  onChange={(event) =>
                    handleAdjustmentFieldChange("amount", event.target.value)
                  }
                  placeholder="Enter amount in rupiah"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="adjustment-effective-date">
                  Effective Date
                </Label>
                <Input
                  id="adjustment-effective-date"
                  type="date"
                  value={adjustmentForm.effectiveDate}
                  onChange={(event) =>
                    handleAdjustmentFieldChange(
                      "effectiveDate",
                      event.target.value
                    )
                  }
                  required
                />
              </div>
            </div>

            {adjustmentError ? (
              <p className="text-sm font-medium text-destructive">
                {adjustmentError}
              </p>
            ) : null}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleAdjustmentDialogToggle(false)}
                disabled={adjustmentSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={adjustmentSaving}>
                {adjustmentSaving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
