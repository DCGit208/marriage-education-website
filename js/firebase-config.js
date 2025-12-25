// Firebase Configuration and Initialization
// Replace with your actual Firebase project credentials

const firebaseConfig = {
  apiKey: "AIzaSyDK2FjzMM5cZ6zkpz89LieauLDTBT8DzYc",
  authDomain: "marriage-education.firebaseapp.com",
  projectId: "marriage-education",
  storageBucket: "marriage-education.firebasestorage.app",
  messagingSenderId: "730854285800",
  appId: "1:730854285800:web:2176d278397398fd41045d"
};


// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Initialize services (use var for global scope)
var db = firebase.firestore();
var auth = firebase.auth();

// Collection references (use var for global scope)
var ambassadorsRef = db.collection('ambassadors');
var salesRef = db.collection('sales');
var notificationsRef = db.collection('notifications');
var contestsRef = db.collection('contests');
var badgesRef = db.collection('badges');
var settingsRef = db.collection('settings');

// NEW: RD & Payment System collections
var regionalDirectorsRef = db.collection('regional_directors');
var pendingPaymentsRef = db.collection('pending_payments');
var referralCodesRef = db.collection('referral_codes');

// Helper Functions
const FirebaseHelper = {
    // Generate unique ambassador code
    generateAmbassadorCode: function(firstName) {
        const cleanName = firstName.toUpperCase().replace(/[^A-Z]/g, '');
        const timestamp = Date.now().toString().slice(-3);
        return `AMB-${cleanName}-${timestamp}`;
    },

    // Get current user
    getCurrentUser: async function() {
        return new Promise((resolve) => {
            auth.onAuthStateChanged(user => {
                resolve(user);
            });
        });
    },

    // Create ambassador account
    createAmbassador: async function(data) {
        try {
            const code = this.generateAmbassadorCode(data.firstName);
            const ambassadorData = {
                ...data,
                code: code,
                status: 'pending',
                booksSold: 0,
                commissionEarned: 0,
                level: 'Starter',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await ambassadorsRef.add(ambassadorData);
            return { success: true, id: docRef.id, code: code };
        } catch (error) {
            console.error('Error creating ambassador:', error);
            return { success: false, error: error.message };
        }
    },

    // Record a sale
    recordSale: async function(saleData) {
        try {
            // Create sale record
            const sale = {
                ...saleData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                commissionPaid: false
            };
            
            const saleRef = await salesRef.add(sale);

            // Update ambassador stats
            if (saleData.referralCode) {
                await this.updateAmbassadorStats(saleData.referralCode, saleData.quantity);
            }

            return { success: true, id: saleRef.id };
        } catch (error) {
            console.error('Error recording sale:', error);
            return { success: false, error: error.message };
        }
    },

    // Update ambassador statistics
    updateAmbassadorStats: async function(code, quantity) {
        try {
            const snapshot = await ambassadorsRef.where('code', '==', code).get();
            
            if (snapshot.empty) {
                throw new Error('Ambassador not found');
            }

            const doc = snapshot.docs[0];
            const currentBooks = doc.data().booksSold || 0;
            const newTotal = currentBooks + quantity;

            // Calculate commission
            const commission = this.calculateCommission(currentBooks, newTotal);

            // Determine level
            const level = this.getLevel(newTotal);

            // Update document
            await doc.ref.update({
                booksSold: newTotal,
                commissionEarned: firebase.firestore.FieldValue.increment(commission),
                level: level,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Check for badge unlocks
            await this.checkBadgeUnlocks(doc.id, currentBooks, newTotal);

            // Send notification
            await this.createNotification(doc.id, 'sale', {
                title: 'New Sale!',
                message: `+${quantity} books sold. Total: ${newTotal}`,
                quantity: quantity
            });

            return { success: true, newTotal, commission, level };
        } catch (error) {
            console.error('Error updating stats:', error);
            return { success: false, error: error.message };
        }
    },

    // Calculate commission based on tiers
    calculateCommission: function(oldTotal, newTotal) {
        let commission = 0;
        
        for (let i = oldTotal + 1; i <= newTotal; i++) {
            if (i <= 20) {
                commission += 1500; // Tier 1
            } else if (i <= 40) {
                commission += 1800; // Tier 2
            } else if (i <= 60) {
                commission += 2000; // Tier 3
            }
            
            // Completion bonus at 60 books
            if (i === 60) {
                commission += 10000;
            }
        }
        
        return commission;
    },

    // Get ambassador level
    getLevel: function(booksSold) {
        if (booksSold >= 60) return 'Diamond';
        if (booksSold >= 45) return 'Gold';
        if (booksSold >= 30) return 'Silver';
        if (booksSold >= 15) return 'Bronze';
        return 'Starter';
    },

    // Check for badge unlocks
    checkBadgeUnlocks: async function(ambassadorId, oldTotal, newTotal) {
        const milestones = [15, 30, 45, 60];
        
        for (const milestone of milestones) {
            if (oldTotal < milestone && newTotal >= milestone) {
                // Unlock badge
                await badgesRef.add({
                    ambassadorId: ambassadorId,
                    level: this.getLevel(milestone),
                    booksRequired: milestone,
                    unlockedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Send notification
                const bonuses = { 15: 2000, 30: 5000, 45: 8000, 60: 15000 };
                await this.createNotification(ambassadorId, 'milestone', {
                    title: `${this.getLevel(milestone)} Level Unlocked!`,
                    message: `You've reached ${milestone} books! +${bonuses[milestone]} FCFA bonus!`,
                    level: this.getLevel(milestone),
                    bonus: bonuses[milestone]
                });
            }
        }
    },

    // Create notification
    createNotification: async function(ambassadorId, type, data) {
        try {
            await notificationsRef.add({
                ambassadorId: ambassadorId,
                type: type,
                ...data,
                read: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error creating notification:', error);
        }
    },

    // Get ambassador by code
    getAmbassadorByCode: async function(code) {
        try {
            const snapshot = await ambassadorsRef.where('code', '==', code).get();
            
            if (snapshot.empty) {
                return null;
            }

            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error('Error getting ambassador:', error);
            return null;
        }
    },

    // Get leaderboard
    getLeaderboard: async function(period = 'all') {
        try {
            let query = ambassadorsRef
                .where('status', '==', 'approved')
                .orderBy('booksSold', 'desc')
                .limit(50);

            const snapshot = await query.get();
            const leaders = [];
            
            snapshot.forEach((doc, index) => {
                leaders.push({
                    rank: index + 1,
                    id: doc.id,
                    ...doc.data()
                });
            });

            return leaders;
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            return [];
        }
    },

    // Get weekly contest data
    getWeeklyContest: async function() {
        try {
            // Get start of current week (Monday)
            const now = new Date();
            const dayOfWeek = now.getDay();
            const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            const monday = new Date(now.setDate(diff));
            monday.setHours(0, 0, 0, 0);

            // Get sales this week
            const salesSnapshot = await salesRef
                .where('timestamp', '>=', monday)
                .get();

            // Aggregate by ambassador
            const ambassadorSales = {};
            salesSnapshot.forEach(doc => {
                const sale = doc.data();
                if (sale.referralCode) {
                    ambassadorSales[sale.referralCode] = (ambassadorSales[sale.referralCode] || 0) + sale.quantity;
                }
            });

            // Sort and get top 10
            const sorted = Object.entries(ambassadorSales)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            // Get ambassador details
            const leaders = [];
            for (const [code, books] of sorted) {
                const ambassador = await this.getAmbassadorByCode(code);
                if (ambassador) {
                    leaders.push({
                        ...ambassador,
                        booksThisWeek: books
                    });
                }
            }

            return leaders;
        } catch (error) {
            console.error('Error getting weekly contest:', error);
            return [];
        }
    },

    // Get ambassador notifications
    getNotifications: async function(ambassadorId, limit = 10) {
        try {
            const snapshot = await notificationsRef
                .where('ambassadorId', '==', ambassadorId)
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();

            const notifications = [];
            snapshot.forEach(doc => {
                notifications.push({ id: doc.id, ...doc.data() });
            });

            return notifications;
        } catch (error) {
            console.error('Error getting notifications:', error);
            return [];
        }
    },

    // Mark notification as read
    markNotificationRead: async function(notificationId) {
        try {
            await notificationsRef.doc(notificationId).update({ read: true });
        } catch (error) {
            console.error('Error marking notification read:', error);
        }
    },

    // Get ambassador stats
    getAmbassadorStats: async function(ambassadorId) {
        try {
            const doc = await ambassadorsRef.doc(ambassadorId).get();
            
            if (!doc.exists) {
                return null;
            }

            const data = doc.data();
            
            // Get rank
            const allAmbassadors = await ambassadorsRef
                .where('status', '==', 'approved')
                .orderBy('booksSold', 'desc')
                .get();

            let rank = 1;
            allAmbassadors.forEach((d, index) => {
                if (d.id === ambassadorId) {
                    rank = index + 1;
                }
            });

            // Get recent sales
            const salesSnapshot = await salesRef
                .where('referralCode', '==', data.code)
                .orderBy('timestamp', 'desc')
                .limit(5)
                .get();

            const recentSales = [];
            salesSnapshot.forEach(doc => {
                recentSales.push({ id: doc.id, ...doc.data() });
            });

            return {
                ...data,
                id: ambassadorId,
                rank: rank,
                recentSales: recentSales
            };
        } catch (error) {
            console.error('Error getting ambassador stats:', error);
            return null;
        }
    }
};

// Export for use in other files
window.FirebaseHelper = FirebaseHelper;
window.db = db;
window.auth = auth;
