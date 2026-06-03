/**
 * Phase 6 — Reconcile legacy executive overrides and commission ledger gaps.
 *
 * Read-only audit (default):
 *   node scripts/reconcile-commission-ledger-phase6.js
 *
 * Tag legacy/issue rows (no balance changes):
 *   node scripts/reconcile-commission-ledger-phase6.js --apply --tag-only
 *
 * Fix sale.commissions.total when senior/rd were null but total assumed 20%:
 *   node scripts/reconcile-commission-ledger-phase6.js --apply --fix-sale-totals
 *
 * Reverse explicit executive override balances (only when commissions.executive > 0):
 *   node scripts/reconcile-commission-ledger-phase6.js --apply --reverse-executive-balances
 */

const admin = require('firebase-admin');
const path = require('path');

const POLICY = '2026-03-phase6';
const TAG_FIELD = 'commission_ledger_phase6_tagged';
const TOTAL_FIX_FIELD = 'commission_total_corrected_phase6';
const EXEC_REVERSAL_FIELD = 'legacy_executive_override_reversed';

const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const tagOnly = args.includes('--tag-only');
const fixSaleTotals = args.includes('--fix-sale-totals');
const reverseExecutive = args.includes('--reverse-executive-balances');

function monthKeyFromDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function explicitExecutiveAmount(sale) {
  const commissions = sale.commissions || {};
  const direct = Number(commissions.executive || sale.executive_override || 0);
  return direct > 0 ? direct : 0;
}

function commissionGap(sale) {
  const commissions = sale.commissions || {};
  const total = Number(commissions.total || 0);
  const amb = Number(commissions.ambassador || 0);
  const snr = Number(commissions.senior || 0);
  const rd = Number(commissions.rd || 0);
  const credited = amb + snr + rd;
  const gap = total - credited;
  if (gap <= 1) return null;
  if (explicitExecutiveAmount(sale) > 0) {
    return { type: 'explicit_executive', gap, total, credited };
  }
  if (!sale.source_senior && !sale.source_rd) {
    return { type: 'missing_upline_attribution', gap, total, credited };
  }
  return { type: 'unresolved_commission_gap', gap, total, credited };
}

async function loadSalesAudit() {
  const snapshot = await db.collection('sales').get();
  const explicitExecutive = [];
  const commissionGaps = [];

  snapshot.forEach((doc) => {
    const sale = doc.data();
    const exAmount = explicitExecutiveAmount(sale);
    if (exAmount > 0) {
      explicitExecutive.push({
        id: doc.id,
        ref: doc.ref,
        amount: exAmount,
        executiveId: sale.executive_id || sale.source_executive || null,
        alreadyReversed: Boolean(sale[EXEC_REVERSAL_FIELD])
      });
    }

    const gap = commissionGap(sale);
    if (gap) {
      commissionGaps.push({
        id: doc.id,
        ref: doc.ref,
        sale,
        gap,
        alreadyTagged: Boolean(sale[TAG_FIELD]),
        totalFixed: Boolean(sale[TOTAL_FIX_FIELD])
      });
    }
  });

  return { totalSales: snapshot.size, explicitExecutive, commissionGaps };
}

async function loadExecutiveOverrideBalances() {
  const snapshot = await db.collection('ambassadors').get();
  const rows = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const earned = Number(data.executive_override_earned || 0);
    if (earned <= 0) return;
    rows.push({
      id: doc.id,
      ref: doc.ref,
      name: data.fullName || data.name || doc.id,
      executive_override_earned: earned,
      role_level: data.role_level || null
    });
  });
  return rows;
}

async function applyTags(commissionGaps, explicitExecutive) {
  let tagged = 0;

  for (const row of commissionGaps) {
    if (row.alreadyTagged) continue;
    await row.ref.update({
      [TAG_FIELD]: true,
      commission_ledger_phase6_issue: row.gap.type,
      commission_ledger_phase6_gap_fcfa: row.gap.gap,
      commission_ledger_phase6_policy: POLICY,
      commission_ledger_phase6_tagged_at: admin.firestore.FieldValue.serverTimestamp()
    });
    tagged += 1;
  }

  for (const row of explicitExecutive) {
    if (row.alreadyReversed) continue;
    await row.ref.update({
      [TAG_FIELD]: true,
      legacy_executive_override_amount: row.amount,
      legacy_executive_override_policy: POLICY,
      commission_ledger_phase6_tagged_at: admin.firestore.FieldValue.serverTimestamp()
    });
    tagged += 1;
  }

  return tagged;
}

async function applySaleTotalFixes(commissionGaps) {
  let fixed = 0;
  for (const row of commissionGaps) {
    if (row.totalFixed || row.gap.type !== 'missing_upline_attribution') continue;

    const commissions = row.sale.commissions || {};
    const credited =
      Number(commissions.ambassador || 0) +
      Number(commissions.senior || 0) +
      Number(commissions.rd || 0);

    await row.ref.update({
      'commissions.total': credited,
      [TOTAL_FIX_FIELD]: true,
      commission_total_corrected_from: Number(commissions.total || 0),
      commission_total_corrected_to: credited,
      commission_total_corrected_reason: 'No senior/RD attribution — total aligned to credited amount',
      commission_total_corrected_policy: POLICY,
      commission_total_corrected_at: admin.firestore.FieldValue.serverTimestamp()
    });
    fixed += 1;
  }
  return fixed;
}

async function applyExecutiveReversals(explicitExecutive) {
  const byExecutive = new Map();

  for (const row of explicitExecutive) {
    if (row.alreadyReversed || !row.executiveId) continue;
    const entry = byExecutive.get(row.executiveId) || { total: 0, saleIds: [] };
    entry.total += row.amount;
    entry.saleIds.push(row.id);
    byExecutive.set(row.executiveId, entry);
  }

  let executivesUpdated = 0;
  let salesMarked = 0;

  for (const [executiveId, entry] of byExecutive.entries()) {
    const execRef = db.collection('ambassadors').doc(executiveId);
    const execDoc = await execRef.get();
    if (!execDoc.exists) {
      console.warn(`⚠️  Executive doc missing: ${executiveId}`);
      continue;
    }

    const migrationRef = db.collection('commission_policy_migrations').doc(`${POLICY}_exec_${executiveId}`);
    if ((await migrationRef.get()).exists) {
      console.log(`↷ Skipping ${executiveId} — already reversed`);
      continue;
    }

    await execRef.update({
      executive_override_earned: admin.firestore.FieldValue.increment(-entry.total),
      commissionEarned: admin.firestore.FieldValue.increment(-entry.total),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    await migrationRef.set({
      policy: POLICY,
      type: 'legacy_executive_override_reversal',
      executive_id: executiveId,
      amount_reversed: entry.total,
      sale_count: entry.saleIds.length,
      sale_ids: entry.saleIds,
      reversed_at: admin.firestore.FieldValue.serverTimestamp()
    });

    executivesUpdated += 1;
  }

  for (const row of explicitExecutive) {
    if (row.alreadyReversed || !row.executiveId) continue;
    await row.ref.update({
      [EXEC_REVERSAL_FIELD]: true,
      legacy_executive_override_reversal_policy: POLICY,
      legacy_executive_override_reversed_at: admin.firestore.FieldValue.serverTimestamp()
    });
    salesMarked += 1;
  }

  return { executivesUpdated, salesMarked };
}

function printReport(audit, executiveBalances) {
  console.log('--- Phase 6 commission ledger audit ---\n');
  console.log(`Sales scanned: ${audit.totalSales}`);
  console.log(`Explicit executive override sales: ${audit.explicitExecutive.length}`);
  console.log(`Commission ledger gaps: ${audit.commissionGaps.length}`);

  if (audit.explicitExecutive.length) {
    const total = audit.explicitExecutive.reduce((sum, row) => sum + row.amount, 0);
    console.log(`  Total explicit executive amount: ${total.toLocaleString()} FCFA`);
    for (const row of audit.explicitExecutive) {
      console.log(`  - ${row.id}: ${row.amount.toLocaleString()} FCFA (${row.executiveId || 'no executive id'})`);
    }
  } else {
    console.log('  ✅ No explicit executive override sales in production.');
  }

  if (audit.commissionGaps.length) {
    console.log('\nCommission gaps (not executive overrides):');
    for (const row of audit.commissionGaps) {
      console.log(
        `  - ${row.id}: ${row.gap.type}, total=${row.gap.total}, credited=${row.gap.credited}, gap=${row.gap.gap}`
      );
    }
  } else {
    console.log('\n✅ No commission total/credited mismatches.');
  }

  console.log(`\nAmbassadors with executive_override_earned > 0: ${executiveBalances.length}`);
  for (const row of executiveBalances) {
    console.log(`  - ${row.id}: ${row.executive_override_earned.toLocaleString()} FCFA (role_level=${row.role_level})`);
  }
  if (!executiveBalances.length) {
    console.log('  ✅ No executive override balances to reverse.');
  }
}

async function main() {
  const mode = apply
    ? [tagOnly && 'TAG', fixSaleTotals && 'FIX TOTALS', reverseExecutive && 'REVERSE EXEC'].filter(Boolean).join(' + ') || 'NO-OP'
    : 'AUDIT ONLY';
  console.log(`Phase 6 reconcile — ${mode}\n`);

  const [audit, executiveBalances] = await Promise.all([
    loadSalesAudit(),
    loadExecutiveOverrideBalances()
  ]);

  printReport(audit, executiveBalances);

  if (!apply) {
    console.log('\nDry run complete.');
    console.log('Safe apply options:');
    console.log('  --apply --tag-only');
    console.log('  --apply --fix-sale-totals   (missing upline only; adjusts sale.commissions.total)');
    console.log('  --apply --reverse-executive-balances   (only when commissions.executive > 0)');
    return;
  }

  if (tagOnly) {
    const tagged = await applyTags(audit.commissionGaps, audit.explicitExecutive);
    console.log(`\n✅ Tagged ${tagged} record(s).`);
  }

  if (fixSaleTotals) {
    const fixed = await applySaleTotalFixes(audit.commissionGaps);
    console.log(`\n✅ Corrected commissions.total on ${fixed} sale(s).`);
  }

  if (reverseExecutive) {
    if (!audit.explicitExecutive.length) {
      console.log('\n↷ No explicit executive overrides — nothing to reverse.');
    } else {
      const result = await applyExecutiveReversals(audit.explicitExecutive);
      console.log(`\n✅ Reversed ${result.executivesUpdated} executive balance(s); marked ${result.salesMarked} sale(s).`);
    }
  }

  if (!tagOnly && !fixSaleTotals && !reverseExecutive) {
    console.error('\nPass --tag-only, --fix-sale-totals, and/or --reverse-executive-balances with --apply.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
