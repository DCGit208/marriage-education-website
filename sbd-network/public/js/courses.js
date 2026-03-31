/**
 * COURSES PAGE - My Learning Dashboard
 * ====================================
 * Displays user's course progress and current module
 */

let currentUserId = null;
let userTier = 'free';
let userProgress = null;
let allCourses = [];

// ==================================================================
// INITIALIZATION
// ==================================================================

firebase.auth().onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '/index.html';
    return;
  }
  
  currentUserId = user.uid;
  await loadData();
  await renderDashboard();
});

// ==================================================================
// DATA LOADING
// ==================================================================

async function loadData() {
  try {
    // Get user tier and progress
    userTier = await FormationAccess.getUserTier(currentUserId);
    userProgress = await FormationAccess.getUserProgress(currentUserId);
    
    // Load all courses
    const coursesSnapshot = await db.collection('courses').orderBy('order', 'asc').get();
    allCourses = coursesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log('[Courses] User tier:', userTier);
    console.log('[Courses] User progress:', userProgress);
    console.log('[Courses] All courses:', allCourses);
  } catch (error) {
    console.error('[Courses] Error loading data:', error);
  }
}

// ==================================================================
// RENDERING
// ==================================================================

async function renderDashboard() {
  // Render continue learning section
  await renderContinueLearning();
  
  // Categorize courses
  const activeCourses = [];
  const lockedCourses = [];
  const completedCourses = [];
  
  for (const course of allCourses) {
    const canAccess = await FormationAccess.canAccessCourse(currentUserId, course.id);
    const isCompleted = userProgress?.completedCourses?.includes(course.id);
    
    if (isCompleted) {
      completedCourses.push(course);
    } else if (canAccess) {
      activeCourses.push(course);
    } else {
      lockedCourses.push(course);
    }
  }
  
  // Render sections
  renderActiveCourses(activeCourses);
  renderLockedCourses(lockedCourses);
  renderCompletedCourses(completedCourses);
}

async function renderContinueLearning() {
  const continueSection = document.getElementById('continueSection');
  
  if (!userProgress || !userProgress.currentModuleId) {
    continueSection.style.display = 'none';
    return;
  }
  
  try {
    // Get current module
    const moduleDoc = await db.collection('modules').doc(userProgress.currentModuleId).get();
    if (!moduleDoc.exists) {
      continueSection.style.display = 'none';
      return;
    }
    
    const moduleData = moduleDoc.data();
    
    // Get course for progress calculation
    const courseDoc = await db.collection('courses').doc(moduleData.courseId).get();
    const courseData = courseDoc.data();
    
    const completedModules = userProgress.completedModules?.length || 0;
    const totalModules = courseData.moduleCount || 12;
    
    document.getElementById('currentModuleTitle').textContent = moduleData.title;
    document.getElementById('currentModuleProgress').textContent = 
      `Module ${completedModules + 1} of ${totalModules}`;
    
    continueSection.style.display = 'block';
  } catch (error) {
    console.error('[Courses] Error rendering continue learning:', error);
    continueSection.style.display = 'none';
  }
}

function renderActiveCourses(courses) {
  const container = document.getElementById('activeCoursesContainer');
  
  if (courses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <p class="empty-state-text">No active courses yet. Start your journey!</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = courses.map(course => {
    const progress = userProgress?.progressPercent?.[course.id] || 0;
    
    return `
      <div class="course-card" onclick="openCourse('${course.id}')">
        <div class="course-icon">${getSchoolIcon(course.schoolId)}</div>
        <div class="course-info">
          <h3 class="course-name">${course.title}</h3>
          <p class="course-meta">${course.moduleCount} modules • ${course.estimatedWeeks} weeks</p>
        </div>
        <div class="course-progress">
          <div class="progress-circle" style="--progress: ${progress}%">
            <span class="progress-text">${Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderLockedCourses(courses) {
  const section = document.getElementById('lockedSection');
  const container = document.getElementById('lockedCoursesContainer');
  
  if (courses.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  container.innerHTML = courses.map(course => `
    <div class="course-card locked" onclick="showCoursePaywall('${course.id}')">
      <div class="course-icon">${getSchoolIcon(course.schoolId)}</div>
      <div class="course-info">
        <h3 class="course-name">${course.title}</h3>
        <p class="course-meta">${course.moduleCount} modules • ${course.estimatedWeeks} weeks</p>
      </div>
      <div class="course-progress">
        <div class="lock-badge">🔒 Locked</div>
      </div>
    </div>
  `).join('');
}

function renderCompletedCourses(courses) {
  const section = document.getElementById('completedSection');
  const container = document.getElementById('completedCoursesContainer');
  
  if (courses.length === 0) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  container.innerHTML = courses.map(course => `
    <div class="course-card" onclick="openCourse('${course.id}')">
      <div class="course-icon">${getSchoolIcon(course.schoolId)}</div>
      <div class="course-info">
        <h3 class="course-name">${course.title}</h3>
        <p class="course-meta">✅ Completed</p>
      </div>
      <div class="course-progress">
        <div class="progress-circle" style="--progress: 100%">
          <span class="progress-text">✓</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ==================================================================
// HELPERS
// ==================================================================

function getSchoolIcon(schoolId) {
  const icons = {
    'teleios': '🧠',
    'sexual-literacy': '📐',
    'muliebrity': '👗',
    'virility': '🎯'
  };
  return icons[schoolId] || '📚';
}

// ==================================================================
// ACTIONS
// ==================================================================

async function continueModule() {
  if (!userProgress || !userProgress.currentModuleId) {
    return;
  }
  
  try {
    const moduleDoc = await db.collection('modules').doc(userProgress.currentModuleId).get();
    if (!moduleDoc.exists) return;
    
    const moduleData = moduleDoc.data();
    
    // If module has linked board, open it
    if (moduleData.linkedBoardId) {
      window.location.href = `/board.html?id=${moduleData.linkedBoardId}`;
    } else {
      // Open course detail view
      window.location.href = `/courses.html?course=${moduleData.courseId}`;
    }
  } catch (error) {
    console.error('[Courses] Error continuing module:', error);
  }
}

async function openCourse(courseId) {
  const canAccess = await FormationAccess.canAccessCourse(currentUserId, courseId);
  
  if (!canAccess) {
    showCoursePaywall(courseId);
    return;
  }
  
  // Get first module of course
  const modulesSnapshot = await db.collection('modules')
    .where('courseId', '==', courseId)
    .orderBy('order', 'asc')
    .limit(1)
    .get();
  
  if (modulesSnapshot.empty) {
    alert('This course has no modules yet.');
    return;
  }
  
  const firstModule = modulesSnapshot.docs[0];
  const moduleData = firstModule.data();
  
  // If module has linked board, open it
  if (moduleData.linkedBoardId) {
    window.location.href = `/board.html?id=${moduleData.linkedBoardId}`;
  } else {
    alert('This module has no linked board yet.');
  }
}

async function showCoursePaywall(courseId) {
  const course = allCourses.find(c => c.id === courseId);
  if (!course) return;
  
  FormationAccess.showPaywallModal({
    title: `Unlock ${course.title}`,
    message: `This course requires a ${course.accessLevel} subscription.`,
    requiredTier: course.accessLevel,
    currentTier: userTier
  });
}

// ==================================================================
// BACK BUTTON
// ==================================================================

document.querySelector('.back-btn')?.addEventListener('click', () => {
  window.history.back();
});

console.log('[Courses] Page loaded');
