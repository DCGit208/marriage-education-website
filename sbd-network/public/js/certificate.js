/**
 * CERTIFICATE SYSTEM - AWARD & DISPLAY
 * =====================================
 * 
 * Generates certificates for course/school completion,
 * displays certificate gallery, and enables sharing/download.
 */

// ==================================================================
// CERTIFICATE GENERATION
// ==================================================================

/**
 * Award certificate when user completes a course or school
 */
async function awardCertificate(userId, achievement) {
  try {
    const {
      type,          // 'course' or 'school'
      courseId,      // Course ID (required)
      schoolId,      // School ID (for school certificates)
      courseName,    // Display name
      schoolName     // Display name
    } = achievement;
    
    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data();
    const userName = userData.name || 'Student';
    
    // Create certificate document
    const certificateId = `cert-${type}-${courseId || schoolId}-${userId}-${Date.now()}`;
    
    const certificate = {
      id: certificateId,
      userId,
      userName,
      type,         // 'course' or 'school'
      courseId,
      schoolId,
      courseName: courseName || schoolName,
      awardedAt: firebase.firestore.FieldValue.serverTimestamp(),
      signature: 'Marriage Education Institute',
      signatureTitle: 'Director of Formation'
    };
    
    // Save certificate
    await db.collection('certificates').doc(certificateId).set(certificate);
    
    // Add to user's certificates array
    await db.collection('users').doc(userId).update({
      certificates: firebase.firestore.FieldValue.arrayUnion(certificateId)
    });
    
    console.log('[Certificate] Awarded:', certificateId);
    
    return certificate;
    
  } catch (error) {
    console.error('[Certificate] Error awarding certificate:', error);
    return null;
  }
}

/**
 * Check if user should receive a certificate
 */
async function checkForCertificate(userId, courseId) {
  try {
    // Get user progress
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return;
    
    const userData = userDoc.data();
    const progress = userData.progress || {};
    const completedCourses = progress.completedCourses || [];
    
    // Check if course just completed
    if (!completedCourses.includes(courseId)) return;
    
    // Check if certificate already awarded
    const existingCert = await db.collection('certificates')
      .where('userId', '==', userId)
      .where('courseId', '==', courseId)
      .limit(1)
      .get();
    
    if (!existingCert.empty) {
      console.log('[Certificate] Already awarded for this course');
      return;
    }
    
    // Get course details
    const courseDoc = await db.collection('courses').doc(courseId).get();
    if (!courseDoc.exists) return;
    
    const courseData = courseDoc.data();
    
    // Award certificate
    const certificate = await awardCertificate(userId, {
      type: 'course',
      courseId,
      courseName: courseData.title,
      schoolId: courseData.schoolId
    });
    
    // Show celebration modal
    if (certificate) {
      showCertificateEarnedModal(certificate);
    }
    
  } catch (error) {
    console.error('[Certificate] Error checking for certificate:', error);
  }
}

// ==================================================================
// CERTIFICATE DISPLAY
// ==================================================================

/**
 * Load and display user's certificates
 */
async function loadCertificates(userId) {
  try {
    const container = document.getElementById('certificatesGrid');
    if (!container) return;
    
    // Show loading
    container.innerHTML = '<div class="quiz-loading"><div class="quiz-loading-spinner"></div><div class="quiz-loading-text">Loading certificates...</div></div>';
    
    // Fetch user's certificates
    const certsSnapshot = await db.collection('certificates')
      .where('userId', '==', userId)
      .orderBy('awardedAt', 'desc')
      .get();
    
    if (certsSnapshot.empty) {
      showEmptyCertificates(container);
      return;
    }
    
    // Render certificates
    container.innerHTML = '';
    
    certsSnapshot.docs.forEach(doc => {
      const cert = { id: doc.id, ...doc.data() };
      const certCard = createCertificateCard(cert);
      container.appendChild(certCard);
    });
    
    // Update stats
    updateCertificateStats(userId, certsSnapshot.size);
    
  } catch (error) {
    console.error('[Certificate] Error loading certificates:', error);
    const container = document.getElementById('certificatesGrid');
    if (container) {
      container.innerHTML = '<div class="error-state"><p>⚠️ Error loading certificates</p></div>';
    }
  }
}

/**
 * Create certificate card for grid
 */
function createCertificateCard(cert) {
  const card = document.createElement('div');
  card.className = 'certificate-card';
  
  const date = cert.awardedAt?.toDate ? cert.awardedAt.toDate() : new Date();
  const formattedDate = date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  card.innerHTML = `
    <div class="certificate-preview">
      <div class="certificate-icon">🏆</div>
      <div class="certificate-name">${escapeHtml(cert.courseName)}</div>
      <div class="certificate-course">
        ${cert.type === 'course' ? 'Course Completion' : 'School Completion'}
      </div>
      <div class="certificate-date">${formattedDate}</div>
    </div>
    
    <div class="certificate-actions">
      <button class="btn btn-primary" onclick="viewCertificate('${cert.id}')">
        View
      </button>
      <button class="btn btn-secondary" onclick="downloadCertificate('${cert.id}')">
        Download
      </button>
    </div>
  `;
  
  return card;
}

/**
 * Show empty state
 */
function showEmptyCertificates(container) {
  container.innerHTML = `
    <div class="certificates-empty">
      <div class="certificates-empty-icon">🏆</div>
      <h3 class="certificates-empty-title">No Certificates Yet</h3>
      <p class="certificates-empty-text">
        Complete courses to earn certificates and track your formation progress.
        Certificates are awarded when you finish all modules and pass the final quiz.
      </p>
      <a href="/schools.html" class="btn btn-primary">
        Browse Courses
      </a>
    </div>
  `;
}

/**
 * Update certificate statistics
 */
async function updateCertificateStats(userId, totalCerts) {
  const statsContainer = document.getElementById('certificatesStats');
  if (!statsContainer) return;
  
  try {
    // Get additional stats
    const userDoc = await db.collection('users').doc(userId).get();
    const progress = userDoc.data()?.progress || {};
    
    const completedCourses = progress.completedCourses?.length || 0;
    const completedSchools = progress.completedSchools?.length || 0;
    
    statsContainer.innerHTML = `
      <div class="certificate-stat">
        <div class="certificate-stat-value">${totalCerts}</div>
        <div class="certificate-stat-label">Certificates</div>
      </div>
      
      <div class="certificate-stat">
        <div class="certificate-stat-value">${completedCourses}</div>
        <div class="certificate-stat-label">Courses Completed</div>
      </div>
      
      <div class="certificate-stat">
        <div class="certificate-stat-value">${completedSchools}</div>
        <div class="certificate-stat-label">Schools Completed</div>
      </div>
    `;
    
  } catch (error) {
    console.error('[Certificate] Error updating stats:', error);
  }
}

// ==================================================================
// CERTIFICATE MODAL
// ==================================================================

/**
 * View certificate in full-screen modal
 */
async function viewCertificate(certificateId) {
  try {
    // Fetch certificate
    const certDoc = await db.collection('certificates').doc(certificateId).get();
    if (!certDoc.exists) {
      alert('Certificate not found');
      return;
    }
    
    const cert = { id: certDoc.id, ...certDoc.data() };
    
    // Create modal if doesn't exist
    let modal = document.getElementById('certificateModal');
    if (!modal) {
      modal = createCertificateModal();
    }
    
    // Render certificate
    const content = modal.querySelector('.certificate-modal-content');
    if (content) {
      content.innerHTML = renderFullCertificate(cert);
    }
    
    // Show modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
  } catch (error) {
    console.error('[Certificate] Error viewing certificate:', error);
    alert('Error loading certificate');
  }
}

/**
 * Render full certificate design
 */
function renderFullCertificate(cert) {
  const date = cert.awardedAt?.toDate ? cert.awardedAt.toDate() : new Date();
  const formattedDate = date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  return `
    <div class="certificate-full" id="certificateElement">
      <!-- Corner ornaments -->
      <div class="certificate-corner top-left"></div>
      <div class="certificate-corner top-right"></div>
      <div class="certificate-corner bottom-left"></div>
      <div class="certificate-corner bottom-right"></div>
      
      <!-- Content -->
      <div class="certificate-logo">SBD Network</div>
      
      <div class="certificate-type">Certificate of Completion</div>
      
      <div class="certificate-awarded-to">This certifies that</div>
      
      <div class="certificate-recipient">${escapeHtml(cert.userName)}</div>
      
      <div class="certificate-description">
        Has successfully completed the requirements for
      </div>
      
      <div class="certificate-course-name">${escapeHtml(cert.courseName)}</div>
      
      <div class="certificate-footer">
        <div class="certificate-date-section">
          <div class="certificate-date-label">Date Awarded</div>
          <div class="certificate-date-value">${formattedDate}</div>
        </div>
        
        <div class="certificate-signature">
          <div class="certificate-signature-line"></div>
          <div class="certificate-signature-name">${cert.signature || 'Director'}</div>
          <div class="certificate-signature-title">${cert.signatureTitle || 'SBD Network'}</div>
        </div>
      </div>
    </div>
    
    <div class="certificate-modal-actions">
      <button class="btn btn-primary" onclick="downloadCertificate('${cert.id}')">
        ⬇️ Download Certificate
      </button>
      <button class="btn btn-secondary" onclick="closeCertificateModal()">
        Close
      </button>
    </div>
  `;
}

/**
 * Create certificate modal
 */
function createCertificateModal() {
  const modal = document.createElement('div');
  modal.id = 'certificateModal';
  modal.className = 'certificate-modal';
  
  modal.innerHTML = `
    <div class="certificate-modal-overlay" onclick="closeCertificateModal()"></div>
    <div class="certificate-modal-content">
      <button class="certificate-modal-close" onclick="closeCertificateModal()">×</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  return modal;
}

/**
 * Close certificate modal
 */
function closeCertificateModal() {
  const modal = document.getElementById('certificateModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// ==================================================================
// CERTIFICATE DOWNLOAD
// ==================================================================

/**
 * Download certificate as image (PNG)
 * NOTE: For PDF generation, requires server-side solution (Puppeteer/PDFKit)
 */
async function downloadCertificate(certificateId) {
  try {
    // Check if html2canvas is available
    if (typeof html2canvas === 'undefined') {
      alert('Certificate download feature requires html2canvas library. Please contact support.');
      console.error('[Certificate] html2canvas not loaded');
      return;
    }
    
    // Get certificate element
    const certElement = document.getElementById('certificateElement');
    if (!certElement) {
      alert('Please open the certificate first');
      return;
    }
    
    // Show loading
    const downloadBtn = event.target;
    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = 'Generating...';
    downloadBtn.disabled = true;
    
    // Generate image
    const canvas = await html2canvas(certElement, {
      scale: 2,  // High resolution
      backgroundColor: '#0a0a0a'
    });
    
    // Convert to blob and download
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Certificate-${certificateId}.png`;
      link.click();
      
      // Cleanup
      URL.revokeObjectURL(url);
      downloadBtn.textContent = originalText;
      downloadBtn.disabled = false;
    });
    
  } catch (error) {
    console.error('[Certificate] Error downloading certificate:', error);
    alert('Error downloading certificate. Please try again.');
  }
}

// ==================================================================
// CERTIFICATE EARNED CELEBRATION
// ==================================================================

/**
 * Show celebration modal when certificate is earned
 */
function showCertificateEarnedModal(certificate) {
  // Create celebration modal
  const modal = document.createElement('div');
  modal.className = 'certificate-modal active';
  modal.style.zIndex = '20000';
  
  const date = certificate.awardedAt?.toDate ? certificate.awardedAt.toDate() : new Date();
  const formattedDate = date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  modal.innerHTML = `
    <div class="certificate-modal-overlay"></div>
    <div class="certificate-modal-content">
      <div class="quiz-results" style="animation: questionSlideIn 0.6s ease;">
        <div class="results-icon">🏆</div>
        
        <h2 class="results-title passed">Congratulations!</h2>
        
        <p class="results-message">
          You've earned a certificate for completing<br>
          <strong>${escapeHtml(certificate.courseName)}</strong>
        </p>
        
        <div class="certificate-preview" style="max-width: 400px; margin: 24px auto;">
          <div class="certificate-icon">🎓</div>
          <div class="certificate-name">${escapeHtml(certificate.courseName)}</div>
          <div class="certificate-date">${formattedDate}</div>
        </div>
        
        <div class="results-actions" style="margin-top: 32px;">
          <button class="btn btn-primary" onclick="viewCertificate('${certificate.id}'); document.body.removeChild(this.closest('.certificate-modal'));">
            View Certificate
          </button>
          <button class="btn btn-secondary" onclick="document.body.removeChild(this.closest('.certificate-modal')); document.body.style.overflow = '';">
            Continue
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
  
  // Auto-remove after 10 seconds if user doesn't interact
  setTimeout(() => {
    if (modal.parentElement) {
      document.body.removeChild(modal);
      document.body.style.overflow = '';
    }
  }, 10000);
}

// ==================================================================
// UTILITY FUNCTIONS
// ==================================================================

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
// CLOSE MODAL ON ESCAPE KEY
// ==================================================================

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeCertificateModal();
  }
});
