// MTN Mobile Money Integration
// Complete implementation for Cameroon

class MTNMoMo {
    constructor(config) {
        this.apiKey = config.apiKey;
        this.apiUser = config.apiUser;
        this.subscriptionKey = config.subscriptionKey;
        this.environment = config.environment || 'sandbox';
        this.callbackUrl = config.callbackUrl;
        
        // API endpoints
        this.baseUrl = this.environment === 'sandbox' 
            ? 'https://sandbox.momodeveloper.mtn.com'
            : 'https://momodeveloper.mtn.com';
        
        this.collectionUrl = `${this.baseUrl}/collection/v1_0`;
    }
    
    // Generate UUID for transactions
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    // Get access token
    async getAccessToken() {
        try {
            const response = await fetch(`${this.collectionUrl}/token/`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + btoa(this.apiUser + ':' + this.apiKey),
                    'Ocp-Apim-Subscription-Key': this.subscriptionKey,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            return data.access_token;
        } catch (error) {
            console.error('Error getting MTN MOMO access token:', error);
            throw error;
        }
    }
    
    // Request payment from customer
    async requestToPay(phoneNumber, amount, referenceId, customerNote = 'Marriage Education Book Purchase') {
        try {
            const token = await this.getAccessToken();
            const transactionId = referenceId || this.generateUUID();
            
            // Format phone number (remove +237 or leading zeros)
            let cleanPhone = phoneNumber.replace(/[\s\-\+]/g, '');
            if (cleanPhone.startsWith('237')) {
                cleanPhone = cleanPhone.substring(3);
            }
            if (cleanPhone.startsWith('0')) {
                cleanPhone = cleanPhone.substring(1);
            }
            
            const requestBody = {
                amount: amount.toString(),
                currency: 'XAF',
                externalId: transactionId,
                payer: {
                    partyIdType: 'MSISDN',
                    partyId: '237' + cleanPhone // Must include country code
                },
                payerMessage: customerNote,
                payeeNote: 'Payment for book purchase'
            };
            
            const response = await fetch(`${this.collectionUrl}/requesttopay`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'X-Reference-Id': transactionId,
                    'X-Target-Environment': this.environment,
                    'Ocp-Apim-Subscription-Key': this.subscriptionKey,
                    'Content-Type': 'application/json',
                    'X-Callback-Url': this.callbackUrl
                },
                body: JSON.stringify(requestBody)
            });
            
            if (response.status === 202) {
                // Request accepted
                return {
                    success: true,
                    transactionId: transactionId,
                    message: 'Payment request sent to ' + phoneNumber
                };
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Payment request failed');
            }
        } catch (error) {
            console.error('Error requesting MTN MOMO payment:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // Check transaction status
    async getTransactionStatus(transactionId) {
        try {
            const token = await this.getAccessToken();
            
            const response = await fetch(`${this.collectionUrl}/requesttopay/${transactionId}`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'X-Target-Environment': this.environment,
                    'Ocp-Apim-Subscription-Key': this.subscriptionKey
                }
            });
            
            const data = await response.json();
            
            return {
                status: data.status, // PENDING, SUCCESSFUL, FAILED
                amount: data.amount,
                currency: data.currency,
                financialTransactionId: data.financialTransactionId,
                externalId: data.externalId,
                reason: data.reason
            };
        } catch (error) {
            console.error('Error checking MTN MOMO status:', error);
            throw error;
        }
    }
    
    // Poll transaction until complete
    async waitForPaymentConfirmation(transactionId, maxAttempts = 30, interval = 2000) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const status = await this.getTransactionStatus(transactionId);
                
                if (status.status === 'SUCCESSFUL') {
                    return {
                        success: true,
                        status: 'SUCCESSFUL',
                        transactionId: transactionId,
                        financialTransactionId: status.financialTransactionId
                    };
                } else if (status.status === 'FAILED') {
                    return {
                        success: false,
                        status: 'FAILED',
                        reason: status.reason
                    };
                } else if (status.status === 'PENDING') {
                    // Wait and try again
                    await new Promise(resolve => setTimeout(resolve, interval));
                    continue;
                }
            } catch (error) {
                console.error('Error polling payment status:', error);
            }
        }
        
        return {
            success: false,
            status: 'TIMEOUT',
            message: 'Payment verification timeout. Please check your MTN Mobile Money balance.'
        };
    }
}

// Payment UI Handler
const MTNMoMoPayment = {
    // Show payment modal
    showPaymentModal: function(amount, referralCode = null) {
        const modal = document.createElement('div');
        modal.id = 'mtnMomoModal';
        modal.innerHTML = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;">
                <div style="background: white; padding: 2rem; border-radius: 20px; max-width: 500px; width: 90%;">
                    <h2 style="font-family: 'Playfair Display', serif; color: #2d3436; margin-bottom: 1rem;">
                        <img src="https://www.mtn.cm/wp-content/themes/mtn_cm/assets/images/logo.svg" alt="MTN" style="height: 40px; vertical-align: middle; margin-right: 10px;">
                        MTN Mobile Money
                    </h2>
                    
                    <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="color: #636e72;">Amount to Pay:</span>
                            <strong style="font-size: 1.5rem; color: #00b894;">${amount.toLocaleString()} FCFA</strong>
                        </div>
                        ${referralCode ? `
                        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: #636e72;">
                            <span>Referred by:</span>
                            <span>${referralCode}</span>
                        </div>
                        ` : ''}
                    </div>
                    
                    <form id="mtnMomoForm">
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; color: #2d3436; font-weight: 500;">
                                MTN Mobile Money Number
                            </label>
                            <div style="display: flex; gap: 0.5rem;">
                                <select id="countryCode" style="padding: 0.75rem; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 1rem; width: 100px;">
                                    <option value="+237">+237 🇨🇲</option>
                                </select>
                                <input 
                                    type="tel" 
                                    id="mtnPhoneNumber" 
                                    placeholder="6XX XXX XXX"
                                    required
                                    pattern="[0-9]{9}"
                                    maxlength="9"
                                    style="flex: 1; padding: 0.75rem; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 1rem;"
                                >
                            </div>
                            <small style="color: #636e72; margin-top: 0.25rem; display: block;">
                                📱 Enter your 9-digit MTN number (e.g., 677123456)
                            </small>
                        </div>
                        
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; margin-bottom: 0.5rem; color: #2d3436; font-weight: 500;">
                                Customer Name (Optional)
                            </label>
                            <input 
                                type="text" 
                                id="customerName" 
                                placeholder="Your full name"
                                style="width: 100%; padding: 0.75rem; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 1rem;"
                            >
                        </div>
                        
                        <div style="background: #fff3cd; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.9rem;">
                            <strong>📲 How it works:</strong><br>
                            1. Enter your MTN number<br>
                            2. Click "Pay with MTN MOMO"<br>
                            3. Check your phone for payment prompt<br>
                            4. Enter your PIN to confirm<br>
                            5. Payment confirmed instantly!
                        </div>
                        
                        <div style="display: flex; gap: 1rem;">
                            <button 
                                type="button" 
                                onclick="MTNMoMoPayment.closeModal()"
                                style="flex: 1; padding: 1rem; background: white; color: #2d3436; border: 2px solid #e0e0e0; border-radius: 8px; font-weight: 600; cursor: pointer;"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                id="mtnSubmitBtn"
                                style="flex: 2; padding: 1rem; background: linear-gradient(135deg, #ffcb05 0%, #ffa000 100%); color: #000; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 1rem;"
                            >
                                💳 Pay with MTN MOMO
                            </button>
                        </div>
                    </form>
                    
                    <div id="mtnStatusMessage" style="margin-top: 1rem; padding: 1rem; border-radius: 8px; display: none;"></div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Form submission
        document.getElementById('mtnMomoForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const phoneNumber = document.getElementById('mtnPhoneNumber').value;
            const customerName = document.getElementById('customerName').value;
            
            await MTNMoMoPayment.processPayment(phoneNumber, amount, customerName, referralCode);
        });
        
        // Auto-format phone number
        document.getElementById('mtnPhoneNumber').addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 9) value = value.substr(0, 9);
            e.target.value = value;
        });
    },
    
    // Process payment
    processPayment: async function(phoneNumber, amount, customerName, referralCode) {
        const submitBtn = document.getElementById('mtnSubmitBtn');
        const statusDiv = document.getElementById('mtnStatusMessage');
        
        // Show loading
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        
        try {
            // Initialize MTN MOMO
            const momo = new MTNMoMo(PAYMENT_CONFIG.mtnMomo);
            
            // Request payment
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#e3f2fd';
            statusDiv.style.color = '#1976d2';
            statusDiv.innerHTML = '📱 Sending payment request to your phone...<br><small>Please check your MTN Mobile Money notification</small>';
            
            const paymentRequest = await momo.requestToPay(phoneNumber, amount, null, 'Marriage Education Book - ' + (customerName || 'Customer'));
            
            if (!paymentRequest.success) {
                throw new Error(paymentRequest.error);
            }
            
            // Update status
            statusDiv.innerHTML = '⏳ Waiting for confirmation...<br><small>Please enter your PIN on your phone to complete payment</small>';
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Waiting for confirmation...';
            
            // Wait for payment confirmation
            const confirmation = await momo.waitForPaymentConfirmation(paymentRequest.transactionId);
            
            if (confirmation.success) {
                // Payment successful!
                statusDiv.style.background = '#d4edda';
                statusDiv.style.color = '#155724';
                statusDiv.innerHTML = '✅ Payment successful!<br><small>Transaction ID: ' + confirmation.financialTransactionId + '</small>';
                
                // Record sale in Firebase
                if (typeof FirebaseHelper !== 'undefined') {
                    await FirebaseHelper.recordSale({
                        customerEmail: '',
                        customerName: customerName || 'MTN Customer',
                        customerPhone: phoneNumber,
                        quantity: 1,
                        amount: amount,
                        currency: 'XAF',
                        paymentMethod: 'mtn_momo',
                        paymentId: confirmation.financialTransactionId,
                        referralCode: referralCode,
                        status: 'completed'
                    });
                }
                
                // Redirect to success page
                setTimeout(() => {
                    window.location.href = 'payment-success.html?ref=' + confirmation.transactionId;
                }, 2000);
                
            } else {
                throw new Error(confirmation.reason || 'Payment failed or was cancelled');
            }
            
        } catch (error) {
            console.error('MTN MOMO payment error:', error);
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#f8d7da';
            statusDiv.style.color = '#721c24';
            statusDiv.innerHTML = '❌ Payment failed: ' + error.message + '<br><small>Please try again or use another payment method</small>';
            
            submitBtn.disabled = false;
            submitBtn.innerHTML = '💳 Try Again';
        }
    },
    
    // Close modal
    closeModal: function() {
        const modal = document.getElementById('mtnMomoModal');
        if (modal) {
            modal.remove();
        }
    }
};

// Export for use in other files
window.MTNMoMo = MTNMoMo;
window.MTNMoMoPayment = MTNMoMoPayment;
