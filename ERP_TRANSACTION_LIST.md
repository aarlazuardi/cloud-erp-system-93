# 🧾 ERP Transaction Input Guide

## Cara Input Data:

1. Buka http://localhost:3000
2. Login ke sistem
3. Pergi ke Finance → New Transaction
4. Input data satu per satu sesuai tabel di bawah

## Daftar 16 Transaksi ERP:

### 1. Saldo Awal Kas

- **Finance Type**: Asset
- **Cash Flow Category**: Non-Cash
- **Category**: Opening Balance
- **Description**: Saldo Awal Kas
- **Amount**: 10,000,000
- **Date**: 2025-11-01

### 2. Setoran Modal Pemilik

- **Finance Type**: Equity
- **Cash Flow Category**: Financing
- **Category**: Owner's Capital
- **Description**: Setoran Modal Pemilik
- **Amount**: 50,000,000
- **Date**: 2025-11-02

### 3. Penjualan Kopi & Makanan

- **Finance Type**: Income
- **Cash Flow Category**: Operating
- **Category**: Sales Revenue
- **Description**: Penjualan Kopi & Makanan
- **Amount**: 360,000,000
- **Date**: 2024-12-31

### 4. Harga Pokok Penjualan (HPP)

- **Finance Type**: Expense
- **Cash Flow Category**: Operating
- **Category**: Cost of Goods Sold
- **Description**: Harga Pokok Penjualan (HPP)
- **Amount**: 126,000,000
- **Date**: 2024-12-31

### 5. Gaji Karyawan

- **Finance Type**: Expense
- **Cash Flow Category**: Operating
- **Category**: Payroll Expense
- **Description**: Gaji Karyawan
- **Amount**: 60,000,000
- **Date**: 2024-12-31

### 6. Sewa Tempat

- **Finance Type**: Expense
- **Cash Flow Category**: Operating
- **Category**: Rent Expense
- **Description**: Sewa Tempat
- **Amount**: 36,000,000
- **Date**: 2024-12-31

### 7. Utilitas (Listrik, Air, Internet)

- **Finance Type**: Expense
- **Cash Flow Category**: Operating
- **Category**: Utilities Expense
- **Description**: Utilitas (Listrik, Air, Internet)
- **Amount**: 12,000,000
- **Date**: 2024-12-31

### 8. Pemasaran

- **Finance Type**: Expense
- **Cash Flow Category**: Operating
- **Category**: Marketing Expense
- **Description**: Pemasaran
- **Amount**: 15,000,000
- **Date**: 2024-12-31

### 9. Administrasi & Umum

- **Finance Type**: Expense
- **Cash Flow Category**: Operating
- **Category**: Administrative Expense
- **Description**: Administrasi & Umum
- **Amount**: 22,000,000
- **Date**: 2024-12-31

### 10. Pembelian Peralatan Baru

- **Finance Type**: Asset
- **Cash Flow Category**: Investing
- **Category**: Equipment Purchase
- **Description**: Pembelian Peralatan Baru
- **Amount**: 15,000,000
- **Date**: 2024-06-15

### 11. Penyusutan Peralatan

- **Finance Type**: Expense
- **Cash Flow Category**: Non-Cash
- **Category**: Depreciation Expense
- **Description**: Penyusutan Peralatan
- **Amount**: 10,000,000
- **Date**: 2024-12-31

### 12. Pembayaran Pajak UMKM

- **Finance Type**: Expense
- **Cash Flow Category**: Operating
- **Category**: Tax Expense
- **Description**: Pembayaran Pajak UMKM
- **Amount**: 445,000
- **Date**: 2024-12-31

### 13. Utang Usaha

- **Finance Type**: Liability
- **Cash Flow Category**: Non-Cash
- **Category**: Account Payable
- **Description**: Utang Usaha
- **Amount**: 10,000,000
- **Date**: 2024-12-31

### 14. Piutang Usaha

- **Finance Type**: Asset
- **Cash Flow Category**: Non-Cash
- **Category**: Account Receivable
- **Description**: Piutang Usaha
- **Amount**: 10,000,000
- **Date**: 2024-12-31

### 15. Persediaan Akhir

- **Finance Type**: Asset
- **Cash Flow Category**: Non-Cash
- **Category**: Inventory
- **Description**: Persediaan Akhir
- **Amount**: 15,000,000
- **Date**: 2024-12-31

### 16. Akumulasi Penyusutan

- **Finance Type**: Liability
- **Cash Flow Category**: Non-Cash
- **Category**: Accumulated Depreciation
- **Description**: Akumulasi Penyusutan
- **Amount**: 10,000,000
- **Date**: 2024-12-31

## Catatan Penting:

- Untuk **Contra-Asset** (Akumulasi Penyusutan), saya ubah menjadi **Liability** karena sistem belum support Contra-Asset
- Semua transaksi menggunakan status "Posted"
- Tanggal disesuaikan dengan konteks bisnis (awal tahun untuk modal, akhir tahun untuk laporan)
