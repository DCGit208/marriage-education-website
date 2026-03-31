/**
 * QUIZ SYSTEM - INTERACTIVE QUIZZES
 * ==================================
 * 
 * Renders quizzes, tracks answers, grades results, and integrates with progress system.
 * Passing grade: 80% or higher
 */

// ==================================================================
// QUIZ STATE
// ==================================================================

let currentQuiz = null;
let currentQuestionIndex = 0;
let userAnswers = [];
let quizStartTime = null;
let quizEndTime = null;

// ==================================================================
// QUIZ DATA STRUCTURE
// ==================================================================

/**
 * Expected quiz object structure:
 * {
 *   id: 'quiz-teleios-week-1',
 *   title: 'Teleios Identity - Week 1 Quiz',
 *   description: 'Test your understanding of Week 1 concepts',
 *   moduleId: 'module-id',
 *   courseId: 'course-id',
 *   passingScore: 80,
 *   questions: [
 *     {
 *       id: 'q1',
 *       text: 'What is the primary focus of Teleios identity?',
 *       options: [
 *         { id: 'a', text: 'Self-improvement', correct: false },
 *         { id: 'b', text: 'Covenant self-donation', correct: true },
 *         { id: 'c', text: 'Personal success', correct: false },
 *         { id: 'd', text: 'Individual happiness', correct: false }
 *       ],
 *       explanation: 'Teleios focuses on covenant identity and self-donation, not self-improvement.'
 *     },
 *     ...
 *   ]
 * }
 */

// ==================================================================
// QUIZ INITIALIZATION
// ==================================================================

/**
 * Load and start a quiz
 */
async function loadQuiz(quizId) {
  try {
    showQuizLoading(true);
    
    // Fetch quiz from Firestore
    const quizDoc = await db.collection('quizzes').doc(quizId).get();
    
    if (!quizDoc.exists) {
      throw new Error('Quiz not found');
    }
    
    currentQuiz = { id: quizDoc.id, ...quizDoc.data() };
    currentQuestionIndex = 0;
    userAnswers = new Array(currentQuiz.questions.length).fill(null);
    quizStartTime = Date.now();
    quizEndTime = null;
    
    // Check if user has already passed this quiz
    const userId = auth.currentUser?.uid;
    if (userId) {
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      const passedQuizzes = userData.progress?.passedQuizzes || [];
      
      if (passedQuizzes.includes(quizId)) {
        showQuizAlreadyPassed();
        return;
      }
    }
    
    renderQuizHeader();
    renderQuestion(currentQuestionIndex);
    updateProgressBar();
    
    showQuizLoading(false);
    
  } catch (error) {
    console.error('[Quiz] Error loading quiz:', error);
    showQuizError('Failed to load quiz. Please refresh the page.');
  }
}

/**
 * Render quiz header
 */
function renderQuizHeader() {
  const headerContainer = document.getElementById('quizHeader');
  if (!headerContainer) return;
  
  headerContainer.innerHTML = `
    <div class="quiz-header">
      <h1 class="quiz-title">${escapeHtml(currentQuiz.title)}</h1>
      <p class="quiz-description">${escapeHtml(currentQuiz.description || '')}</p>
      
      <div class="quiz-meta">
        <div class="quiz-meta-item">
          <span>📝</span>
          <span><strong>${currentQuiz.questions.length}</strong> Questions</span>
        </div>
        <div class="quiz-meta-item">
          <span>✅</span>
          <span><strong>${currentQuiz.passingScore || 80}%</strong> to Pass</span>
        </div>
        <div class="quiz-meta-item">
          <span>⏱️</span>
          <span>No time limit</span>
        </div>
      </div>
    </div>
    
    <div class="quiz-progress-bar">
      <div class="quiz-progress-fill" id="quizProgressFill"></div>
      <div class="quiz-progress-text" id="quizProgressText">0%</div>
    </div>
  `;
}

// ==================================================================
// QUESTION RENDERING
// ==================================================================

/**
 * Render current question
 */
function renderQuestion(index) {
  const questionContainer = document.getElementById('questionContainer');
  if (!questionContainer) return;
  
  const question = currentQuiz.questions[index];
  const userAnswer = userAnswers[index];
  
  questionContainer.innerHTML = `
    <div class="question-card">
      <div class="question-number">Question ${index + 1} of ${currentQuiz.questions.length}</div>
      <div class="question-text">${escapeHtml(question.text)}</div>
      
      <div class="answer-options" id="answerOptions">
        ${question.options.map((option, i) => {
          const letter = String.fromCharCode(65 + i); // A, B, C, D
          const isSelected = userAnswer === option.id;
          
          return `
            <div class="answer-option ${isSelected ? 'selected' : ''}" 
                 data-option-id="${option.id}"
                 onclick="selectAnswer('${option.id}')">
              <div class="answer-letter">${letter}</div>
              <div class="answer-text">${escapeHtml(option.text)}</div>
              <div class="answer-icon"></div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  
  updateNavigation();
}

/**
 * Handle answer selection
 */
function selectAnswer(optionId) {
  userAnswers[currentQuestionIndex] = optionId;
  
  // Update UI
  const options = document.querySelectorAll('.answer-option');
  options.forEach(option => {
    if (option.getAttribute('data-option-id') === optionId) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
  });
  
  updateNavigation();
  updateProgressBar();
}

// ==================================================================
// NAVIGATION
// ==================================================================

/**
 * Update navigation buttons
 */
function updateNavigation() {
  const navContainer = document.getElementById('quizNavigation');
  if (!navContainer) return;
  
  const isFirst = currentQuestionIndex === 0;
  const isLast = currentQuestionIndex === currentQuiz.questions.length - 1;
  const hasAnswer = userAnswers[currentQuestionIndex] !== null;
  
  navContainer.innerHTML = `
    <button class="btn btn-quiz btn-quiz-secondary" 
            onclick="previousQuestion()"
            ${isFirst ? 'disabled' : ''}>
      ← Previous
    </button>
    
    <div style="flex: 1;"></div>
    
    ${isLast ? `
      <button class="btn btn-quiz btn-quiz-primary" 
              onclick="submitQuiz()"
              ${!hasAnswer ? 'disabled' : ''}>
        Submit Quiz
      </button>
    ` : `
      <button class="btn btn-quiz btn-quiz-primary" 
              onclick="nextQuestion()"
              ${!hasAnswer ? 'disabled' : ''}>
        Next →
      </button>
    `}
  `;
}

/**
 * Go to next question
 */
function nextQuestion() {
  if (currentQuestionIndex < currentQuiz.questions.length - 1) {
    currentQuestionIndex++;
    renderQuestion(currentQuestionIndex);
    updateProgressBar();
    scrollToTop();
  }
}

/**
 * Go to previous question
 */
function previousQuestion() {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    renderQuestion(currentQuestionIndex);
    updateProgressBar();
    scrollToTop();
  }
}

/**
 * Update progress bar
 */
function updateProgressBar() {
  const answeredCount = userAnswers.filter(a => a !== null).length;
  const totalQuestions = currentQuiz.questions.length;
  const percent = Math.round((answeredCount / totalQuestions) * 100);
  
  const progressFill = document.getElementById('quizProgressFill');
  const progressText = document.getElementById('quizProgressText');
  
  if (progressFill) progressFill.style.width = `${percent}%`;
  if (progressText) progressText.textContent = `${percent}%`;
}

// ==================================================================
// QUIZ SUBMISSION & GRADING
// ==================================================================

/**
 * Submit quiz and calculate score
 */
async function submitQuiz() {
  // Confirm submission
  const unanswered = userAnswers.filter(a => a === null).length;
  if (unanswered > 0) {
    if (!confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) {
      return;
    }
  }
  
  quizEndTime = Date.now();
  
  // Calculate score
  let correctCount = 0;
  currentQuiz.questions.forEach((question, index) => {
    const userAnswer = userAnswers[index];
    const correctOption = question.options.find(opt => opt.correct);
    
    if (userAnswer === correctOption?.id) {
      correctCount++;
    }
  });
  
  const totalQuestions = currentQuiz.questions.length;
  const scorePercent = Math.round((correctCount / totalQuestions) * 100);
  const passed = scorePercent >= (currentQuiz.passingScore || 80);
  
  // Save quiz attempt to Firestore
  const userId = auth.currentUser?.uid;
  if (userId) {
    await saveQuizAttempt(userId, {
      quizId: currentQuiz.id,
      moduleId: currentQuiz.moduleId,
      courseId: currentQuiz.courseId,
      score: scorePercent,
      correctCount,
      totalQuestions,
      passed,
      answers: userAnswers,
      startTime: quizStartTime,
      endTime: quizEndTime,
      duration: quizEndTime - quizStartTime
    });
    
    // If passed, update user progress
    if (passed) {
      await markQuizPassed(userId, currentQuiz.id, currentQuiz.moduleId);
    }
  }
  
  // Show results
  showQuizResults({
    passed,
    scorePercent,
    correctCount,
    totalQuestions,
    duration: quizEndTime - quizStartTime
  });
}

/**
 * Save quiz attempt to Firestore
 */
async function saveQuizAttempt(userId, attemptData) {
  try {
    await db.collection('users').doc(userId).collection('quizAttempts').add({
      ...attemptData,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('[Quiz] Error saving attempt:', error);
  }
}

/**
 * Mark quiz as passed in user progress
 */
async function markQuizPassed(userId, quizId, moduleId) {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    const progress = userData.progress || {};
    
    const passedQuizzes = progress.passedQuizzes || [];
    if (!passedQuizzes.includes(quizId)) {
      passedQuizzes.push(quizId);
    }
    
    await userRef.update({
      'progress.passedQuizzes': passedQuizzes,
      'progress.lastActivityDate': firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('[Quiz] Quiz passed and progress updated');
  } catch (error) {
    console.error('[Quiz] Error marking quiz passed:', error);
  }
}

// ==================================================================
// RESULTS DISPLAY
// ==================================================================

/**
 * Show quiz results
 */
function showQuizResults(results) {
  const mainContainer = document.querySelector('.quiz-container');
  if (!mainContainer) return;
  
  const { passed, scorePercent, correctCount, totalQuestions, duration } = results;
  
  const durationMinutes = Math.floor(duration / 60000);
  const durationSeconds = Math.floor((duration % 60000) / 1000);
  
  mainContainer.innerHTML = `
    <div class="quiz-results">
      <div class="results-icon">${passed ? '🎉' : '😔'}</div>
      
      <h2 class="results-title ${passed ? 'passed' : 'failed'}">
        ${passed ? 'Congratulations!' : 'Not Quite There'}
      </h2>
      
      <div class="results-score ${passed ? 'passed' : 'failed'}">
        ${scorePercent}%
      </div>
      
      <p class="results-message">
        ${passed 
          ? `You passed the quiz! You can now continue to the next module.`
          : `You need ${currentQuiz.passingScore || 80}% to pass. Review the material and try again.`
        }
      </p>
      
      <div class="results-stats">
        <div class="results-stat">
          <div class="results-stat-value">${correctCount}/${totalQuestions}</div>
          <div class="results-stat-label">Correct</div>
        </div>
        
        <div class="results-stat">
          <div class="results-stat-value">${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}</div>
          <div class="results-stat-label">Time</div>
        </div>
      </div>
      
      <div class="results-actions">
        ${passed ? `
          <a href="/module.html?id=${currentQuiz.moduleId}" class="btn btn-primary">
            Continue to Next Module
          </a>
          <a href="/dashboard.html" class="btn btn-secondary">
            Back to Dashboard
          </a>
        ` : `
          <button class="btn btn-primary" onclick="retakeQuiz()">
            Retake Quiz
          </button>
          <a href="/module.html?id=${currentQuiz.moduleId}" class="btn btn-secondary">
            Review Material
          </a>
        `}
      </div>
    </div>
  `;
}

/**
 * Retake quiz
 */
function retakeQuiz() {
  loadQuiz(currentQuiz.id);
}

/**
 * Show already passed message
 */
function showQuizAlreadyPassed() {
  const mainContainer = document.querySelector('.quiz-container');
  if (!mainContainer) return;
  
  mainContainer.innerHTML = `
    <div class="quiz-results">
      <div class="results-icon">✅</div>
      
      <h2 class="results-title passed">Already Completed</h2>
      
      <p class="results-message">
        You've already passed this quiz! Continue your formation journey.
      </p>
      
      <div class="results-actions">
        <a href="/module.html?id=${currentQuiz.moduleId}" class="btn btn-primary">
          Continue to Next Module
        </a>
        <a href="/dashboard.html" class="btn btn-secondary">
          Back to Dashboard
        </a>
        <button class="btn btn-secondary" onclick="retakeQuiz()">
          Retake Anyway
        </button>
      </div>
    </div>
  `;
}

// ==================================================================
// UTILITY FUNCTIONS
// ==================================================================

/**
 * Show/hide loading state
 */
function showQuizLoading(show) {
  const mainContainer = document.querySelector('.quiz-container');
  if (!mainContainer) return;
  
  if (show) {
    mainContainer.innerHTML = `
      <div class="quiz-loading">
        <div class="quiz-loading-spinner"></div>
        <div class="quiz-loading-text">Loading quiz...</div>
      </div>
    `;
  }
}

/**
 * Show error message
 */
function showQuizError(message) {
  const mainContainer = document.querySelector('.quiz-container');
  if (!mainContainer) return;
  
  mainContainer.innerHTML = `
    <div class="quiz-results">
      <div class="results-icon">⚠️</div>
      <h2 class="results-title failed">Error</h2>
      <p class="results-message">${escapeHtml(message)}</p>
      <div class="results-actions">
        <a href="/dashboard.html" class="btn btn-primary">
          Back to Dashboard
        </a>
      </div>
    </div>
  `;
}

/**
 * Scroll to top of page
 */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================================================================
// CHECK QUIZ REQUIREMENT FOR MODULE ACCESS
// ==================================================================

/**
 * Check if user needs to pass quiz before accessing next module
 */
async function checkQuizRequirement(moduleId) {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) return { required: false };
    
    // Get module data
    const moduleDoc = await db.collection('modules').doc(moduleId).get();
    if (!moduleDoc.exists) return { required: false };
    
    const moduleData = moduleDoc.data();
    const requiredQuizId = moduleData.requiredQuizId;
    
    // If no quiz required, access granted
    if (!requiredQuizId) {
      return { required: false };
    }
    
    // Check if user has passed the required quiz
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const passedQuizzes = userData.progress?.passedQuizzes || [];
    
    if (passedQuizzes.includes(requiredQuizId)) {
      return { required: true, passed: true };
    }
    
    return { 
      required: true, 
      passed: false,
      quizId: requiredQuizId
    };
    
  } catch (error) {
    console.error('[Quiz] Error checking quiz requirement:', error);
    return { required: false };
  }
}
