// Course Delivery System
// Handles course access, progress tracking, and content delivery

class CourseDelivery {
    constructor() {
        this.apiBase = '/api/courses';
        this.currentUser = null;
        this.currentCourse = null;
        this.videoPlayer = null;
        this.initializeSystem();
    }

    async initializeSystem() {
        await this.checkUserAuth();
        this.setupProgressTracking();
        this.setupVideoPlayer();
    }

    // User Authentication
    async checkUserAuth() {
        try {
            const response = await fetch('/api/auth/check', {
                credentials: 'include'
            });
            
            if (response.ok) {
                this.currentUser = await response.json();
                this.loadUserProgress();
            } else {
                this.redirectToLogin();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.redirectToLogin();
        }
    }

    async login(email, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                this.currentUser = await response.json();
                window.location.reload();
                return true;
            } else {
                const error = await response.json();
                throw new Error(error.message);
            }
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    }

    logout() {
        fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        }).then(() => {
            this.currentUser = null;
            this.redirectToLogin();
        });
    }

    redirectToLogin() {
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = '/login.html';
        }
    }

    // Course Access Management
    async getUserCourses() {
        try {
            const response = await fetch(`${this.apiBase}/user-courses`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                return await response.json();
            }
            throw new Error('Failed to fetch user courses');
        } catch (error) {
            console.error('Error fetching user courses:', error);
            return [];
        }
    }

    async getCourseContent(courseId) {
        try {
            const response = await fetch(`${this.apiBase}/${courseId}/content`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                return await response.json();
            }
            throw new Error('Failed to fetch course content');
        } catch (error) {
            console.error('Error fetching course content:', error);
            throw error;
        }
    }

    async grantCourseAccess(userId, courseId, paymentId) {
        try {
            const response = await fetch(`${this.apiBase}/grant-access`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    user_id: userId,
                    course_id: courseId,
                    payment_id: paymentId,
                    granted_at: new Date().toISOString()
                })
            });

            if (response.ok) {
                return await response.json();
            }
            throw new Error('Failed to grant course access');
        } catch (error) {
            console.error('Error granting course access:', error);
            throw error;
        }
    }

    // Progress Tracking
    setupProgressTracking() {
        this.progressInterval = setInterval(() => {
            this.saveProgress();
        }, 30000); // Save progress every 30 seconds
    }

    async loadUserProgress() {
        try {
            const response = await fetch(`${this.apiBase}/progress`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const progress = await response.json();
                this.displayProgress(progress);
                return progress;
            }
        } catch (error) {
            console.error('Error loading progress:', error);
        }
    }

    async saveProgress() {
        if (!this.currentUser || !this.currentCourse) return;

        const progressData = {
            course_id: this.currentCourse.id,
            lesson_id: this.getCurrentLessonId(),
            video_position: this.getVideoPosition(),
            completed_at: this.isLessonCompleted() ? new Date().toISOString() : null,
            notes: this.getUserNotes()
        };

        try {
            await fetch(`${this.apiBase}/progress`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(progressData)
            });
        } catch (error) {
            console.error('Error saving progress:', error);
        }
    }

    displayProgress(progress) {
        const progressElements = document.querySelectorAll('.progress-indicator');
        progressElements.forEach(element => {
            const lessonId = element.dataset.lessonId;
            const lessonProgress = progress.find(p => p.lesson_id === lessonId);
            
            if (lessonProgress) {
                if (lessonProgress.completed_at) {
                    element.classList.add('completed');
                } else {
                    element.classList.add('in-progress');
                }
            }
        });
    }

    // Video Player Integration
    setupVideoPlayer() {
        const videoElement = document.querySelector('#course-video');
        if (!videoElement) return;

        // Initialize video player (using Video.js as example)
        if (typeof videojs !== 'undefined') {
            this.videoPlayer = videojs(videoElement, {
                responsive: true,
                playbackRates: [0.5, 1, 1.25, 1.5, 2],
                controls: true
            });

            // Track video events
            this.videoPlayer.on('play', () => {
                if (window.marriageEducationAnalytics) {
                    window.marriageEducationAnalytics.trackVideoEngagement(
                        this.getCurrentLessonTitle(),
                        'play'
                    );
                }
            });

            this.videoPlayer.on('pause', () => {
                this.saveProgress();
            });

            this.videoPlayer.on('ended', () => {
                this.markLessonComplete();
                this.showNextLesson();
            });

            // Track progress every 10 seconds
            this.videoPlayer.on('timeupdate', () => {
                const progress = (this.videoPlayer.currentTime() / this.videoPlayer.duration()) * 100;
                
                if (progress > 0 && progress % 25 < 1) { // Every 25%
                    if (window.marriageEducationAnalytics) {
                        window.marriageEducationAnalytics.trackVideoEngagement(
                            this.getCurrentLessonTitle(),
                            'progress',
                            Math.round(progress)
                        );
                    }
                }
            });
        }
    }

    // Lesson Management
    getCurrentLessonId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('lesson') || document.querySelector('.current-lesson')?.dataset.lessonId;
    }

    getCurrentLessonTitle() {
        return document.querySelector('.lesson-title')?.textContent || 'Unknown Lesson';
    }

    getVideoPosition() {
        return this.videoPlayer ? this.videoPlayer.currentTime() : 0;
    }

    isLessonCompleted() {
        if (this.videoPlayer) {
            const watched = (this.videoPlayer.currentTime() / this.videoPlayer.duration()) * 100;
            return watched >= 90; // Consider 90% watched as complete
        }
        return false;
    }

    async markLessonComplete() {
        const lessonId = this.getCurrentLessonId();
        if (!lessonId) return;

        try {
            await fetch(`${this.apiBase}/lessons/${lessonId}/complete`, {
                method: 'POST',
                credentials: 'include'
            });

            // Update UI
            const progressElement = document.querySelector(`[data-lesson-id="${lessonId}"]`);
            if (progressElement) {
                progressElement.classList.add('completed');
            }

            // Track completion
            if (window.marriageEducationAnalytics) {
                window.marriageEducationAnalytics.trackVideoEngagement(
                    this.getCurrentLessonTitle(),
                    'complete'
                );
            }
        } catch (error) {
            console.error('Error marking lesson complete:', error);
        }
    }

    showNextLesson() {
        const nextLessonButton = document.querySelector('.next-lesson-btn');
        if (nextLessonButton) {
            nextLessonButton.style.display = 'block';
            nextLessonButton.focus();
        }
    }

    // Notes and Assignments
    getUserNotes() {
        const notesElement = document.querySelector('#lesson-notes');
        return notesElement ? notesElement.value : '';
    }

    async saveNotes(lessonId, notes) {
        try {
            await fetch(`${this.apiBase}/lessons/${lessonId}/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ notes })
            });
        } catch (error) {
            console.error('Error saving notes:', error);
        }
    }

    // Certificate Generation
    async generateCertificate(courseId) {
        try {
            const response = await fetch(`${this.apiBase}/${courseId}/certificate`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `marriage-education-certificate-${courseId}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Error generating certificate:', error);
        }
    }
}

// Course Navigation
function setupCourseNavigation() {
    const courseDelivery = new CourseDelivery();

    // Handle lesson navigation
    document.addEventListener('click', (e) => {
        if (e.target.matches('.lesson-link')) {
            e.preventDefault();
            const lessonId = e.target.dataset.lessonId;
            loadLesson(lessonId);
        }

        if (e.target.matches('.next-lesson-btn')) {
            const nextLessonId = e.target.dataset.nextLesson;
            loadLesson(nextLessonId);
        }

        if (e.target.matches('.prev-lesson-btn')) {
            const prevLessonId = e.target.dataset.prevLesson;
            loadLesson(prevLessonId);
        }
    });

    // Auto-save notes
    const notesElement = document.querySelector('#lesson-notes');
    if (notesElement) {
        let saveTimeout;
        notesElement.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                const lessonId = courseDelivery.getCurrentLessonId();
                courseDelivery.saveNotes(lessonId, notesElement.value);
            }, 2000);
        });
    }

    window.courseDelivery = courseDelivery;
}

function loadLesson(lessonId) {
    const url = new URL(window.location);
    url.searchParams.set('lesson', lessonId);
    window.location.href = url.toString();
}

// Initialize course delivery system
document.addEventListener('DOMContentLoaded', setupCourseNavigation);
