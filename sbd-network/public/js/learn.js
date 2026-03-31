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
  
  // Check if user has ANY access to this school (even partial)
  const accessLevel = getSchoolAccessLevel(school.id, userTier);
  
  // Check if user has any progress in this school
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
        <span class="status-text">Unlock with ${school.unlockTier || 'Premium'}</span>
      </div>
    `;
  } else if (accessLevel === 'PARTIAL') {
    statusHTML = `
      <div class="school-status partial">
        <span class="status-icon">🔓</span>
        <span class="status-text">Limited access - upgrade for full</span>
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
    
    <button class="btn-explore" onclick="exploreSchool('${school.id}')" 
            data-access="${accessLevel}">
      ${hasProgress.inProgress ? '▶ Continue' : 
        accessLevel === 'LOCKED' ? 'View Preview' : 
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

// Get access level: 'FULL', 'PARTIAL', 'LOCKED'
function getSchoolAccessLevel(schoolId, tier) {
  // School-specific access rules
  const schoolRules = {
    'school-1-teleios': {
      free: 'PARTIAL',      // Intro only
      foundation: 'PARTIAL', // First modules
      premium: 'FULL',
      elite: 'FULL'
    },
    'school-2-sexual-literacy': {
      free: 'PARTIAL',      // Intro only
      foundation: 'PARTIAL', // 20-30%
      premium: 'FULL',
      elite: 'FULL'
    },
    'school-3-marriage-systems': {
      free: 'LOCKED',        // Hidden/teaser
      foundation: 'PARTIAL', // Intro only
      premium: 'FULL',
      elite: 'FULL'
    },
    'school-4-civilization-leadership': {
      free: 'LOCKED',        // Teaser
      foundation: 'PARTIAL', // Teaser
      premium: 'FULL',
      elite: 'FULL'
    }
  };
  
  const rule = schoolRules[schoolId];
  if (!rule) return 'LOCKED';
  
  return rule[tier] || 'LOCKED';
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
  window.location.href = `/school.html?id=${schoolId}`;
}
