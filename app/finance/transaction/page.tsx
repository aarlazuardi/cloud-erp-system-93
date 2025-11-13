"use client";

import type React from "react";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, addYears, subYears, setYear, setMonth } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import type { FinanceEntryType } from "@/lib/transaction-presets";

type TransactionStatus = "posted" | "pending";
type CashFlowKind = "operating" | "investing" | "financing" | "non-cash";
type FinanceType = FinanceEntryType;

type TransactionTemplate = {
  id: string;
  name: string;
  label: string;
  type: FinanceType;
  cashFlowCategory: CashFlowKind;
  defaultDescription?: string;
  source: "database" | "preset";
  presetKey?: string;
};

type TemplatesResponse = {
  data?: TransactionTemplate[];
};

const CUSTOM_TEMPLATE_ID = "custom";

const FINANCE_TYPE_OPTIONS: Array<{ value: FinanceType; label: string }> = [
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
];

export default function TransactionInput() {
  const router = useRouter();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [status, setStatus] = useState<TransactionStatus>("posted");
  const [cashFlowType, setCashFlowType] = useState<CashFlowKind>("operating");
  const [financeType, setFinanceType] = useState<FinanceType>("income");
  const [amount, setAmount] = useState("");
  const [formattedAmount, setFormattedAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Currency formatting utilities
  const formatRupiah = (value: string): string => {
    // Remove all non-digits
    const numbers = value.replace(/\D/g, "");
    if (!numbers) return "";

    // Format with thousand separators
    return new Intl.NumberFormat("id-ID").format(parseInt(numbers));
  };

  const parseRupiah = (value: string): string => {
    return value.replace(/\D/g, "");
  };

  const handleAmountChange = (value: string) => {
    const numericValue = parseRupiah(value);
    setAmount(numericValue);
    setFormattedAmount(formatRupiah(value));
  };

  const categorySuggestions = useMemo(() => {
    const unique = new Set<string>();
    templates.forEach((template) => {
      unique.add(template.name);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  useEffect(() => {
    let active = true;

    const loadTemplates = async () => {
      setTemplatesLoading(true);
      try {
        const response = await fetch("/api/finance/presets", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Gagal memuat template transaksi.");
        }
        const payload = (await response.json()) as TemplatesResponse;
        if (!active) {
          return;
        }
        if (Array.isArray(payload.data)) {
          setTemplates(payload.data);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        console.error("Failed to fetch transaction templates", error);
        toast({
          title: "Tidak dapat memuat template",
          description: "Form masih dapat digunakan dengan input manual.",
          variant: "destructive",
        });
      } finally {
        if (active) {
          setTemplatesLoading(false);
        }
      }
    };

    void loadTemplates();

    return () => {
      active = false;
    };
  }, [toast]);

  const handleTemplateChange = (value: string) => {
    setSelectedTemplateId(value);
    if (value === CUSTOM_TEMPLATE_ID) {
      return;
    }

    const template = templates.find((item) => item.id === value);
    if (!template) {
      return;
    }

    setFinanceType(template.type);
    setCashFlowType(template.cashFlowCategory);
    setCategory(template.name);
    setDescription(template.defaultDescription ?? template.label);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!date) {
      toast({
        title: "Tanggal wajib diisi",
        description: "Silakan pilih tanggal transaksi.",
        variant: "destructive",
      });
      return;
    }

    const numericAmount = Number(amount);
    if (!numericAmount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      toast({
        title: "Nominal tidak valid",
        description: "Masukkan jumlah transaksi lebih dari 0.",
        variant: "destructive",
      });
      return;
    }

    const trimmedCategory = category.trim();
    if (!trimmedCategory) {
      toast({
        title: "Kategori wajib diisi",
        description: "Masukkan kategori yang menggambarkan transaksi.",
        variant: "destructive",
      });
      return;
    }

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      toast({
        title: "Deskripsi wajib diisi",
        description: "Tambahkan catatan singkat untuk transaksi ini.",
        variant: "destructive",
      });
      return;
    }

    const template =
      selectedTemplateId === CUSTOM_TEMPLATE_ID ? null : selectedTemplate;
    const presetKey = template?.presetKey;
    const presetLabel = template?.label;
    const trimmedCounterparty = counterparty.trim();

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/finance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: financeType,
          status,
          cashFlowType,
          amount: numericAmount,
          date: date.toISOString(),
          description: trimmedDescription,
          category: trimmedCategory,
          counterparty: trimmedCounterparty.length
            ? trimmedCounterparty
            : undefined,
          presetLabel,
          presetKey,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Gagal menyimpan transaksi.");
      }

      toast({
        title: "Transaksi tersimpan",
        description: "Data transaksi berhasil disimpan ke database.",
      });
      router.push("/finance");
    } catch (error) {
      toast({
        title: "Gagal menyimpan",
        description:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan tak terduga.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push("/finance");
  };

  const hasDatabaseIncome = templates.some(
    (template) => template.source === "database" && template.type === "income"
  );
  const hasDatabaseExpense = templates.some(
    (template) => template.source === "database" && template.type === "expense"
  );
  const hasPresetIncome = templates.some(
    (template) => template.source === "preset" && template.type === "income"
  );
  const hasPresetExpense = templates.some(
    (template) => template.source === "preset" && template.type === "expense"
  );

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-gray-50">
        <AppSidebar activeMenu="finance" />

        <div className="flex-1 overflow-auto">
          <PageHeader title="Finance - Transaction Input" />

          <main className="p-6">
            <Card className="mx-auto max-w-2xl">
              <CardHeader>
                <CardTitle>New Transaction</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Popover
                      open={isDatePickerOpen}
                      onOpenChange={setIsDatePickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "PPP") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="p-3 border-b">
                          <div className="flex items-center justify-between space-x-2">
                            {/* Year Selector */}
                            <Select
                              value={(date ?? new Date())
                                .getFullYear()
                                .toString()}
                              onValueChange={(year) => {
                                const newDate = setYear(
                                  date ?? new Date(),
                                  parseInt(year)
                                );
                                setDate(newDate);
                              }}
                            >
                              <SelectTrigger className="w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 21 }, (_, i) => {
                                  const year =
                                    new Date().getFullYear() - 10 + i;
                                  return (
                                    <SelectItem
                                      key={year}
                                      value={year.toString()}
                                    >
                                      {year}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>

                            {/* Month Selector */}
                            <Select
                              value={(date ?? new Date()).getMonth().toString()}
                              onValueChange={(month) => {
                                const newDate = setMonth(
                                  date ?? new Date(),
                                  parseInt(month)
                                );
                                setDate(newDate);
                              }}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[
                                  "January",
                                  "February",
                                  "March",
                                  "April",
                                  "May",
                                  "June",
                                  "July",
                                  "August",
                                  "September",
                                  "October",
                                  "November",
                                  "December",
                                ].map((month, index) => (
                                  <SelectItem
                                    key={index}
                                    value={index.toString()}
                                  >
                                    {month}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={(nextDate) => {
                            if (nextDate) {
                              setDate(nextDate);
                              setIsDatePickerOpen(false);
                            }
                          }}
                          initialFocus
                          month={date ?? new Date()}
                          onMonthChange={setDate}
                          className="w-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template">Transaction Template</Label>
                    <Select
                      value={selectedTemplateId || undefined}
                      onValueChange={handleTemplateChange}
                      disabled={templatesLoading}
                    >
                      <SelectTrigger id="template">
                        <SelectValue
                          placeholder={
                            templatesLoading
                              ? "Memuat template..."
                              : "Pilih template (opsional)"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {hasDatabaseIncome && (
                          <SelectGroup>
                            <SelectLabel>Riwayat Pendapatan</SelectLabel>
                            {templates
                              .filter(
                                (item) =>
                                  item.source === "database" &&
                                  item.type === "income"
                              )
                              .map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.label}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        )}
                        {hasDatabaseExpense && (
                          <SelectGroup>
                            <SelectLabel>Riwayat Pengeluaran</SelectLabel>
                            {templates
                              .filter(
                                (item) =>
                                  item.source === "database" &&
                                  item.type === "expense"
                              )
                              .map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.label}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        )}
                        {(hasDatabaseIncome || hasDatabaseExpense) &&
                          (hasPresetIncome || hasPresetExpense) && (
                            <SelectSeparator />
                          )}
                        {hasPresetIncome && (
                          <SelectGroup>
                            <SelectLabel>Template Pendapatan</SelectLabel>
                            {templates
                              .filter(
                                (item) =>
                                  item.source === "preset" &&
                                  item.type === "income"
                              )
                              .map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.label}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        )}
                        {hasPresetExpense && (
                          <SelectGroup>
                            <SelectLabel>Template Pengeluaran</SelectLabel>
                            {templates
                              .filter(
                                (item) =>
                                  item.source === "preset" &&
                                  item.type === "expense"
                              )
                              .map((item) => (
                                <SelectItem key={item.id} value={item.id}>
                                  {item.label}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        )}
                        <SelectSeparator />
                        <SelectItem value={CUSTOM_TEMPLATE_ID}>
                          Gunakan input manual
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Memilih template akan mengisi tipe transaksi, arus kas,
                      dan kategori secara otomatis.
                    </p>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="type">Finance Type</Label>
                      <Select
                        value={financeType}
                        onValueChange={(value) =>
                          setFinanceType(value as FinanceType)
                        }
                      >
                        <SelectTrigger id="type">
                          <SelectValue placeholder="Pilih tipe" />
                        </SelectTrigger>
                        <SelectContent>
                          {FINANCE_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        <strong>Asset:</strong> Untuk kas awal/saldo awal,
                        gunakan kategori yang mengandung kata &quot;kas&quot;
                        atau &quot;awal&quot;. Untuk pembelian aset, pilih cash
                        flow &quot;Operating&quot; (kurangi kas) atau
                        &quot;Investing&quot; (pembelian kredit/tidak kurangi
                        kas).
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={status}
                        onValueChange={(value) =>
                          setStatus(value as TransactionStatus)
                        }
                      >
                        <SelectTrigger id="status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="posted">Posted</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="cashflow">Cash Flow Category</Label>
                      <Select
                        value={cashFlowType}
                        onValueChange={(value) =>
                          setCashFlowType(value as CashFlowKind)
                        }
                      >
                        <SelectTrigger id="cashflow">
                          <SelectValue placeholder="Select cash flow type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="operating">
                            Operating (Cash Purchase/Sale)
                          </SelectItem>
                          <SelectItem value="investing">
                            Investing (Asset Recognition)
                          </SelectItem>
                          <SelectItem value="financing">
                            Financing (Loan/Capital)
                          </SelectItem>
                          <SelectItem value="non-cash">
                            Non-Cash (Depreciation/Accrual)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {financeType === "asset" && (
                          <>
                            <strong>Operating:</strong> Pembelian aset dengan
                            kas (mengurangi cash balance)
                            <br />
                            <strong>Investing:</strong> Pencatatan aset yang
                            sudah ada (tidak mengurangi cash)
                            <br />
                            <strong>Financing:</strong> Aset dibeli dengan
                            pinjaman/kredit
                          </>
                        )}
                        {financeType === "liability" && (
                          <>
                            <strong>Operating:</strong> Hutang operasional
                            <br />
                            <strong>Financing:</strong> Pinjaman jangka panjang
                            (menambah cash balance)
                          </>
                        )}
                        {financeType === "income" &&
                          "Pilih Operating untuk penjualan tunai, Investing/Financing untuk pendapatan non-operasional"}
                        {financeType === "expense" &&
                          "Pilih Operating untuk pengeluaran tunai, Non-Cash untuk accrual"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount (IDR)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm font-medium">
                          Rp
                        </span>
                        <Input
                          id="amount"
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          className="pl-8"
                          value={formattedAmount}
                          onChange={(event) =>
                            handleAmountChange(event.target.value)
                          }
                        />
                      </div>
                      {formattedAmount && (
                        <p className="text-xs text-muted-foreground">
                          Numeric value: {amount}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      placeholder="Contoh: Sales - Produk A"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      list="category-suggestions"
                    />
                    <datalist id="category-suggestions">
                      {categorySuggestions.map((suggestion) => (
                        <option key={suggestion} value={suggestion} />
                      ))}
                    </datalist>
                    <p className="text-xs text-muted-foreground">
                      Kategori digunakan untuk laporan laba rugi dan arus kas.
                      Anda dapat mengetik kategori baru.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      placeholder="Enter transaction note"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="counterparty">
                      Counterparty (optional)
                    </Label>
                    <Input
                      id="counterparty"
                      placeholder="Contoh: PT Nusantara Makmur"
                      value={counterparty}
                      onChange={(event) => setCounterparty(event.target.value)}
                    />
                  </div>

                  <div className="flex gap-4">
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Saving..." : "Submit"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={handleCancel}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
