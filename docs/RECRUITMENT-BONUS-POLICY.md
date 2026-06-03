# Recruitment Bonus Policy — Authoritative Reference

**Policy version:** `2026-03-v3`  
**Status:** Active (implemented in Cloud Functions `activateAmbassador`)  
**Last updated:** March 2026  

> **Read [COMMISSION-MASTER-PRINCIPLES.md](./COMMISSION-MASTER-PRINCIPLES.md) first.**  
> **Read this document before changing recruitment bonuses, admin payout UI, dashboard copy, or activation scripts.**

---

## 1. Purpose

When an **admin approves** an ambassador registration payment (~**15,000 FCFA** signup), the system credits **recruitment bonuses** to the direct recruiter and to uplines above them. Bonuses are recorded as **pending** until an admin marks them paid in the admin dashboard.

This policy does **not** auto-activate ambassadors. Admin approval remains the gate.

---

## 2. Money pools (per approved recruit)

| Pool | Amount (FCFA) | Recipient |
|------|---------------|-----------|
| **A — Direct recruiter** | **1,500** | Person on the payment as recruiter (`regional_director` / `recruitedBy`) |
| **B — Upline pool** | Up to **1,500** | Shared among uplines **above** the direct recruiter (see §4) |

| Scenario | Max total paid | Org retains (from pool B) |
|----------|----------------|---------------------------|
| RD recruits directly (0 uplines) | **1,500** | **1,500** |
| 1 upline | **2,250** | **750** |
| 2 uplines | **3,000** | **0** |
| 3+ uplines | **3,000** | **0** |

Signup fee reference: **15,000 FCFA** → direct pool = 10%, upline pool = 10%, org may retain unused upline pool.

---

## 3. Who is the direct recruiter?

Resolved at activation from payment (after code normalization — see §8):

1. `payment.regional_director`
2. `payment.ambassador_data.recruitedBy`
3. `payment.referral_code`

Must be `AMB-…`, `SNR-…`, or `RD-…`.

- **`AMB-` / `SNR-` direct:** receives **1,500** (pool A) + uplines receive pool B.
- **`RD-` direct:** receives **1,500** only. Pool B (**1,500**) stays with the **org** (no uplines paid).

---

## 4. Upline pool rules (pool B = 1,500 FCFA cap)

**Uplines** = everyone **above** the direct recruiter, walking **up** the chain (closest first). Includes:

- Ambassadors / Senior ambassadors (`AMB-…`, `SNR-…`)
- Regional Director (`RD-…`) when in chain — **walk stops at RD**

**Executive Network Director is never in the upline pool.** No recruitment bonus on signup. See [EXECUTIVE-NETWORK-DIRECTOR.md](./EXECUTIVE-NETWORK-DIRECTOR.md).

The **direct recruiter is never** in the upline list.

| # uplines (N) | Each upline receives | Total from pool B | Org keeps |
|---------------|----------------------|-------------------|-----------|
| **0** | — | 0 | 1,500 |
| **1** | **750** | 750 | **750** |
| **2** | **750 + 750** | 1,500 | 0 |
| **3+** | **1,500 ÷ N** (equal; remainder to closest upline) | 1,500 | 0 |

### Rounding (N ≥ 3)

`base = floor(1500 / N)`, `remainder = 1500 - base * N`. Remainder added to **upline #1** (closest to direct recruiter).

Example: N=4 → 375+375+375+375=1500. N=5 → 300×5=1500.

---

## 5. Worked examples

### 5.1 Nyuyshu — 3 uplines, no Executive

**New:** `AMB-NYUY-6017`  
**Direct recruiter:** `AMB-KONI-8321`  

**Upline chain (Koni → up):**

| # | Code | Name |
|---|------|------|
| 1 | AMB-GLOR-1135 | Glory Koni |
| 2 | AMB-EVEL-6730 | Evelyn Ngen |
| 3 | RD-GUST-4230 | Achu Gustave |

| Payee | Pool | FCFA |
|-------|------|------|
| AMB-KONI-8321 | A direct | 1,500 |
| AMB-GLOR-1135 | B ÷ 3 | 500 |
| AMB-EVEL-6730 | B ÷ 3 | 500 |
| RD-GUST-4230 | B ÷ 3 | 500 |
| **Total** | | **3,000** |

```
AMB-NYUY-6017
    │ 1,500 direct
AMB-KONI-8321
    ├── AMB-GLOR-1135   500
    ├── AMB-EVEL-6730   500
    └── RD-GUST-4230    500
```

### 5.2 One upline only

| Payee | FCFA |
|-------|------|
| Direct recruiter | 1,500 |
| Single upline | 750 |
| **Total paid** | **2,250** |
| **Org retains** | **750** |

### 5.3 Two uplines

| Payee | FCFA |
|-------|------|
| Direct recruiter | 1,500 |
| Upline 1 | 750 |
| Upline 2 | 750 |
| **Total** | **3,000** |

### 5.4 RD at top of chain (Executive gets nothing)

If `RD-GUST-4230` has Executive sponsor `AMB-EXEC-XXXX`:

| Payee | FCFA |
|-------|------|
| Direct recruiter | 1,500 |
| Uplines (Amb · Senior · RD only) | Same as §5.1 — **3 uplines max in example** |
| Executive sponsor | **0** |

Executive economics come from **replicating RD infrastructure**, not signup upline shares.

### 5.5 RD recruits directly

| Payee | FCFA |
|-------|------|
| RD (direct) | 1,500 |
| Uplines | 0 |
| **Org retains** | **1,500** (unused pool B) |

---

## 6. Upline chain resolution (algorithm)

Starting from **direct recruiter code** (not the new ambassador):

1. Load recruiter record (`ambassadors/{code}` or `regional_directors/{code}`).
2. Set `current = recruitedBy` (or equivalent on RD record).
3. Loop until stop:
   - If `current` is `AMB-` / `SNR-`: append to uplines; load doc; set `current = data.recruitedBy`.
   - If `current` is `RD-`: append RD; **stop** (do not walk `sponsor_code` to Executive).
   - If `current` empty or cycle detected: **stop**.
4. Apply §4 share math to the upline list order (index 0 = closest to direct recruiter).

**Implementation:** `functions/recruitment-bonus-policy.js` → `resolveRecruitmentUplines()`, `computeUplineShareAmounts()`.

---

## 7. Firestore & admin workflow

### 7.1 Collections touched on activation

| Collection | What changes |
|------------|--------------|
| `ambassadors/{new}` | Account created (unchanged) |
| `ambassadors/{direct}` or `regional_directors/{RD}` | `recruits_count`, `recruitment_bonus_pending/earned`, `recruitment_history` |
| Each upline payee | Same bonus fields + history entry |
| `admin_notifications` | One row **per payee** (`type: rd_recruitment_bonus`) |

### 7.2 `admin_notifications` fields

```javascript
{
  type: 'rd_recruitment_bonus',
  policy_version: '2026-03-v3',
  bonus_tier: 'direct' | 'upline',           // pool A vs pool B
  recruiter_type: 'direct_recruiter' | 'upline_share' | 'regional_director' | 'senior',
  // legacy rows may show executive_upline (v2026-03-v2 only)
  rd_code: 'AMB-…' | 'RD-…',               // payee code (legacy column name in admin UI)
  rd_name: 'Display name',
  ambassador_code: 'AMB-NEW-…',            // new recruit
  ambassador_name: '…',
  direct_recruiter_code: 'AMB-…',          // who recruited the new ambassador
  upline_index: 0,                         // upline only; 0 = closest
  upline_count: 3,                         // upline only
  org_retained_fcfa: 0,                    // on first notification or summary
  amount: 500,
  status: 'pending' | 'paid' | 'reversed',
  created_at: Timestamp
}
```

### 7.3 Marking paid

Cloud Function: **`markRDPaymentPaid`**  
Admin UI: Recruitment Bonuses table → **Pay**

Updates payee `recruitment_bonus_pending` ↓, `recruitment_bonus_paid` ↑, matching `recruitment_history` entry by **`ambassador_code` + amount** (not amount alone).

---

## 8. Recruiter code normalization (signup)

Separate from bonus math but **required** for correct attribution.

**Problem:** `AMB_KONI_8321` ≠ `AMB-KONI-8321` in Firestore queries.

**Rule:** Before saving payment / activation, normalize recruiter codes:

- Trim, uppercase
- `AMB_`, `RD_`, `SNR_` prefixes → hyphens (`AMB-KONI-8321`)

**Where implemented:**

| Layer | File |
|-------|------|
| Browser registration | `public/js/ambassador-referral-code.js` |
| Registration page | `public/ambassador-register.html` |
| Payment page | `public/ambassador-payment.html` |
| Cloud Functions | `functions/index.js` → `normalizeReferralCode()`, `normalizeAmbassadorRecruiterPaymentFields()` |

Does **not** create or activate accounts.

---

## 9. Related systems (separate policies)

| System | Bonus | Policy doc |
|--------|-------|------------|
| **SBD Foundation subscription** | **500 + 250 + 250 FCFA/month recurring** (10/5/5 of 5,000 base) | [SBD-SUBSCRIPTION-COMMISSION-POLICY.md](./SBD-SUBSCRIPTION-COMMISSION-POLICY.md) |
| **Executive Network Director** | **0** on signup; earns via RD replication | [EXECUTIVE-NETWORK-DIRECTOR.md](./EXECUTIVE-NETWORK-DIRECTOR.md) |
| **Book / campaign sales** | ~10% / book-sharer rules | `trackAmbassadorSale()` — Phase 4 aligns roles |
| **Senior promotion** | Role change at 10 recruits | `recruits_count` on direct recruiter only |

---

## 10. Code map (implementations)

| Concern | File |
|---------|------|
| **Policy constants & pure math** | `functions/recruitment-bonus-policy.js` |
| **Credit on activation** | `functions/recruitment-bonus-service.js` |
| **Activation hook** | `functions/index.js` → `activateAmbassador()` |
| **Admin mark paid** | `functions/index.js` → `markRDPaymentPaid()` |
| **Admin UI table** | `public/admin-dashboard.html` → `loadRDPaymentsTable()` |
| **Local recovery script** | `scripts/complete-ambassador-activation-local.js` |
| **Policy tests** | `scripts/test-recruitment-bonus-policy.js` |
| **Signup normalization tests** | `scripts/verify-ambassador-register-flow.mjs` |

---

## 11. Deprecated (do not reintroduce)

| Old rule | Replaced by |
|----------|-------------|
| RD-only **750 FCFA** `network_override` on ambassador recruits | Upline pool split (§4) |
| Upline ambassadors **0** on downline recruits | Equal / 750 upline shares |
| `creditRdNetworkRecruitmentOverride()` as sole upline payment | `creditRecruitmentBonusesV2()` |
| Executive in recruitment upline pool (v2026-03-v2) | **Removed in v2026-03-v3** — Executive = replication only |

---

## 12. Deployment checklist

After policy or code changes:

1. Run `node scripts/test-recruitment-bonus-policy.js`
2. Run `node scripts/verify-ambassador-register-flow.mjs` (normalization)
3. Deploy functions: `firebase deploy --only functions`
4. Deploy site (FTP / hosting): registration + admin dashboard JS
5. Verify one test approval in admin → Recruitment Bonuses table shows correct rows and amounts

---

## 13. Change log

| Version | Date | Summary |
|---------|------|---------|
| `2026-03-v3` | Mar 2026 | Remove Executive from upline pool; align with replication doctrine; link SBD recurring policy |
| `2026-03-v2` | Mar 2026 | Two-pool model; Executive in upline split (**superseded**) |
| `legacy` | pre-2026 | 1,500 direct + 750 RD override only |

---

## 14. Quick reference card

```
DIRECT  = 1500 FCFA → always to recruiter on payment

UPLINES = up to 1500 FCFA total (Amb · Senior · RD only):
  N=0  → org keeps 1500 (RD direct case)
  N=1  → upline gets 750, org keeps 750
  N=2  → 750 + 750
  N≥3  → 1500 ÷ N each (remainder to closest upline)

Executive: 0 on signup — see EXECUTIVE-NETWORK-DIRECTOR.md
SBD subs: 500+250+250/month — see SBD-SUBSCRIPTION-COMMISSION-POLICY.md
Admin approves activation → bonuses pending → admin Pay button.
```
