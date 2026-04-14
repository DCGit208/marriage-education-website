/**
 * SCHOOLS PAGE - Formation Journey
 * ==================================
 * Displays guided journey roadmap with lock/unlock logic
 */

let currentUserId = null;
let userTier = 'free';
let userProgress = null;

// ==================================================================
// INITIALIZATION
// ==================================================================

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '/auth';
    return;
  }
  
  currentUserId = user.uid;
  await loadUserData();
  await loadSchools();
  await updateSchoolAccess();
});

// ==================================================================
// DATA LOADING
// ==================================================================

async function loadUserData() {
  try {
    // Get user tier
    userTier = await FormationAccess.getUserTier(currentUserId);
    
    // Get user progress
    userProgress = await FormationAccess.getUserProgress(currentUserId);
    
    console.log('[Schools] User tier:', userTier);
    console.log('[Schools] User progress:', userProgress);
  } catch (error) {
    console.error('[Schools] Error loading user data:', error);
  }
}

async function loadSchools() {
  try {
    const schoolsSnapshot = await firebase.firestore()
      .collection('schools')
      .orderBy('order', 'asc')
      .get();
    
    if (schoolsSnapshot.empty) {
      console.warn('[Schools] No schools found in database');
      return;
    }
    
    console.log(`[Schools] Loaded ${schoolsSnapshot.size} schools from Firestore`);
    
    // Render schools
    const mainContainer = document.querySelector('.schools-main');
    mainContainer.innerHTML = ''; // Clear existing content
    
    schoolsSnapshot.forEach((doc) => {
      const school = doc.data();
      const section = createSchoolSection(school);
      mainContainer.appendChild(section);
    });
    
  } catch (error) {
    console.error('[Schools] Error loading schools:', error);
  }
}

function createSchoolSection(school) {
  const section = document.createElement('section');
  section.className = 'journey-section';
  
  // Get icon (fallback to default)
  const icon = school.icon || '🎓';
  
  section.innerHTML = `
    <h2 class="journey-section-title">${school.name}</h2>
    
    <div class="school-card" data-school-id="${school.id}">
      <span class="school-icon">${icon}</span>
      <h3 class="school-name">${school.name}</h3>
      <p class="school-description">
        ${school.description || ''}
      </p>
      <div class="school-meta">
        <span>${school.totalCourses || 0} courses</span>
        ${school.portfolioValue ? `<span>$${school.portfolioValue.toLocaleString()}</span>` : ''}
      </div>
      <button class="btn btn-primary" onclick="openSchool('${school.id}')">
        Explore School
      </button>
      <div class="unlock-requirement">
        🔒 Requires ${school.unlockTier || 'premium'} tier
      </div>
    </div>
  `;
  
  return section;
}

// ==================================================================
// ACCESS CONTROL
// ==================================================================

async function updateSchoolAccess() {
  const schools = document.querySelectorAll('.school-card');
  
  for (const schoolCard of schools) {
    const schoolId = schoolCard.dataset.schoolId;
    const canAccess = await FormationAccess.canAccessSchool(currentUserId, schoolId);
    
    if (canAccess) {
      schoolCard.classList.remove('locked');
    } else {
      schoolCard.classList.add('locked');
    }
  }
}

// ==================================================================
// SCHOOL OPENING
// ==================================================================

async function openSchool(schoolId) {
  const canAccess = await FormationAccess.canAccessSchool(currentUserId, schoolId);
  
  if (!canAccess) {
    // Show paywall
    showPaywall(schoolId);
    return;
  }
  
  // Redirect to courses page for this school
  window.location.href = `/courses.html?school=${schoolId}`;
}

// ==================================================================
// PAYWALL
// ==================================================================

function showPaywall(schoolId) {
  // Get school data
  const schoolCard = document.querySelector(`[data-school-id="${schoolId}"]`);
  const schoolName = schoolCard.querySelector('.school-name').textContent;
  
  // Determine required tier
  let requiredTier = 'premium';
  if (schoolId === 'muliebrity' || schoolId === 'virility') {
    requiredTier = 'elite';
  } else if (schoolId === 'sexual-literacy') {
    requiredTier = 'premium';
  } else if (schoolId === 'teleios') {
    requiredTier = 'foundation';
  }
  
  // Show paywall modal
  FormationAccess.showPaywallModal({
    title: `Unlock ${schoolName}`,
    message: `This school requires a ${requiredTier} subscription.`,
    requiredTier: requiredTier,
    currentTier: userTier
  });
}

// ==================================================================
// BACK BUTTON
// ==================================================================

document.querySelector('.back-btn')?.addEventListener('click', () => {
  window.history.back();
});

console.log('[Schools] Page loaded');
