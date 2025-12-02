// MTN Collection Widget Integration
// Documentation: https://momodeveloper.mtn.com/docs/services/collection/operations/request-to-pay-POST

class MTNCollectionWidget {
    constructor(config) {
        this.subscriptionKey = config.subscriptionKey;
        this.environment = config.environment || 'sandbox';
        this.baseURL = this.environment === 'sandbox' 
            ? 'https://sandbox.momodeveloper.mtn.com'
            : 'https://momodeveloper.mtn.com';
        this.merchantNumber = config.merchantNumber; // Your MTN MOMO number
        this.enabled = config.enabled !== false;
    }

    // Generate payment reference
    generateReference() {
        return 'BOOK-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    // Show MTN Widget payment modal
    showPaymentModal(amount, referralCode = null) {
        const reference = this.generateReference();
        const customerName = localStorage.getItem('customerName') || '';
        
        const modal = document.createElement('div');
        modal.id = 'mtn-widget-modal';
        modal.className = 'payment-modal';
        modal.innerHTML = `
            <div class="modal-content mtn-widget">
                <button class="close-modal" onclick="this.closest('.payment-modal').remove()">×</button>
                
                <div class="mtn-header">
                    <div class="mtn-logo">
                        <div class="mtn-icon">MTN</div>
                        <h2>Mobile Money</h2>
                    </div>
                    <div class="payment-amount">
                        <div class="amount-label">Amount to Pay</div>
                        <div class="amount-value">${amount.toLocaleString()} FCFA</div>
                    </div>
                </div>

                <div class="payment-reference">
                    <strong>Reference:</strong> <code id="payment-ref-display">${reference}</code>
                    <button onclick="navigator.clipboard.writeText('${reference}')" class="copy-btn" title="Copy reference">
                        📋
                    </button>
                </div>

                <div class="mtn-payment-options">
                    <h3>Choose Payment Method:</h3>
                    
                    <!-- Option 1: USSD (Most Popular) -->
                    <div class="payment-option ussd-option">
                        <div class="option-header">
                            <input type="radio" name="mtn-method" id="ussd-method" value="ussd" checked>
                            <label for="ussd-method">
                                <span class="option-icon">📱</span>
                                <span class="option-name">Pay with USSD Code</span>
                                <span class="badge recommended">Recommended</span>
                            </label>
                        </div>
                        <div class="option-details" id="ussd-details">
                            <div class="ussd-instructions">
                                <h4>Quick Steps:</h4>
                                <ol>
                                    <li>Dial <strong class="ussd-code">*126#</strong> from your MTN phone</li>
                                    <li>Select <strong>Transfer Money</strong></li>
                                    <li>Select <strong>To Mobile Money Number</strong></li>
                                    <li>Enter merchant number: <strong class="merchant-number">${this.merchantNumber}</strong>
                                        <button onclick="navigator.clipboard.writeText('${this.merchantNumber}')" class="copy-btn-inline">Copy</button>
                                    </li>
                                    <li>Enter amount: <strong>${amount}</strong></li>
                                    <li>Enter reference: <strong>${reference}</strong>
                                        <button onclick="navigator.clipboard.writeText('${reference}')" class="copy-btn-inline">Copy</button>
                                    </li>
                                    <li>Enter your MTN MOMO PIN to confirm</li>
                                </ol>
                                <div class="info-note">
                                    💡 <strong>Tip:</strong> Copy the reference code before dialing
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Option 2: Mobile App -->
                    <div class="payment-option app-option">
                        <div class="option-header">
                            <input type="radio" name="mtn-method" id="app-method" value="app">
                            <label for="app-method">
                                <span class="option-icon">📲</span>
                                <span class="option-name">Pay with MTN MoMo App</span>
                            </label>
                        </div>
                        <div class="option-details" id="app-details" style="display: none;">
                            <div class="app-instructions">
                                <h4>Steps:</h4>
                                <ol>
                                    <li>Open your <strong>MTN Mobile Money App</strong></li>
                                    <li>Tap <strong>Send Money</strong></li>
                                    <li>Enter merchant number: <strong>${this.merchantNumber}</strong>
                                        <button onclick="navigator.clipboard.writeText('${this.merchantNumber}')" class="copy-btn-inline">Copy</button>
                                    </li>
                                    <li>Enter amount: <strong>${amount} FCFA</strong></li>
                                    <li>Add note/reference: <strong>${reference}</strong>
                                        <button onclick="navigator.clipboard.writeText('${reference}')" class="copy-btn-inline">Copy</button>
                                    </li>
                                    <li>Confirm with PIN or fingerprint</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="confirmation-section">
                    <div class="status-message" id="payment-status">
                        <div class="status-icon">⏳</div>
                        <p>Waiting for payment confirmation...</p>
                    </div>

                    <div class="confirmation-form">
                        <h4>After Payment:</h4>
                        <div class="form-group">
                            <label for="mtn-transaction-id">MTN Transaction ID *</label>
                            <input type="text" id="mtn-transaction-id" 
                                   placeholder="e.g., MM210602.1234.A12345" 
                                   required>
                            <small>Find this in your MTN confirmation SMS</small>
                        </div>

                        <div class="form-group">
                            <label for="payment-screenshot">Upload Payment Screenshot (Optional)</label>
                            <input type="file" id="payment-screenshot" 
                                   accept="image/*,application/pdf">
                            <small>Helps verify your payment faster</small>
                        </div>

                        <button onclick="MTNCollectionWidget.submitPayment('${reference}', ${amount}, '${referralCode}')" 
                                class="submit-payment-btn">
                            ✓ I've Completed the Payment
                        </button>
                    </div>
                </div>

                <div class="help-section">
                    <details>
                        <summary>Need Help?</summary>
                        <div class="help-content">
                            <p><strong>Payment not working?</strong></p>
                            <ul>
                                <li>Ensure you have sufficient balance</li>
                                <li>Check that your MTN MOMO is activated</li>
                                <li>Daily limit: 2,000,000 FCFA</li>
                                <li>Contact: MTN Customer Service 678</li>
                            </ul>
                            <p><strong>Transaction ID location:</strong></p>
                            <p>After payment, you'll receive an SMS from MTN with format:<br>
                            "Transaction successful. ID: MM210602.1234.A12345"</p>
                        </div>
                    </details>
                </div>
            </div>

            <style>
                .mtn-widget { max-width: 600px; background: #fff; }
                .mtn-header {
                    background: linear-gradient(135deg, #ffcb05 0%, #ffa000 100%);
                    padding: 30px;
                    text-align: center;
                    border-radius: 12px 12px 0 0;
                    margin: -20px -20px 20px;
                }
                .mtn-logo { display: flex; align-items: center; justify-content: center; gap: 10px; }
                .mtn-icon {
                    background: #000;
                    color: #ffcb05;
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 16px;
                }
                .mtn-logo h2 { color: #000; margin: 0; font-size: 24px; }
                .payment-amount {
                    margin-top: 15px;
                    background: rgba(0,0,0,0.1);
                    padding: 15px;
                    border-radius: 8px;
                }
                .amount-label { font-size: 12px; color: #000; opacity: 0.8; }
                .amount-value { font-size: 32px; font-weight: bold; color: #000; margin-top: 5px; }
                .payment-reference {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .payment-reference code {
                    background: #fff;
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-family: monospace;
                    flex: 1;
                    border: 2px solid #ffcb05;
                }
                .copy-btn, .copy-btn-inline {
                    background: #ffcb05;
                    border: none;
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .copy-btn:hover, .copy-btn-inline:hover { background: #ffa000; }
                .payment-option {
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    margin-bottom: 15px;
                    overflow: hidden;
                    transition: all 0.3s;
                }
                .payment-option:has(input:checked) {
                    border-color: #ffcb05;
                    background: #fffbf0;
                }
                .option-header {
                    padding: 15px;
                    cursor: pointer;
                }
                .option-header label {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    width: 100%;
                }
                .option-icon { font-size: 24px; }
                .option-name { flex: 1; font-weight: 600; }
                .badge {
                    background: #4caf50;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: bold;
                }
                .option-details {
                    padding: 0 15px 15px;
                    border-top: 1px solid #e0e0e0;
                }
                .ussd-code, .merchant-number { 
                    color: #ffcb05; 
                    background: #000;
                    padding: 2px 8px;
                    border-radius: 4px;
                }
                .info-note {
                    background: #e3f2fd;
                    padding: 12px;
                    border-radius: 6px;
                    margin-top: 15px;
                    border-left: 4px solid #2196f3;
                }
                ol { padding-left: 20px; }
                ol li { margin: 10px 0; line-height: 1.6; }
                .confirmation-section { margin-top: 30px; }
                .status-message {
                    text-align: center;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .status-icon { font-size: 48px; }
                .form-group { margin-bottom: 20px; }
                .form-group label { display: block; margin-bottom: 8px; font-weight: 600; }
                .form-group input {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #e0e0e0;
                    border-radius: 6px;
                    font-size: 14px;
                }
                .form-group input:focus { border-color: #ffcb05; outline: none; }
                .form-group small { color: #666; font-size: 12px; }
                .submit-payment-btn {
                    width: 100%;
                    padding: 16px;
                    background: #4caf50;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .submit-payment-btn:hover { background: #45a049; transform: translateY(-2px); }
                .help-section { margin-top: 20px; }
                .help-section summary {
                    cursor: pointer;
                    padding: 12px;
                    background: #f8f9fa;
                    border-radius: 6px;
                    font-weight: 600;
                }
                .help-content { padding: 15px; }
            </style>

            <script>
                // Toggle payment method details
                document.querySelectorAll('input[name="mtn-method"]').forEach(radio => {
                    radio.addEventListener('change', function() {
                        document.querySelectorAll('.option-details').forEach(detail => {
                            detail.style.display = 'none';
                        });
                        const selectedMethod = this.value;
                        document.getElementById(selectedMethod + '-details').style.display = 'block';
                    });
                });
            </script>
        `;
        
        document.body.appendChild(modal);
    }

    // Submit payment confirmation
    static async submitPayment(reference, amount, referralCode) {
        const transactionId = document.getElementById('mtn-transaction-id').value.trim();
        const screenshotFile = document.getElementById('payment-screenshot').files[0];

        if (!transactionId) {
            alert('Please enter the MTN Transaction ID from your confirmation SMS');
            return;
        }

        // Show processing status
        const statusDiv = document.getElementById('payment-status');
        statusDiv.innerHTML = `
            <div class="status-icon">⏳</div>
            <p>Submitting payment confirmation...</p>
        `;

        try {
            let receiptUrl = null;

            // Upload screenshot if provided
            if (screenshotFile && typeof firebase !== 'undefined') {
                const storageRef = firebase.storage().ref();
                const receiptRef = storageRef.child(`payment-receipts/${reference}.jpg`);
                await receiptRef.put(screenshotFile);
                receiptUrl = await receiptRef.getDownloadURL();
            }

            // Record pending sale in Firebase
            const saleData = {
                amount: amount,
                currency: 'XAF',
                paymentMethod: 'mtn_momo_widget',
                status: 'pending_verification',
                mtnTransactionId: transactionId,
                referenceId: reference,
                receiptUrl: receiptUrl,
                referralCode: referralCode,
                customerInfo: {
                    name: localStorage.getItem('customerName') || '',
                    email: localStorage.getItem('customerEmail') || '',
                },
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (typeof FirebaseHelper !== 'undefined') {
                await FirebaseHelper.recordSale(saleData);
            }

            // Show success
            statusDiv.innerHTML = `
                <div class="status-icon">✅</div>
                <p><strong>Payment Submitted Successfully!</strong></p>
                <p>We're verifying your payment. You'll receive confirmation within 5 minutes.</p>
            `;

            // Redirect after 3 seconds
            setTimeout(() => {
                window.location.href = 'payment-pending.html?ref=' + reference;
            }, 3000);

        } catch (error) {
            console.error('Payment submission error:', error);
            statusDiv.innerHTML = `
                <div class="status-icon">❌</div>
                <p><strong>Submission Error</strong></p>
                <p>${error.message}</p>
            `;
        }
    }
}

// Make available globally
window.MTNCollectionWidget = MTNCollectionWidget;

// Initialize widget
console.log('🔄 Loading MTN Collection Widget...');
if (typeof PAYMENT_CONFIG !== 'undefined' && PAYMENT_CONFIG.mtnMomo && PAYMENT_CONFIG.mtnMomo.enabled) {
    console.log('✅ MTN Config found:', PAYMENT_CONFIG.mtnMomo);
    window.MTNWidget = new MTNCollectionWidget({
        subscriptionKey: PAYMENT_CONFIG.mtnMomo.subscriptionKey,
        environment: PAYMENT_CONFIG.mtnMomo.environment,
        merchantNumber: PAYMENT_CONFIG.mtnMomo.merchantNumber
    });
    console.log('✅ MTN Widget initialized successfully');
} else {
    console.warn('⚠️ MTN MOMO config not found or disabled');
}
