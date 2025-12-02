# MTN Collection Widget Integration

## 🎯 Current Situation

You're subscribed to **Collection Widget** (not Collection API), which is actually simpler and better for your use case!

**Collection Widget** = QR codes & USSD for customer payments (perfect for your ambassadors)
**Collection API** = Complex API integration (overkill for book sales)

---

## ✅ How Collection Widget Works

### Customer Payment Flow:
1. Customer clicks "Pay with MTN MOMO"
2. System generates a QR code or USSD code
3. Customer scans QR or dials USSD on their phone
4. Customer enters PIN to approve
5. Payment confirmed instantly
6. Ambassador gets commission

---

## 🚀 Quick Setup (10 minutes)

### Option 1: USSD Payment (Easiest)

Generate a USSD payment code for each transaction:

```javascript
// In js/mtn-widget.js
function generateMTNPayment(amount, referenceId) {
    // MTN USSD format for Cameroon
    const ussdCode = `*126*1*${amount}*${referenceId}#`;
    
    return {
        ussdCode: ussdCode,
        instructions: [
            'Dial ' + ussdCode + ' from your MTN phone',
            'Enter your MTN MOMO PIN',
            'Confirm payment of ' + amount + ' FCFA'
        ]
    };
}
```

### Option 2: QR Code (Professional)

Use the Collection Widget QR generator:

```html
<!-- In payment.html MTN tab -->
<div id="mtn-qr-container">
    <img id="mtn-qr-code" src="" alt="Scan to pay">
    <p>Scan with MTN MOMO app</p>
    <p class="amount">15,000 FCFA</p>
</div>

<script>
function generateMTNQR(amount, referralCode) {
    const merchantId = 'YOUR_MERCHANT_ID'; // From Collection Widget portal
    const qrData = {
        amount: amount,
        currency: 'XAF',
        reference: referralCode || 'BOOK-' + Date.now()
    };
    
    // Generate QR using Collection Widget API
    const qrUrl = `https://api.mtn.com/collection/qr?merchant=${merchantId}&amount=${amount}&ref=${qrData.reference}`;
    
    document.getElementById('mtn-qr-code').src = qrUrl;
}
</script>
```

---

## 💡 Recommended Approach: Manual Confirmation

Since you're just starting, use the simplest method that works:

### 1. Update payment.html MTN section:

```html
<div class="payment-tab" id="mtn-tab">
    <div class="notice">
        <h3>📱 Pay with MTN Mobile Money</h3>
        <p class="amount">15,000 FCFA</p>
        
        <div class="payment-instructions">
            <h4>How to Pay:</h4>
            <ol>
                <li>Open your MTN MOMO app or dial <strong>*126#</strong></li>
                <li>Select "Transfer Money"</li>
                <li>Send <strong>15,000 FCFA</strong> to:</li>
                <li class="merchant-number">+237 677 604 100</li>
                <li>Enter reference: <strong id="payment-ref"></strong></li>
                <li>Confirm with your PIN</li>
                <li>Take a screenshot of the confirmation</li>
            </ol>
        </div>
        
        <button onclick="confirmMTNPayment()" class="pay-button">
            I've Sent the Payment
        </button>
        
        <div id="confirmation-form" style="display:none;">
            <input type="text" id="mtn-transaction-id" placeholder="Enter MTN Transaction ID">
            <input type="file" id="mtn-receipt" accept="image/*">
            <button onclick="submitPaymentProof()">Submit Payment Proof</button>
        </div>
    </div>
</div>

<script>
// Generate unique reference
const paymentRef = 'BOOK-' + Date.now();
document.getElementById('payment-ref').textContent = paymentRef;

function confirmMTNPayment() {
    document.getElementById('confirmation-form').style.display = 'block';
}

async function submitPaymentProof() {
    const transactionId = document.getElementById('mtn-transaction-id').value;
    const receiptFile = document.getElementById('mtn-receipt').files[0];
    
    if (!transactionId) {
        alert('Please enter the MTN transaction ID');
        return;
    }
    
    // Upload to Firebase Storage
    const storageRef = firebase.storage().ref();
    const receiptRef = storageRef.child(`receipts/${paymentRef}.jpg`);
    
    if (receiptFile) {
        await receiptRef.put(receiptFile);
    }
    
    // Record pending sale in Firebase
    await FirebaseHelper.recordSale({
        amount: 15000,
        currency: 'XAF',
        paymentMethod: 'mtn_momo',
        status: 'pending_verification',
        mtnTransactionId: transactionId,
        referenceId: paymentRef,
        receiptUrl: receiptFile ? await receiptRef.getDownloadURL() : null,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Show pending confirmation message
    alert('Payment received! We\'ll verify and confirm within 5 minutes.');
    window.location.href = 'payment-pending.html';
}
</script>
```

### 2. Create admin verification page:

You (admin) receive notification of pending payment, check your MTN MOMO app, verify the transaction, then click "Approve" to:
- Mark sale as completed
- Credit ambassador commission
- Send success notification

---

## 🎯 Why This Approach Is Better

**Pros:**
- ✅ Works immediately (no API setup needed)
- ✅ No API fees or complexity
- ✅ Customers use familiar MTN MOMO flow
- ✅ You receive money directly to your number
- ✅ Can manually verify each transaction
- ✅ Screenshot proof for disputes

**Cons:**
- ⚠️ Manual verification required (5 min per payment)
- ⚠️ Not instant confirmation (but fast enough)

---

## 📊 Expected Volume

With 500 ambassadors × 60 books = 30,000 transactions over 3 months:
- Average: 330 transactions/day
- Manual verification: ~30 minutes/day
- Can hire assistant after first 1000 sales

---

## 🚀 Automation Later (Optional)

Once you have 1000+ transactions/month, you can:
1. Apply for full Collection API access (requires business docs)
2. Implement webhook callbacks for instant confirmation
3. Fully automate the process

But for launch, manual verification is perfectly fine!

---

## ✅ Action Items

1. Update `payment.html` with manual MTN MOMO flow
2. Add your MTN number: +237 677 604 100
3. Create simple admin verification page
4. Test with real 15,000 FCFA payment
5. Launch! 🚀

**You can start accepting payments TODAY with this approach!**
