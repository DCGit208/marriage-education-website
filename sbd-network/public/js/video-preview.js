/**
 * VIDEO PREVIEW SYSTEM
 * ====================
 * 
 * Handles video preview mode with time limits and upgrade prompts.
 * Integrates with formation-access.js for tier checking.
 */

// ==================================================================
// VIDEO PREVIEW STATE
// ==================================================================

const videoPreviewState = {
    previewDuration: 300, // 5 minutes in seconds (default)
    currentTime: 0,
    isLocked: false,
    videoElement: null,
    overlayElement: null
};

// ==================================================================
// INITIALIZE VIDEO PREVIEW
// ==================================================================

/**
 * Initialize video preview mode
 * @param {string} videoId - ID of the  video element
 * @param {number} previewSeconds - How many seconds to allow preview (default: 300 = 5 min)
 * @param {string} requiredTier - Required tier for full access (default: 'foundation')
 */
async function initVideoPreview(videoId, previewSeconds = 300, requiredTier = 'foundation') {
    try {
        const videoElement = document.getElementById(videoId);
        const overlayElement = document.querySelector('.video-locked-overlay');
        
        if (!videoElement) {
            console.error('[VideoPreview] Video element not found:', videoId);
            return;
        }
        
        // Store state
        videoPreviewState.videoElement = videoElement;
        videoPreviewState.overlayElement = overlayElement;
        videoPreviewState.previewDuration = previewSeconds;
        
        // Check if user has access
        const hasAccess = await checkVideoAccess(requiredTier);
        
        if (hasAccess) {
            // Full access - remove preview restrictions
            enableFullAccess();
            return;
        }
        
        // Preview mode - set up restrictions
        enablePreviewMode();
        
    } catch (error) {
        console.error('[VideoPreview] Error initializing:', error);
    }
}

/**
 * Check if user has full video access
 */
async function checkVideoAccess(requiredTier) {
    try {
        // Check if user is authenticated
        const user = firebase.auth().currentUser;
        if (!user) return false;
        
        // Get user tier from formation-access.js
        if (typeof getUserTier === 'function') {
            const userTier = await getUserTier(user.uid);
            
            // Check if user tier is sufficient
            if (typeof hasSufficientTier === 'function') {
                return hasSufficientTier(userTier, requiredTier);
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('[VideoPreview] Error checking access:', error);
        return false;
    }
}

// ==================================================================
// FULL ACCESS MODE
// ==================================================================

/**
 * Enable full access to video (no restrictions)
 */
function enableFullAccess() {
    // Hide preview badge
    const previewBadge = document.querySelector('.video-preview-badge');
    if (previewBadge) {
        previewBadge.style.display = 'none';
    }
    
    // Hide time remaining
    const timeRemaining = document.querySelector('.video-time-remaining');
    if (timeRemaining) {
        timeRemaining.style.display = 'none';
    }
    
    // Hide progress bar
    const progressBar = document.querySelector('.preview-progress-bar');
    if (progressBar) {
        progressBar.style.display = 'none';
    }
    
    // Ensure overlay is hidden
    if (videoPreviewState.overlayElement) {
        videoPreviewState.overlayElement.classList.remove('active');
    }
    
    console.log('[VideoPreview] Full access enabled');
}

// ==================================================================
// PREVIEW MODE
// ==================================================================

/**
 * Enable preview mode with time restrictions
 */
function enablePreviewMode() {
    const video = videoPreviewState.videoElement;
    if (!video) return;
    
    // Show preview indicators
    const previewBadge = document.querySelector('.video-preview-badge');
    if (previewBadge) {
        previewBadge.style.display = 'block';
    }
    
    const timeRemaining = document.querySelector('.video-time-remaining');
    if (timeRemaining) {
        timeRemaining.style.display = 'block';
        updateTimeRemaining(videoPreviewState.previewDuration);
    }
    
    const progressBar = document.querySelector('.preview-progress-bar');
    if (progressBar) {
        progressBar.style.display = 'block';
    }
    
    // Listen to video time updates
    video.addEventListener('timeupdate', handleTimeUpdate);
    
    // Listen to seeking (prevent skipping ahead in preview)
    video.addEventListener('seeking', handleSeeking);
    
    // Prevent right-click download
    video.addEventListener('contextmenu', (e) => e.preventDefault());
    
    console.log('[VideoPreview] Preview mode enabled:', videoPreviewState.previewDuration, 'seconds');
}

/**
 * Handle video time update
 */
function handleTimeUpdate(event) {
    const video = event.target;
    const currentTime = Math.floor(video.currentTime);
    
    // Update state
    videoPreviewState.currentTime = currentTime;
    
    // Update time remaining display
    const timeLeft = videoPreviewState.previewDuration - currentTime;
    updateTimeRemaining(timeLeft);
    
    // Update progress bar
    updateProgressBar(currentTime);
    
    // Check if preview time is up
    if (currentTime >= videoPreviewState.previewDuration && !videoPreviewState.isLocked) {
        lockVideo();
    }
}

/**
 * Prevent seeking beyond preview duration
 */
function handleSeeking(event) {
    const video = event.target;
    
    if (video.currentTime > videoPreviewState.previewDuration) {
        video.currentTime = videoPreviewState.previewDuration;
        lockVideo();
    }
}

/**
 * Update time remaining display
 */
function updateTimeRemaining(seconds) {
    const timeRemaining = document.querySelector('.video-time-remaining');
    if (!timeRemaining) return;
    
    if (seconds <= 0) {
        timeRemaining.textContent = 'Preview ended';
        timeRemaining.style.background = 'rgba(255, 0, 0, 0.8)';
        return;
    }
    
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timeRemaining.textContent = `${minutes}:${secs.toString().padStart(2, '0')} preview left`;
    
    // Warning color when < 30 seconds left
    if (seconds < 30) {
        timeRemaining.style.background = 'rgba(255, 165, 0, 0.9)';
    }
}

/**
 * Update preview progress bar
 */
function updateProgressBar(currentTime) {
    const progressFill = document.querySelector('.preview-progress-fill');
    if (!progressFill) return;
    
    const percentage = (currentTime / videoPreviewState.previewDuration) * 100;
    progressFill.style.width = Math.min(percentage, 100) + '%';
}

/**
 * Lock video and show upgrade prompt
 */
function lockVideo() {
    const video = videoPreviewState.videoElement;
    const overlay = videoPreviewState.overlayElement;
    
    if (!video || !overlay) return;
    
    // Mark as locked
    videoPreviewState.isLocked = true;
    
    // Pause video
    video.pause();
    
    // Show overlay
    overlay.classList.add('active');
    
    // Update time remaining
    updateTimeRemaining(0);
    
    console.log('[VideoPreview] Video locked - preview time exceeded');
}

// ==================================================================
// UNLOCK ACTIONS
// ==================================================================

/**
 * Handle unlock button click
 */
function unlockVideo() {
    // Trigger paywall modal from formation-access.js
    if (typeof showPaywallModal === 'function') {
        showPaywallModal();
    } else {
        // Fallback to checkout page
        window.location.href = '/checkout.html?product=foundation-monthly';
    }
}

// ==================================================================
// UTILITY FUNCTIONS
// ==================================================================

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get video duration
 */
function getVideoDuration(videoElement) {
    return Math.floor(videoElement.duration || 0);
}

// ==================================================================
// CLEANUP
// ==================================================================

/**
 * Clean up event listeners (call when navigating away)
 */
function cleanupVideoPreview() {
    const video = videoPreviewState.videoElement;
    if (video) {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('seeking', handleSeeking);
    }
    
    // Reset state
    videoPreviewState.currentTime = 0;
    videoPreviewState.isLocked = false;
    videoPreviewState.videoElement = null;
    videoPreviewState.overlayElement = null;
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanupVideoPreview);
