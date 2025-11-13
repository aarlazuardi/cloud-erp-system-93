# 🚀 Vercel Deployment Setup

## Environment Variables Configuration

### Step 1: Add Environment Variables in Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: `cloud-erp-system-93`
3. Click **Settings** → **Environment Variables**
4. Add the following variables:

#### Required Environment Variables:

```
Key: MONGODB_URI
Value: mongodb+srv://alazuardi7_db_user:O3tUd9zLXbMB5unA@cluster0.xset63p.mongodb.net/cloud-erp?retryWrites=true&w=majority&appName=Cluster0&serverSelectionTimeoutMS=5000&connectTimeoutMS=10000&family=4
Environment: Production, Preview, Development

Key: MONGODB_DB
Value: cloud-erp  
Environment: Production, Preview, Development

Key: DEFAULT_ADMIN_USERNAME
Value: admin
Environment: Production, Preview, Development

Key: DEFAULT_ADMIN_PASSWORD
Value: admin123
Environment: Production, Preview, Development

Key: DEFAULT_ADMIN_ROLE
Value: admin
Environment: Production, Preview, Development
```

### Step 2: Redeploy

After adding environment variables:
1. Go to **Deployments** tab
2. Click **Redeploy** on the latest deployment
3. Or wait for automatic deployment from GitHub push

### Step 3: Access Application

- **Production URL**: `https://cloud-erp-system-93.vercel.app`
- **Login Credentials**:
  - Username: `admin`
  - Password: `admin123`

## Features Included

✅ Complete ERP Financial Reporting System
✅ Income Statement with COGS structure  
✅ Balance Sheet with Current/Non-Current classification
✅ Cash Flow Statement with proper categories
✅ Indonesian Rupiah currency formatting
✅ Enhanced calendar with year/month navigation
✅ Permanent delete system with total recalculation
✅ All-time period filtering
✅ 100+ ERP transaction types support

## Troubleshooting

If deployment fails:
1. Check that all environment variables are properly set
2. Ensure MongoDB connection string is correct
3. Verify that the database name matches `MONGODB_DB` value
4. Check build logs in Vercel dashboard for specific errors