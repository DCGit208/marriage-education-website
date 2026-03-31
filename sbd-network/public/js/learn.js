// Learn Page - Phase 1 Learning Core
// Handles school display, user progress, and tier-based access

let learnCurrentUser = null;
let userTier = 'free';
let userProgress = {};
let userStreak = 0;
let enrolledCourses = [];

// Initialize
firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    learnCurrentUser = user;
    await loadUserData();
    await loadSchools();
    await loadContinueLearning();
  } else {
    window.location.href = '/login.html';
  }
});

async function loadUserData() {
  try {
    const userDoc = await firebase.firestore()
      .collection('users')
      .doc(learnCurrentUser.uid)
      .get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      userTier = userData.tier || 'free';
      userProgress = userData.progress || {};
      userStreak = userData.streak || 0;
      enrolledCourses = userData.enrolledCourses || [];
      
      // Update UI
      updateTierBadge(userTier);
      updateProgressSummary(userData);
      updateStreak(userStreak);
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

function updateTierBadge(tier) {
  const badge = document.getElementById('tierBadge');
  const tierMap = {
    free: { text: 'Free', color: '#6c757d' },
    foundation: { text: 'Foundation', color: '#ffc107' },
    premium: { text: 'Premium', color: '#007bff' },
    elite: { text: 'Elite', color: '#dc3545' }
  };
  
  const tierInfo = tierMap[tier] || tierMap.free;
  badge.textContent = tierInfo.text;
  badge.style.background = tierInfo.color;
}

function updateProgressSummary(userData) {
  const enrolledCount = enrolledCourses.length;
  const completedModules = Object.keys(userProgress).filter(key => userProgress[key] === 100).length;
  const totalModules = enrolledCount * 6; // Average 6 modules per course
  const percentComplete = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;
  
  document.getElementById('progressSummary').textContent = 
    `${enrolledCount} courses active, ${percentComplete}% complete`;
}

function updateStreak(streak) {
  document.getElementById('userStreak').textContent = streak;
}

async function loadContinueLearning() {
  try {
    // Find last accessed module
    const userDoc = await firebase.firestore()
      .collection('users')
      .doc(learnCurrentUser.uid)
      .get();
    
    const lastModuleId = userDoc.data()?.lastAccessedModule;
    
    if (lastModuleId) {
      const moduleDoc = await firebase.firestore()
        .collection('modules')
        .doc(lastModuleId)
        .get();
      
      if (moduleDoc.exists) {
        const module = moduleDoc.data();
        const courseDoc = await firebase.firestore()
          .collection('courses')
          .doc(module.courseId)
          .get();
        
        if (courseDoc.exists) {
          const course = courseDoc.data();
          
          // Show continue section
          document.getElementById('continueSection').style.display = 'block';
          document.getElementById('currentCourseName').textContent = course.title;
          document.getElementById('currentModuleName').textContent = module.title;
          
          // Calculate progress
          const progress = userProgress[module.courseId] || 0;
          document.getElementById('currentProgress').style.width = progress + '%';
          
          // Store for continue button
          window.continueModuleId = lastModuleId;
        }
      }
    }
  } catch (error) {
    console.error('Error loading continue learning:', error);
  }
}

function continueModule() {
  if (window.continueModuleId) {
    window.location.href = `/lesson.html?moduleId=${window.continueModuleId}`;
  }
}

async function loadSchools() {
  try {
    const schoolsSnapshot = await firebase.firestore()
      .collection('schools')
      .orderBy('order', 'asc')
      .get();
    
    const schoolsGrid = document.getElementById('schoolsGrid');
    schoolsGrid.innerHTML = '';
    
    for (const doc of schoolsSnapshot.docs) {
      const school = doc.data();
      const schoolCard = await createSchoolCard(school);
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

async function createSchoolCard(school) {
  const card = document.createElement('div');
  card.className = 'school-card';
  
  // Check if user has access to this school
  const hasAccess = checkSchoolAccess(school.id, userTier);
  
  // Get courses for this school
  const coursesSnapshot = await firebase.firestore()
    .collection('courses')
    .where('schoolId', '==', school.id)
    .get();
  
  const courseCount = coursesSnapshot.size;
  
  card.innerHTML = `
    <div class="school-header">
      <div class="school-icon">${school.icon || '🏛️'}</div>
      <div class="school-info">
        <h3>${school.name}</h3>
        <p class="school-desc">${school.description}</p>
      </div>
    </div>
    
    <div class="school-meta">
      <span class="course-count">${courseCount} courses</span>
      <span class="school-value">$${school.portfolioValue.toLocaleString()} value</span>
    </div>
    
    ${!hasAccess ? `
      <div class="lock-badge">
        🔒 ${school.unlockTier === 'foundation' ? 'Foundation' : 
             school.unlockTier === 'premium' ? 'Premium' : 
             school.unlockTier === 'elite' ? 'Elite' : 'Premium'} Required
      </div>
    ` : ''}
    
    <button class="btn-explore" onclick="exploreSchool('${school.id}')">
      ${hasAccess ? 'Explore Courses' : 'View Curriculum'}
    </button>
  `;
  
  if (!hasAccess) {
    card.classList.add('locked');
  }
  
  return card;
}

function checkSchoolAccess(schoolId, tier) {
  const tierHierarchy = { free: 0, foundation: 1, premium: 2, elite: 3 };
  
  // School access mapping (from Phase 0 database)
  const schoolAccessMap = {
    'school-1-teleios': 'free',        // Foundation School - always accessible
    'school-2-sexual-literacy': 'foundation', // Requires Foundation+
    'school-3-marriage-systems': 'premium',   // Requires Premium+
    'school-4-civilization-leadership': 'premium' // Requires Premium+
  };
  
  const requiredTier = schoolAccessMap[schoolId] || 'premium';
  return tierHierarchy[tier] >= tierHierarchy[requiredTier];
}

function exploreSchool(schoolId) {
  window.location.href = `/school.html?id=${schoolId}`;
}
