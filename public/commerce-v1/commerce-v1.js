/**
 * Commerce Engine V1 — Sandbox dashboard client
 * Calls isolated Cloud Functions only (commerceV1*).
 */

(function () {
  const functions = firebase.app().functions('us-central1');
  const initiateCheckout = functions.httpsCallable('commerceV1InitiateCheckout');
  const simulatePayment = functions.httpsCallable('commerceV1SimulatePayment');
  const getDashboard = functions.httpsCallable('commerceV1GetDashboard');
  const runPayoutBatch = functions.httpsCallable('commerceV1RunPayoutBatch');

  let lastTransactionId = null;

  const $ = (id) => document.getElementById(id);

  function log(msg) {
    const el = $('log');
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.textContent = line + '\n' + el.textContent;
  }

  function renderTable(tbody, rows, cols) {
    tbody.innerHTML = rows
      .map((row) => {
        return `<tr>${cols.map((c) => `<td>${c(row)}</td>`).join('')}</tr>`;
      })
      .join('') || '<tr><td colspan="6" style="color:var(--muted)">No records</td></tr>';
  }

  async function refreshDashboard() {
    log('Loading dashboard…');
    const res = await getDashboard();
    const d = res.data;

    $('mTx').textContent = d.transactions?.length ?? 0;
    $('mCom').textContent = d.commissions?.length ?? 0;
    $('mWal').textContent = d.wallets?.length ?? 0;
    $('mPo').textContent = (d.payouts || []).filter((p) =>
      ['QUEUED', 'RETRY', 'PROCESSING'].includes(p.status)
    ).length;

    renderTable($('txTable').querySelector('tbody'), d.transactions || [], [
      (r) => `<span class="mono">${r.transactionId || r.id}</span>`,
      (r) => `<span class="status ${r.status}">${r.status}</span>`,
      (r) => `${r.amount} ${r.currency || 'XAF'}`,
      (r) => r.productType || '—',
      (r) => (r.commissionProcessed ? '✅' : '—')
    ]);

    renderTable($('comTable').querySelector('tbody'), d.commissions || [], [
      (r) => r.role,
      (r) => `<span class="mono">${(r.beneficiaryUid || '').slice(0, 12)}…</span>`,
      (r) => `${r.amount} FCFA`,
      (r) => `<span class="status ${r.status}">${r.status}</span>`
    ]);

    renderTable($('walletTable').querySelector('tbody'), d.wallets || [], [
      (r) => `<span class="mono">${(r.uid || r.id || '').slice(0, 14)}…</span>`,
      (r) => r.pendingBalance ?? 0,
      (r) => r.availableBalance ?? 0,
      (r) => r.totalEarned ?? 0
    ]);

    renderTable($('payoutTable').querySelector('tbody'), d.payouts || [], [
      (r) => `<span class="mono">${(r.payoutId || r.id || '').slice(0, 16)}</span>`,
      (r) => (r.uid || '').slice(0, 10),
      (r) => r.amount,
      (r) => `<span class="status ${r.status}">${r.status}</span>`
    ]);

    renderTable($('whTable').querySelector('tbody'), d.webhookLogs || [], [
      (r) => `<span class="mono">${(r.id || '').slice(0, 12)}</span>`,
      (r) => (r.verified ? '✅' : '❌'),
      (r) => r.gateway || 'campay'
    ]);

    log('Dashboard refreshed (sandbox collections: ' + JSON.stringify(d.collections) + ')');
  }

  $('btnCheckout').addEventListener('click', async () => {
    try {
      $('btnCheckout').disabled = true;
      const productType = $('productType').value;
      const amount = productType === 'foundation_subscription' ? 5200 : 5000;

      const res = await initiateCheckout({
        uid: $('uid').value.trim() || `sandbox_${Date.now()}`,
        phone: $('phone').value.trim(),
        amount,
        productType,
        productId: productType === 'foundation_subscription' ? 'foundation-monthly' : 'sbd-book',
        referrerUid: $('referrerUid').value.trim() || null,
        seniorUid: $('seniorUid').value.trim() || null
      });

      lastTransactionId = res.data.transactionId;
      $('lastTx').textContent = `Transaction: ${lastTransactionId} (${res.data.status})`;
      $('btnSimulate').disabled = false;
      log(`Checkout initiated: ${lastTransactionId} mode=${res.data.mode}`);
    } catch (e) {
      log('Checkout error: ' + (e.message || e));
      alert(e.message || 'Checkout failed');
    } finally {
      $('btnCheckout').disabled = false;
    }
  });

  $('btnSimulate').addEventListener('click', async () => {
    if (!lastTransactionId) return;
    try {
      $('btnSimulate').disabled = true;
      const res = await simulatePayment({ transactionId: lastTransactionId });
      log(`Simulated success: ${JSON.stringify(res.data.result?.commissionPlan?.entries?.length || 0)} commissions`);
      await refreshDashboard();
    } catch (e) {
      log('Simulate error: ' + e.message);
      alert(e.message);
    } finally {
      $('btnSimulate').disabled = false;
    }
  });

  $('btnRefresh').addEventListener('click', () => refreshDashboard().catch((e) => log(e.message)));
  $('btnPayoutBatch').addEventListener('click', async () => {
    try {
      const res = await runPayoutBatch();
      log(`Payout batch: ${JSON.stringify(res.data.result)}`);
      await refreshDashboard();
    } catch (e) {
      log('Payout batch error: ' + e.message);
    }
  });

  $('uid').value = 'sandbox_' + Date.now().toString().slice(-6);
  log('Commerce V1 sandbox ready. Deploy functions before testing.');
  refreshDashboard().catch(() => log('Deploy commerceV1* functions first.'));
})();
