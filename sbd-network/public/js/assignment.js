/**
 * ASSIGNMENT SUBMISSION SYSTEM
 * =============================
 * 
 * Handles assignment submissions with text responses and photo uploads.
 * Stores submissions in Firestore for tracking progress.
 */

// ==================================================================
// ASSIGNMENT STATE
// ==================================================================

let currentAssignment = null;
let selectedFiles = [];

// ==================================================================
// LOAD ASSIGNMENT
// ==================================================================

/**
 * Load assignment details from Firestore
 */
async function loadAssignment(assignmentId) {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      window.location.href = '/auth';
      return;
    }
    
    // Fetch assignment details
    const assignmentDoc = await db.collection('assignments').doc(assignmentId).get();
    
    if (!assignmentDoc.exists) {
      showAssignmentError('Assignment not found');
      return;
    }
    
    currentAssignment = { id: assignmentDoc.id, ...assignmentDoc.data() };
    
    // Render assignment header
    renderAssignmentHeader();
    
    // Check if user has already submitted
    const existingSubmission = await getUserSubmission(userId, assignmentId);
    
    if (existingSubmission) {
      showSubmissionStatus(existingSubmission);
    }
    
    // Load previous submissions
    await loadPreviousSubmissions(userId, assignmentId);
    
  } catch (error) {
    console.error('[Assignment] Error loading assignment:', error);
    showAssignmentError('Error loading assignment. Please refresh the page.');
  }
}

/**
 * Render assignment header
 */
function renderAssignmentHeader() {
  const headerContainer = document.getElementById('assignmentHeader');
  if (!headerContainer) return;
  
  const { title, description, moduleId, allowPhotos = true, minWords = 100 } = currentAssignment;
  
  headerContainer.innerHTML = `
    <div class="assignment-header">
      <h1 class="assignment-title">${escapeHtml(title)}</h1>
      <p class="assignment-description">${escapeHtml(description || '')}</p>
      
      <div class="assignment-meta">
        <div class="assignment-meta-item">
          <span>📝</span>
          <span>Minimum ${minWords} words</span>
        </div>
        ${allowPhotos ? `
          <div class="assignment-meta-item">
            <span>📸</span>
            <span>Photos allowed</span>
          </div>
        ` : ''}
        <div class="assignment-meta-item">
          <span>⏱️</span>
          <span>No deadline</span>
        </div>
      </div>
    </div>
  `;
}

// ==================================================================
// SUBMISSION FORM
// ==================================================================

/**
 * Handle form submission
 */
async function submitAssignment() {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    
    // Get submission text
    const textarea = document.getElementById('submissionText');
    const submissionText = textarea?.value.trim() || '';
    
    // Validate
    if (!submissionText) {
      alert('Please write your response before submitting.');
      textarea?.focus();
      return;
    }
    
    // Word count validation
    const wordCount = submissionText.split(/\s+/).length;
    const minWords = currentAssignment.minWords || 100;
    
    if (wordCount < minWords) {
      alert(`Your response is too short. Minimum ${minWords} words required (you have ${wordCount}).`);
      return;
    }
    
    // Show loading
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }
    
    // Upload photos if any (simplified - real implementation needs Firebase Storage)
    const photoUrls = [];
    // TODO: Implement Firebase Storage photo upload
    
    // Create submission document
    const submission = {
      assignmentId: currentAssignment.id,
      moduleId: currentAssignment.moduleId,
      userId,
      text: submissionText,
      wordCount,
      photos: photoUrls,
      status: 'submitted',
      submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Save to Firestore
    await db.collection('submissions').add(submission);
    
    // Update user progress
    const userRef = db.collection('users').doc(userId);
    await userRef.update({
     'progress.submittedAssignments': firebase.firestore.FieldValue.arrayUnion(currentAssignment.id),
      'progress.lastActivityDate': firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Show success and reload
    alert('✅ Assignment submitted successfully!');
    location.reload();
    
  } catch (error) {
    console.error('[Assignment] Error submitting:', error);
    alert('Error submitting assignment. Please try again.');
    
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Assignment';
    }
  }
}

/**
 * Update character count
 */
function updateCharCount() {
  const textarea = document.getElementById('submissionText');
  const charCount = document.getElementById('charCount');
  
  if (!textarea || !charCount) return;
  
  const text = textarea.value;
  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const minWords = currentAssignment?.minWords || 100;
  
  charCount.textContent = `${wordCount} / ${minWords} words`;
  
  if (wordCount >= minWords) {
    charCount.style.color = '#00ff88';
  } else {
    charCount.style.color = 'rgba(255, 255, 255, 0.5)';
  }
}

// ==================================================================
// FILE HANDLING (Simplified)
// ==================================================================

/**
 * Handle file selection
 */
function handleFileSelect(event) {
  const files = Array.from(event.target.files || []);
  
  files.forEach(file => {
    if (file.type.startsWith('image/')) {
      selectedFiles.push(file);
    }
  });
  
  renderFilePreview();
}

/**
 * Render file preview
 */
function renderFilePreview() {
  const previewContainer = document.getElementById('filePreviewGrid');
  if (!previewContainer) return;
  
  if (selectedFiles.length === 0) {
    previewContainer.style.display = 'none';
    return;
  }
  
  previewContainer.style.display = 'grid';
  previewContainer.innerHTML = '';
  
  selectedFiles.forEach((file, index) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const item = document.createElement('div');
      item.className = 'file-preview-item';
      item.innerHTML = `
        <img src="${e.target.result}" class="file-preview-image" alt="Preview">
        <button class="file-preview-remove" onclick="removeFile(${index})">×</button>
      `;
      previewContainer.appendChild(item);
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Remove selected file
 */
function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFilePreview();
}

// ==================================================================
// SUBMISSION STATUS
// ==================================================================

/**
 * Get user's existing submission
 */
async function getUserSubmission(userId, assignmentId) {
  try {
    const snapshot = await db.collection('submissions')
      .where('userId', '==', userId)
      .where('assignmentId', '==', assignmentId)
      .orderBy('submittedAt', 'desc')
      .limit(1)
      .get();
    
    if (snapshot.empty) return null;
    
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    
  } catch (error) {
    console.error('[Assignment] Error fetching submission:', error);
    return null;
  }
}

/**
 * Show submission status banner
 */
function showSubmissionStatus(submission) {
  const formContainer = document.getElementById('submissionForm');
  if (!formContainer) return;
  
  const date = submission.submittedAt?.toDate ? submission.submittedAt.toDate() : new Date();
  const formattedDate = date.toLocaleDateString('en-US', { 
    year: 'numeric',
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Add status banner before form
  const statusBanner = document.createElement('div');
  statusBanner.className = 'submission-status success';
  statusBanner.innerHTML = `
    <div class="submission-status-icon">✅</div>
    <div>
      <div class="submission-status-text">Assignment already submitted</div>
      <div class="submission-status-date">Submitted on ${formattedDate}</div>
    </div>
  `;
  
  formContainer.parentElement.insertBefore(statusBanner, formContainer);
  
  // Optionally disable form (or allow resubmission)
  const textarea = document.getElementById('submissionText');
  const submitBtn = document.getElementById('submitBtn');
  
  if (textarea && submitBtn) {
    // Allow viewing but indicate it's a resubmission
    submitBtn.textContent = 'Resubmit Assignment';
  }
}

// ==================================================================
// PREVIOUS SUBMISSIONS
// ==================================================================

/**
 * Load previous submissions (if any)
 */
async function loadPreviousSubmissions(userId, assignmentId) {
  try {
    const snapshot = await db.collection('submissions')
      .where('userId', '==', userId)
      .where('assignmentId', '==', assignmentId)
      .orderBy('submittedAt', 'desc')
      .get();
    
    if (snapshot.empty) return;
    
    const container = document.getElementById('previousSubmissions');
    if (!container) return;
    
    container.style.display = 'block';
    
    const submissionsContainer = container.querySelector('#previousSubmissionsList');
    submissionsContainer.innerHTML = '';
    
    snapshot.docs.forEach(doc => {
      const sub = { id: doc.id, ...doc.data() };
      const card = createSubmissionCard(sub);
      submissionsContainer.appendChild(card);
    });
    
  } catch (error) {
    console.error('[Assignment] Error loading previous submissions:', error);
  }
}

/**
 * Create submission card
 */
function createSubmissionCard(submission) {
  const card = document.createElement('div');
  card.className = 'submission-card';
  
  const date = submission.submittedAt?.toDate ? submission.submittedAt.toDate() : new Date();
  const formattedDate = date.toLocaleDateString('en-US', { 
    year: 'numeric',
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const statusClass = submission.status === 'reviewed' ? 'reviewed' : 'submitted';
  
  card.innerHTML = `
    <div class="submission-card-header">
      <div class="submission-card-date">${formattedDate}</div>
      <div class="submission-card-status ${statusClass}">${submission.status}</div>
    </div>
    <div class="submission-card-text">${escapeHtml(submission.text.substring(0, 200))}${submission.text.length > 200 ? '...' : ''}</div>
    ${submission.photos?.length > 0 ? `
      <div class="submission-card-images">
        ${submission.photos.map(url => `<img src="${url}" class="submission-card-image" alt="Submission photo">`).join('')}
      </div>
    ` : ''}
  `;
  
  return card;
}

// ==================================================================
// UTILITY FUNCTIONS
// ==================================================================

/**
 * Show error message
 */
function showAssignmentError(message) {
  const container = document.querySelector('.assignment-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="quiz-results">
      <div class="results-icon">⚠️</div>
      <h2 class="results-title failed">Error</h2>
      <p class="results-message">${escapeHtml(message)}</p>
      <div class="results-actions">
        <a href="/dashboard.html" class="btn btn-primary">Back to Dashboard</a>
      </div>
    </div>
  `;
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
