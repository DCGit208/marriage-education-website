// Tier Page - Shows schools INSIDE a specific tier
// Handles tier-specific school display and access control

let tierCurrentUser = null;
let userTier = 'free';
let userProgress = {};
let enrolledCourses = [];
let currentTierView = 'foundation'; // foundation, premium, elite

// Get tier from URL parameter
const urlParams = new URLSearchParams(window.location.search);
currentTierView = urlParams.get('tier') || 'foundation';

// Initialize
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    tierCurrentUser = user;
    await loadUserData();
    await initializeTierView();
  } else {
    window.location.href = '/login.html';
  }
});

async function loadUserData() {
  try {
    const userDoc = await firebase.firestore()
      .collection('users')
      .doc(tierCurrentUser.uid)
      .get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      userTier = userData.tier || 'free';
      userProgress = userData.progress || {};
      enrolledCourses = userData.enrolledCourses || [];
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

async function initializeTierView() {
  // Check if user has access to this tier
  const hasAccess = checkTierAccess(currentTierView);
  
  if (!hasAccess && userTier !== currentTierView) {
    // Redirect to payment page with tier parameter
    window.location.href = `/payment.html?tier=${currentTierView}`;
    return;
  }
  
  // Configure tier header
  configureTierHeader(currentTierView);
  
  // Load schools for this tier
  await loadSchoolsForTier(currentTierView);
}

function checkTierAccess(tier) {
  const tierHierarchy = { free: 0, foundation: 1, premium: 2, elite: 3 };
  
  // Free users can't access any paid tier
  if (userTier === 'free') return false;
  
  // Check if user's tier is >= tier being viewed
  return tierHierarchy[userTier] >= tierHierarchy[tier];
}

function configureTierHeader(tier) {
  const tierConfigs = {
    foundation: {
      icon: '🟢',
      name: 'Foundation',
      tagline: 'Start Your Journey',
      color: 'linear-gradient(135deg, #00b09b 0%, #96c93d 100%)',
      description: 'Begin your formation with essential modules across all four schools. This tier gives you a solid foundation in Teleios identity, sexual literacy basics, marriage systems introduction, and civilization leadership preview.',
      accessDetails: [
        '🏛️ Teleios — Modules 1-3 (Foundation of identity)',
        '🔥 Sexual Literacy — SBD For Dummies (partial access)',
        '💍 Marriage Systems — Introduction module',
        '🏛️ Civilization Leadership — Preview content'
      ]
    },
    premium: {
      icon: '🔵',
      name: 'Premium',
      tagline: 'Unlock Full System',
      color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      description: 'Complete access to all 44 courses across all four formation schools. Master the full SBD system with unrestricted access to every module, lesson, and resource.',
      accessDetails: [
        '🏛️ Teleios — Full access (all modules)',
        '🔥 Sexual Literacy — Full access (all courses)',
        '💍 Marriage Systems — Full access (all modules)',
        '🏛️ Civilization Leadership — Full access (all content)'
      ]
    },
    elite: {
      icon: '🔴',
      name: 'Elite',
      tagline: 'Embody & Express',
      color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      description: 'Mastery level with full system access PLUS MV House expression system, advanced discussion boards, and exclusive elite community features.',
      accessDetails: [
        '🏛️ All Schools — Full access (everything)',
        '👗 MV House — Full expression system',
        '📋 Advanced Boards — Elite community',
        '✨ Exclusive Features — Priority support & coaching'
      ]
    }
  };
  
  const config = tierConfigs[tier] || tierConfigs.foundation;
  
  // Update header
  const header = document.getElementById('tierHeader');
  header.style.background = config.color;
  
  document.getElementById('tierIcon').textContent = config.icon;
  document.getElementById('tierName').textContent = config.name;
  document.getElementById('tierTagline').textContent = config.tagline;
  
  // Update description
  document.getElementById('tierDescriptionText').textContent = config.description;
  
  // Update access details
  const accessDetailsContainer = document.getElementById('tierAccessDetails');
  accessDetailsContainer.innerHTML = config.accessDetails.map(detail => 
    `<div class="access-detail-item">${detail}</div>`
  ).join('');
  
  // Update progress summary
  updateTierProgress(tier);
}

function updateTierProgress(tier) {
  const summaryEl = document.getElementById('tierProgressSummary');
  
  // Calculate progress for this tier
  const enrolledInTier = enrolledCourses.length;
  
  if (enrolledInTier === 0) {
    summaryEl.innerHTML = '<p>Ready to begin your formation journey</p>';
  } else {
    summaryEl.innerHTML = `
      <p>${enrolledInTier} courses active in this tier</p>
    `;
  }
}

async function loadSchoolsForTier(tier) {
  try {
    const schoolsSnapshot = await firebase.firestore()
      .collection('schools')
      .orderBy('order', 'asc')
      .get();
    
    const schoolsGrid = document.getElementById('schoolsGrid');
    schoolsGrid.innerHTML = '';
    
    for (const doc of schoolsSnapshot.docs) {
      const school = { id: doc.id, ...doc.data() };
      const schoolCard = await createSchoolCard(school, tier);
      schoolsGrid.appendChild(schoolCard);
    }
  } catch (error) {
    console.error('Error loading schools:', error);
    const schoolsGrid = document.getElementById('schoolsGrid');
    schoolsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #666;">
        Error loading schools. Please refresh the page.
      </div>
    `;
  }
}

async function createSchoolCard(school, tier) {
  const card = document.createElement('div');
  card.className = 'school-card';
  
  // Get access level for this school in this tier
  const accessLevel = getSchoolAccessLevelInTier(school.id, tier);
  
  // Check if user has progress in this school
  const hasProgress = await checkSchoolProgress(school.id);
  
  // Build status indicator
  let statusHTML = '';
  if (hasProgress.inProgress) {
    statusHTML = `
      <div class="school-status in-progress">
        <span class="status-icon">✔</span>
        <span class="status-text">In Progress</span>
      </div>
    `;
  } else if (accessLevel === 'LOCKED') {
    statusHTML = `
      <div class="school-status locked">
        <span class="status-icon">🔒</span>
        <span class="status-text">Not included in this tier</span>
      </div>
    `;
  } else if (accessLevel === 'PARTIAL') {
    statusHTML = `
      <div class="school-status partial">
        <span class="status-icon">🔓</span>
        <span class="status-text">Partial access in this tier</span>
      </div>
    `;
  } else {
    statusHTML = `
      <div class="school-status full">
        <span class="status-icon">✨</span>
        <span class="status-text">Full access</span>
      </div>
    `;
  }
  
  card.innerHTML = `
    <div class="school-header">
      <div class="school-icon">${school.icon || '🏛️'}</div>
      <div class="school-info">
        <h3>${school.name}</h3>
        <p class="school-desc">${school.description}</p>
      </div>
    </div>
    
    ${statusHTML}
    
    <button class="btn-explore" 
            onclick="exploreSchool('${school.id}')" 
            data-access="${accessLevel}"
            ${accessLevel === 'LOCKED' ? 'disabled' : ''}>
      ${hasProgress.inProgress ? '▶ Continue' : 
        accessLevel === 'LOCKED' ? 'Not Available' : 
        'Begin Journey'}
    </button>
  `;
  
  if (accessLevel === 'LOCKED') {
    card.classList.add('locked');
  } else if (accessLevel === 'PARTIAL') {
    card.classList.add('partial');
  }
  
  return card;
}

// Get access level for a school within a specific tier
function getSchoolAccessLevelInTier(schoolId, tier) {
  // Access rules per tier
  const tierAccessRules = {
    foundation: {
      'school-1-teleios': 'PARTIAL',           // Modules 1-3
      'school-2-sexual-literacy': 'PARTIAL',   // SBD partial
      'school-3-marriage-systems': 'PARTIAL',  // Intro only
      'school-4-civilization-leadership': 'PARTIAL' // Preview
    },
    premium: {
      'school-1-teleios': 'FULL',
      'school-2-sexual-literacy': 'FULL',
      'school-3-marriage-systems': 'FULL',
      'school-4-civilization-leadership': 'FULL'
    },
    elite: {
      'school-1-teleios': 'FULL',
      'school-2-sexual-literacy': 'FULL',
      'school-3-marriage-systems': 'FULL',
      'school-4-civilization-leadership': 'FULL'
    }
  };
  
  const tierRules = tierAccessRules[tier];
  if (!tierRules) return 'LOCKED';
  
  return tierRules[schoolId] || 'LOCKED';
}

async function checkSchoolProgress(schoolId) {
  try {
    // Check if any courses in this school are in progress
    const coursesSnapshot = await firebase.firestore()
      .collection('courses')
      .where('schoolId', '==', schoolId)
      .get();
    
    for (const courseDoc of coursesSnapshot.docs) {
      const courseId = courseDoc.id;
      if (enrolledCourses.includes(courseId)) {
        return { inProgress: true, courseId };
      }
    }
    
    return { inProgress: false };
  } catch (error) {
    console.error('Error checking school progress:', error);
    return { inProgress: false };
  }
}

function exploreSchool(schoolId) {
  window.location.href = `/school.html?id=${schoolId}&tier=${currentTierView}`;
}
