/**
 * AuthService - Centralized Authentication Logic for Marriage Education Platform
 * 
 * Handles:
 * - Login/Logout
 * - Session Management
 * - Firestore Listener Cleanup (prevents "permission-denied" errors on logout)
 * - User Role Verification
 */

class AuthService {
    constructor() {
        this.unsubscribeFunctions = []; // Store listener unsubscribe functions here
        this.auth = null;
        this.db = null;
        
        this.init();
    }

    init() {
        // Wait for Firebase to be ready
        if (typeof firebase !== 'undefined' && firebase.auth && firebase.firestore) {
            this.auth = firebase.auth();
            this.db = firebase.firestore();
            console.log("✅ AuthService initialized");
        } else {
            console.error("❌ Firebase SDK not loaded. Make sure firebase-app.js, auth.js, and firestore.js are included BEFORE this file.");
        }
    }

    /**
     * Log in a user with email and password
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<UserCredential>}
     */
    async login(email, password) {
        if (!this.auth) this.init();
        try {
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            console.log(`✅ User logged in: ${userCredential.user.email}`);
            return userCredential;
        } catch (error) {
            console.error("❌ Login failed:", error);
            throw error;
        }
    }

    /**
     * Logs out the current user and cleans up all listeners
     * @returns {Promise<void>}
     */
    async logout() {
        if (!this.auth) this.init();
        
        console.log("🔒 Logging out...");

        // 1. Unsubscribe from all Firestore listeners to prevent errors
        this.cleanupListeners();

        // 2. Sign out
        try {
            await this.auth.signOut();
            
            // 3. Clear only admin session storage (do NOT clear localStorage — ambassador sessions live there)
            sessionStorage.removeItem('adminAuthenticated');

            console.log("✅ Logout complete");
            // Optional: Redirect to login page calls
        } catch (error) {
            console.error("❌ Logout error:", error);
            throw error;
        }
    }

    /**
     * Register a listener unsubscribe function to be called on logout
     * @param {Function} unsubscribeFunc 
     */
    registerListener(unsubscribeFunc) {
        if (typeof unsubscribeFunc === 'function') {
            this.unsubscribeFunctions.push(unsubscribeFunc);
        }
    }

    /**
     * Execute all unsubscribe functions
     */
    cleanupListeners() {
        console.log(`🧹 Cleaning up ${this.unsubscribeFunctions.length} listeners...`);
        this.unsubscribeFunctions.forEach(unsubscribe => {
            try {
                unsubscribe();
            } catch (e) {
                console.warn("⚠️ Error creating listener:", e);
            }
        });
        this.unsubscribeFunctions = [];
    }

    /**
     * Monitor authentication state
     * @param {Function} callback (user) => void
     */
    onAuthStateChanged(callback) {
        if (!this.auth) this.init();
        return this.auth.onAuthStateChanged(callback);
    }

    /**
     * Get current user
     */
    get currentUser() {
        return this.auth ? this.auth.currentUser : null;
    }
}

// Export a singleton instance
const authService = new AuthService();
window.authService = authService; // Make it globally available for legacy scripts
