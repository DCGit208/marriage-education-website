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
  // TIER-BASED MODEL: Load tiers instead of schools
  loadTiers();
}

async function loadTiers() {
  try {
    const tiersGrid = document.getElementById('tiersGrid');
    tiersGrid.innerHTML = '';
    
    // Define tier structure
    const tiers = [
      {
        id: 'foundation',
        name: 'Foundation',
        tagline: 'Start Your Journey',
        description: 'Begin formation with essential modules across all schools',
        price: '$9/month',
        icon: '🟢',
        color: 'linear-gradient(135deg, #00b09b 0%, #96c93d 100%)',
        access: 'Partial access to Teleios, Sexual Literacy, Marriage Systems intro, Civilization preview'
      },
      {
        id: 'premium',
        name: 'Premium',
        tagline: 'Unlock Full System',
        description: 'Complete access to all 44 courses across all schools',
        price: '$20/month',
        icon: '🔵',
        color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        access: 'Full access to all schools'
      },
      {
        id: 'elite',
        name: 'Elite',
        tagline: 'Embody & Express',
        description: 'Mastery + MV House + Advanced boards + Expression system',
        price: '$50/month',
        icon: '🔴',
        color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        access: 'Everything + MV House + Advanced features'
      }
    ];
    
    for (const tier of tiers) {
      const tierCard = createTierCard(tier);
      tiersGrid.appendChild(tierCard);
    }
  } catch (error) {
    console.error('Error loading tiers:', error);
    const tiersGrid = document.getElementById('tiersGrid');
    tiersGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #666;">
        Error loading tiers. Please refresh the page.
      </div>
    `;
  }
}

function createTierCard(tier) {
  const card = document.createElement('div');
  card.className = 'tier-card';
  
  // Check if user has access to this tier
  const hasAccess = checkTierAccess(tier.id, userTier);
  const isCurrentTier = userTier === tier.id;
  
  card.innerHTML = `
    <div class="tier-icon">${tier.icon}</div>
    <h3 class="tier-name">${tier.name}</h3>
    <p class="tier-tagline">${tier.tagline}</p>
    <p class="tier-price">${tier.price}</p>
    <p class="tier-description">${tier.description}</p>
    
    <div class="tier-access-info">
      <small>${tier.access}</small>
    </div>
    
    ${isCurrentTier ? `
      <div class="current-tier-badge">
        <span class="badge-icon">✓</span> Your current plan
      </div>
    ` : ''}
    
    <button class="btn-tier-action" 
            style="background: ${tier.color}"
            onclick="enterTier('${tier.id}')"
            data-has-access="${hasAccess}">
      ${hasAccess ? '▶ Enter' : '🔒 Upgrade to ' + tier.name}
    </button>
  `;
  
  if (!hasAccess && !isCurrentTier) {
    card.classList.add('locked');
  }
  
  if (isCurrentTier) {
    card.classList.add('active');
  }
  
  return card;
}

function checkTierAccess(tier, userCurrentTier) {
  const tierHierarchy = { free: 0, foundation: 1, premium: 2, elite: 3 };
  
  // Free users can't access any paid tier
  if (userCurrentTier === 'free') return false;
  
  // Check if user's tier is >= tier being checked
  return tierHierarchy[userCurrentTier] >= tierHierarchy[tier];
}

function enterTier(tierId) {
  const hasAccess = checkTierAccess(tierId, userTier);
  const isCurrentTier = userTier === tierId;
  
  if (hasAccess || isCurrentTier) {
    // User has access - enter tier view
    window.location.href = `/tier.html?tier=${tierId}`;
  } else {
    // User needs to upgrade - show upgrade modal
    showUpgradeModal(tierId);
  }
}

function showUpgradeModal(targetTier) {
  // Redirect to payment page with tier parameter
  window.location.href = `/payment.html?tier=${targetTier}`;
}

function exploreSchool(schoolId) {
  window.location.href = `/school.html?id=${schoolId}`;
}
