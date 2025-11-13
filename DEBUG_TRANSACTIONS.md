# Debug Transaction Issues

## Untuk debugging masalah cash flow:

1. **Buka Developer Tools** di browser (F12)
2. **Pergi ke Network tab**
3. **Refresh halaman Reports**
4. **Lihat request ke `/api/reports`**
5. **Check response data** untuk melihat transaksi yang sebenarnya tersimpan

## Atau bisa check di MongoDB:

Jika punya akses MongoDB, bisa run query:

```javascript
db.finance_entries.find({}).sort({ createdAt: -1 });
```

## Yang perlu dicek:

1. **Apakah transaksi Equity sudah tersimpan** dengan:

   - type: "equity"
   - cashFlowType: "financing"
   - amount: 50000000
   - description: "Setoran Modal Pemilik"

2. **Apakah transaksi masuk dalam filter financing**

3. **Apakah ada error di console browser**

## Solusi sementara:

Coba input ulang transaksi "Setoran Modal Pemilik" dan pastikan:

- Finance Type: **Equity**
- Cash Flow Category: **Financing**
- Category: Owner's Capital
- Description: Setoran Modal Pemilik
- Amount: 50,000,000
- Date: 2024-01-02
- Status: **Posted**
