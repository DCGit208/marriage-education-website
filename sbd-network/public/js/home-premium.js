/* ============================================
   PREMIUM HOME - DYNAMIC SYSTEM
   ============================================ */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentUser = null;

// ============================================
// AUTH STATE
// ============================================

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '/';
    return;
  }
  
  currentUser = user;
  await loadUserData();
});

// ============================================
// LOAD USER DATA
// ============================================

async function loadUserData() {
  try {
    // Get user profile
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const userData = userDoc.data();
    
    // Get current tier
    const tier = userData?.tier || 'free';
    
    // Update tier display
    updateTierDisplay(tier);
    
    // Load progress
    await loadProgress();
    
    // Update path based on tier
    updateSystemPath(tier);
    
    // Load personalized state
    updateUserState(userData);
    
  } catch (error) {
    console.error('[Home Premium] Error loading user data:', error);
  }
}

// ============================================
// UPDATE TIER DISPLAY
// ============================================

function updateTierDisplay(tier) {
  const tierMap = {
    'free': { label: 'Free', index: 0 },
    'foundation': { label: 'Foundation', index: 1 },
    'premium': { label: 'Premium', index: 2 },
    'elite': { label: 'Elite', index: 3 }
  };
  
  const currentTier = tierMap[tier] || tierMap.free;
  
  // Update tier progression visual
  const tierNodes = document.querySelectorAll('.tier-node');
  tierNodes.forEach((node, index) => {
    if (index === currentTier.index) {
      node.classList.add('active');
    } else {
      node.classList.remove('active');
    }
  });
  
  // Update state card tier label
  const stateTier = document.querySelector('.state-tier');
  if (stateTier) {
    stateTier.textContent = currentTier.label;
  }
}

// ============================================
// UPDATE SYSTEM PATH
// ============================================

function updateSystemPath(tier) {
  const stages = document.querySelectorAll('.stage-card');
  
  // Teleios always active
  stages[0]?.classList.remove('locked');
  stages[0]?.classList.add('active');
  
  // Sexual Literacy - Foundation+
  if (tier === 'foundation' || tier === 'premium' || tier === 'elite') {
    stages[1]?.classList.remove('locked');
  } else {
    stages[1]?.classList.add('locked');
  }
  
  // Marriage Systems - Premium+
  if (tier === 'premium' || tier === 'elite') {
    stages[2]?.classList.remove('locked');
  } else {
    stages[2]?.classList.add('locked');
  }
  
  // MV House - Elite only
  if (tier === 'elite') {
    stages[3]?.classList.remove('locked');
  } else {
    stages[3]?.classList.add('locked');
  }
}

// ============================================
// LOAD PROGRESS
// ============================================

async function loadProgress() {
  try {
    // Get user progress from Firestore
    const progressDoc = await getDoc(doc(db, 'userProgress', currentUser.uid));
    
    if (progressDoc.exists()) {
      const progressData = progressDoc.data();
      
      // Calculate overall completion
      const completed = progressData.completedLessons?.length || 0;
      const total = 8; // Teleios has 8 lessons (example)
      const percent = Math.round((completed / total) * 100);
      
      // Update progress ring
      updateProgressRing(percent);
      
      // Update progress details
      const progressDetail = document.getElementById('progressDetail');
      if (progressDetail) {
        progressDetail.textContent = `${completed} of ${total} lessons complete`;
      }
    } else {
      // No progress yet
      updateProgressRing(0);
    }
    
  } catch (error) {
    console.error('[Home Premium] Error loading progress:', error);
  }
}

// ============================================
// UPDATE PROGRESS RING
// ============================================

function updateProgressRing(percent) {
  const circle = document.getElementById('progressCircle');
  const percentText = document.getElementById('progressPercent');
  
  if (!circle || !percentText) return;
  
  const radius = 34;
  const circumference = 2 * Math.PI * radius; // 213.6
  const offset = circumference - (percent / 100) * circumference;
  
  circle.style.strokeDashoffset = offset;
  percentText.textContent = `${percent}%`;
}

// ============================================
// UPDATE USER STATE
// ============================================

function updateUserState(userData) {
  // Update current stage title
  const stateCurrent = document.querySelector('.state-current');
  if (stateCurrent) {
    const stage = userData?.currentStage || 'Teleios';
    stateCurrent.textContent = `${stage} — Identity Formation`;
  }
}

// ============================================
// CLICK HANDLERS
// ============================================

// Begin Formation CTA
document.getElementById('beginFormation')?.addEventListener('click', () => {
  window.location.href = '/learn.html';
});

// Continue Button
document.getElementById('continueBtn')?.addEventListener('click', () => {
  window.location.href = '/learn.html';
});

// Stage Cards - Click to navigate
document.querySelectorAll('.stage-card:not(.locked)').forEach(card => {
  card.addEventListener('click', () => {
    const stage = card.dataset.stage;
    
    if (stage === 'teleios') {
      window.location.href = '/learn.html?school=teleios';
    } else if (stage === 'sexual-literacy') {
      window.location.href = '/learn.html?school=sexual-literacy';
    } else if (stage === 'marriage-systems') {
      window.location.href = '/learn.html?school=marriage-systems';
    } else if (stage === 'mv-house') {
      window.location.href = '/mv-house.html';
    }
  });
  
  card.style.cursor = 'pointer';
});

// Desire Cards - Show upgrade modal (future)
document.querySelectorAll('.desire-card').forEach(card => {
  card.addEventListener('click', () => {
    // Show tier upgrade modal
    alert('Upgrade to unlock this section');
    // TODO: Implement premium upgrade modal
  });
  
  card.style.cursor = 'pointer';
});

console.log('[Home Premium] Loaded');
