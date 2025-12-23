# Regional Director Data Persistence Issue & Solution

## Problem

**Render Free Tier has ephemeral file system** - any data written to JSON files (regional_directors.json, ambassador_sales.json, referral_codes.json) is **LOST when the server restarts** or redeploys.

### What This Means

- ✅ **First login works**: Data saved successfully
- ❌ **After server restart**: Data is gone, login fails with "Regional Director code not found"
- ❌ **New RD activations**: Lost after restart

### Root Cause

Render's free tier doesn't provide:
- Persistent disk storage (requires paid plan)
- Database (unless you add PostgreSQL separately)
- Git write access (deploy process is read-only)

---

## Immediate Workaround

### For Ayinwi Promise Imbih (RD-AYIN-5087)

The file `regional_directors.json` has been committed to Git with his data, so it will persist across deployments. **He can log in now.**

### For New RDs

After admin approves a new RD payment, the data is **temporarily stored** but will be lost on restart. 

**Manual Backup Required:**
1. After approving RD payment, immediately download the updated files
2. Commit them to Git
3. Push to GitHub to persist the data

---

## Solution 1: Manual Backup Script (Immediate)

Create an admin endpoint to download current data:

```ruby
# Add to server.rb
get '/admin/backup-data' do
  content_type 'application/json'
  
  # Validate admin session
  validate_admin_session
  
  {
    regional_directors: read_regional_directors,
    ambassador_sales: read_ambassador_sales,
    referral_codes: read_referral_codes,
    timestamp: Time.now.iso8601
  }.to_json
end
```

**Admin Workflow:**
1. Approve RD payment in admin panel
2. Visit: `https://marriage-education-website.onrender.com/admin/backup-data`
3. Copy the JSON response
4. Update local `regional_directors.json` file
5. Commit and push to Git
6. Render auto-deploys with updated data

---

## Solution 2: Use Supabase (FREE Database) - RECOMMENDED

**Supabase** provides free PostgreSQL database that persists data.

### Setup Steps:

1. **Create Supabase Account**
   - Go to https://supabase.com
   - Create free account
   - Create new project

2. **Create Tables**
```sql
CREATE TABLE regional_directors (
  code VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  phone VARCHAR,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ambassador_sales (
  code VARCHAR PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE referral_codes (
  code VARCHAR PRIMARY KEY,
  email VARCHAR NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

3. **Add to Gemfile**
```ruby
gem 'pg'  # PostgreSQL adapter
```

4. **Add to render.yaml**
```yaml
envVars:
  - key: SUPABASE_URL
    sync: false
  - key: SUPABASE_KEY
    sync: false
```

5. **Update server.rb**
Replace file-based functions with database queries.

---

## Solution 3: Use Railway (Alternative to Render)

**Railway** free tier includes:
- PostgreSQL database
- Persistent volumes
- Better for data-heavy apps

### Migration:
1. Create Railway account
2. Deploy from GitHub
3. Add PostgreSQL service
4. Update connection strings

---

## Solution 4: Render Paid Plan ($7/month)

**Render Starter Plan** includes:
- Persistent disk storage (10GB)
- No auto-sleep
- Better performance

### Setup:
```yaml
# render.yaml
services:
  - type: web
    plan: starter  # Instead of free
    disk:
      name: marriage-education-data
      mountPath: /opt/render/project/src/data
      sizeGB: 10
```

Update file paths in server.rb to use `/opt/render/project/src/data/`.

---

## Current Status & Next Steps

### ✅ Completed
- Created `regional_directors.json` with Ayinwi's data
- Committed to Git for deployment persistence
- Ayinwi can now log in successfully

### ⚠️ Important
- New RD activations will be lost on server restart
- Admin must manually backup after each approval

### 🎯 Recommended Action
**Implement Supabase** (Solution 2) - it's free, reliable, and designed for this exact use case.

### Temporary Workflow (Until Database Implemented)

**After approving each RD payment:**

1. SSH into server or use Render shell
2. Copy the updated JSON files:
   ```bash
   cat regional_directors.json
   cat ambassador_sales.json
   cat referral_codes.json
   ```
3. Update local files in Git repo
4. Commit and push:
   ```bash
   git add *.json
   git commit -m "Update RD/Ambassador data after approval"
   git push origin main
   ```
5. Render auto-deploys with persisted data

---

## Testing

**Verify Ayinwi can log in:**
1. Go to: https://marriageducation.com/rd-login.html
2. Enter:
   - Code: RD-AYIN-5087
   - Email: ayinwipromise@gmail.com
3. Should redirect to dashboard successfully

**Check data persistence:**
```bash
curl https://marriage-education-website.onrender.com/api/rd-stats/RD-AYIN-5087
```

Should return his RD data.

---

## Priority

**HIGH**: This affects all future RD registrations. Recommend implementing Supabase within 1-2 days to avoid manual backup overhead.
