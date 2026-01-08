# Firebase Migration Reminder

## When to Migrate

Schedule this migration when you can afford **8–24 hours** of DNS propagation time.

Good times:
- Weekend (low traffic)
- After business hours
- During a planned maintenance window
- After transferring domain to Google Domains (faster DNS propagation)

---

## Pre-Migration Steps

1. **Lower DNS TTL at iPage** (do this 24-48 hours before migration):
   - Go to iPage DNS → Edit A record
   - Change TTL from current value to **5 minutes** or **10 minutes**
   - Wait for old TTL period to pass
   - This reduces propagation time for the actual switch

2. **Transfer domain to Google Domains** (optional but recommended):
   - Cost: $1 transfer fee
   - Benefit: Much faster DNS propagation (minutes instead of 8-48 hours)
   - Time: 5–7 days for transfer to complete
   - Do this first, then migrate hosting

---

## Migration Day Checklist

### Phase 1: Verify Firebase Setup (Zero Downtime)
- [ ] TXT record exists: @ = `hosting-site=marriage-education` at iPage
- [ ] Open Firebase Console → Hosting → Custom domains
- [ ] Add marriageducation.com
- [ ] Wait for Firebase to detect TXT and issue SSL cert (5–30 minutes)
- [ ] Confirm cert is ready before proceeding

### Phase 2: Switch DNS to Firebase
- [ ] Change A @ → 199.36.158.100 at iPage (or Google Domains if transferred)
- [ ] Change A www → 199.36.158.100 (or CNAME www → @)
- [ ] Keep TXT @ → hosting-site=marriage-education
- [ ] Save and wait for propagation (8–48 hours on iPage, 5–30 minutes on Google Domains)

### Phase 3: Verify Live
- [ ] Test `dig @8.8.8.8 marriageducation.com +short` → should show 199.36.158.100
- [ ] Test `dig @8.8.8.8 www.marriageducation.com +short` → should show 199.36.158.100
- [ ] Load https://marriageducation.com → should show valid cert, no warnings
- [ ] Test ambassador login, dashboard, payment flows
- [ ] Monitor for 24 hours

### Phase 4: Cleanup
- [ ] Remove old A record to 66.96.147.102 from iPage/Google Domains
- [ ] Cancel iPage hosting (keep domain registered until transfer if still at iPage)
- [ ] Update documentation/bookmarks

---

## Rollback Plan (If Issues Occur)

If site is down or has issues after switching A records:

1. Change A @ back to 66.96.147.102 at iPage
2. Change A www back to 66.96.147.102
3. Save and wait for propagation
4. Site will return to old host
5. Debug Firebase setup before trying again

---

## Post-Migration

- **Cost**: ~$0/month Firebase Hosting + $12/year domain (if at Google Domains)
- **Benefits**: Faster, more reliable, zero maintenance, free SSL
- **Next deployment**: `firebase deploy --only hosting` (instant, no DNS wait)

---

## Notes

- DNS propagation on iPage: 8–48 hours (confirmed by iPage support)
- DNS propagation on Google Domains: typically 5–30 minutes
- Firebase cert issuance: 5–30 minutes after TXT verification
- Ambassador login/dashboard already work on https://marriage-education.web.app

---

## Contact Info

- Firebase Console: https://console.firebase.google.com/project/marriage-education
- iPage DNS: (your iPage account)
- Google Domains: https://domains.google.com (after transfer)
- Telegram Chat ID for notifications: 6658054668
