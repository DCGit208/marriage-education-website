// Member Area System
// Handles user dashboard, profile management, and member features

class MemberArea {
    constructor() {
        this.apiBase = '/api/members';
        this.currentUser = null;
        this.initializeMemberArea();
    }

    async initializeMemberArea() {
        await this.loadUserProfile();
        this.setupDashboard();
        this.setupProfileManagement();
        this.setupMemberFeatures();
    }

    // User Profile Management
    async loadUserProfile() {
        try {
            const response = await fetch(`${this.apiBase}/profile`, {
                credentials: 'include'
            });

            if (response.ok) {
                this.currentUser = await response.json();
                this.displayUserProfile();
                return this.currentUser;
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
        }
    }

    displayUserProfile() {
        if (!this.currentUser) return;

        // Update profile elements
        const profileElements = {
            '.user-name': this.currentUser.first_name + ' ' + this.currentUser.last_name,
            '.user-email': this.currentUser.email,
            '.member-since': new Date(this.currentUser.created_at).toLocaleDateString(),
            '.user-avatar': this.currentUser.avatar_url || '/images/default-avatar.png'
        };

        Object.entries(profileElements).forEach(([selector, value]) => {
            const element = document.querySelector(selector);
            if (element) {
                if (selector === '.user-avatar') {
                    element.src = value;
                } else {
                    element.textContent = value;
                }
            }
        });
    }

    async updateProfile(profileData) {
        try {
            const response = await fetch(`${this.apiBase}/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(profileData)
            });

            if (response.ok) {
                this.currentUser = await response.json();
                this.displayUserProfile();
                this.showMessage('Profile updated successfully!', 'success');
                return true;
            } else {
                throw new Error('Failed to update profile');
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            this.showMessage('Failed to update profile. Please try again.', 'error');
            return false;
        }
    }

    // Dashboard Setup
    setupDashboard() {
        this.loadDashboardData();
        this.setupQuickActions();
        this.setupRecentActivity();
    }

    async loadDashboardData() {
        try {
            const [courses, progress, achievements] = await Promise.all([
                this.getUserCourses(),
                this.getUserProgress(),
                this.getUserAchievements()
            ]);

            this.displayDashboardStats(courses, progress, achievements);
            this.displayRecentCourses(courses);
            this.displayProgressOverview(progress);
            this.displayAchievements(achievements);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    async getUserCourses() {
        const response = await fetch(`${this.apiBase}/courses`, {
            credentials: 'include'
        });
        return response.ok ? await response.json() : [];
    }

    async getUserProgress() {
        const response = await fetch(`${this.apiBase}/progress`, {
            credentials: 'include'
        });
        return response.ok ? await response.json() : [];
    }

    async getUserAchievements() {
        const response = await fetch(`${this.apiBase}/achievements`, {
            credentials: 'include'
        });
        return response.ok ? await response.json() : [];
    }

    displayDashboardStats(courses, progress, achievements) {
        const stats = {
            totalCourses: courses.length,
            completedCourses: courses.filter(c => c.completed).length,
            totalProgress: Math.round(progress.reduce((acc, p) => acc + p.percentage, 0) / progress.length) || 0,
            achievements: achievements.length
        };

        document.querySelector('.stat-total-courses').textContent = stats.totalCourses;
        document.querySelector('.stat-completed-courses').textContent = stats.completedCourses;
        document.querySelector('.stat-progress').textContent = stats.totalProgress + '%';
        document.querySelector('.stat-achievements').textContent = stats.achievements;
    }

    displayRecentCourses(courses) {
        const recentCoursesContainer = document.querySelector('.recent-courses');
        if (!recentCoursesContainer) return;

        const recentCourses = courses
            .sort((a, b) => new Date(b.last_accessed) - new Date(a.last_accessed))
            .slice(0, 3);

        recentCoursesContainer.innerHTML = recentCourses.map(course => `
            <div class="course-card">
                <img src="${course.thumbnail}" alt="${course.title}" />
                <div class="course-info">
                    <h4>${course.title}</h4>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${course.progress}%"></div>
                    </div>
                    <span class="progress-text">${course.progress}% Complete</span>
                    <a href="/course.html?id=${course.id}" class="continue-btn">Continue</a>
                </div>
            </div>
        `).join('');
    }

    displayProgressOverview(progress) {
        const progressContainer = document.querySelector('.progress-overview');
        if (!progressContainer) return;

        const progressHTML = progress.map(item => `
            <div class="progress-item">
                <span class="lesson-name">${item.lesson_name}</span>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${item.percentage}%"></div>
                </div>
                <span class="progress-percentage">${item.percentage}%</span>
            </div>
        `).join('');

        progressContainer.innerHTML = progressHTML;
    }

    displayAchievements(achievements) {
        const achievementsContainer = document.querySelector('.achievements-container');
        if (!achievementsContainer) return;

        const achievementsHTML = achievements.map(achievement => `
            <div class="achievement-badge ${achievement.earned ? 'earned' : 'locked'}">
                <div class="badge-icon">${achievement.icon}</div>
                <div class="badge-info">
                    <h5>${achievement.title}</h5>
                    <p>${achievement.description}</p>
                    ${achievement.earned ? `<span class="earned-date">Earned: ${new Date(achievement.earned_at).toLocaleDateString()}</span>` : ''}
                </div>
            </div>
        `).join('');

        achievementsContainer.innerHTML = achievementsHTML;
    }

    // Quick Actions
    setupQuickActions() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('.quick-action-btn')) {
                const action = e.target.dataset.action;
                this.handleQuickAction(action);
            }
        });
    }

    handleQuickAction(action) {
        switch (action) {
            case 'download-resources':
                this.showDownloadCenter();
                break;
            case 'book-coaching':
                window.location.href = '/coaching-booking.html';
                break;
            case 'community-access':
                window.location.href = '/community.html';
                break;
            case 'support-ticket':
                this.showSupportForm();
                break;
        }
    }

    // Recent Activity
    setupRecentActivity() {
        this.loadRecentActivity();
    }

    async loadRecentActivity() {
        try {
            const response = await fetch(`${this.apiBase}/activity`, {
                credentials: 'include'
            });

            if (response.ok) {
                const activities = await response.json();
                this.displayRecentActivity(activities);
            }
        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }

    displayRecentActivity(activities) {
        const activityContainer = document.querySelector('.recent-activity');
        if (!activityContainer) return;

        const activityHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon">${this.getActivityIcon(activity.type)}</div>
                <div class="activity-content">
                    <p>${activity.description}</p>
                    <span class="activity-time">${this.formatTimeAgo(activity.created_at)}</span>
                </div>
            </div>
        `).join('');

        activityContainer.innerHTML = activityHTML;
    }

    getActivityIcon(type) {
        const icons = {
            'course_start': '📚',
            'lesson_complete': '✅',
            'achievement_earned': '🏆',
            'certificate_earned': '🎓',
            'profile_update': '👤',
            'payment_success': '💳'
        };
        return icons[type] || '📝';
    }

    formatTimeAgo(date) {
        const now = new Date();
        const activityDate = new Date(date);
        const diffInSeconds = Math.floor((now - activityDate) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        return `${Math.floor(diffInSeconds / 86400)} days ago`;
    }

    // Profile Management
    setupProfileManagement() {
        const profileForm = document.querySelector('.profile-form');
        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleProfileUpdate(e.target);
            });
        }

        const avatarUpload = document.querySelector('#avatar-upload');
        if (avatarUpload) {
            avatarUpload.addEventListener('change', (e) => {
                this.handleAvatarUpload(e.target.files[0]);
            });
        }
    }

    async handleProfileUpdate(form) {
        const formData = new FormData(form);
        const profileData = {
            first_name: formData.get('first_name'),
            last_name: formData.get('last_name'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            bio: formData.get('bio'),
            notifications: {
                email: formData.get('email_notifications') === 'on',
                sms: formData.get('sms_notifications') === 'on',
                marketing: formData.get('marketing_notifications') === 'on'
            }
        };

        await this.updateProfile(profileData);
    }

    async handleAvatarUpload(file) {
        if (!file) return;

        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const response = await fetch(`${this.apiBase}/avatar`, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                document.querySelector('.user-avatar').src = result.avatar_url;
                this.showMessage('Avatar updated successfully!', 'success');
            } else {
                throw new Error('Failed to upload avatar');
            }
        } catch (error) {
            console.error('Error uploading avatar:', error);
            this.showMessage('Failed to upload avatar. Please try again.', 'error');
        }
    }

    // Support and Help
    showSupportForm() {
        const modal = document.querySelector('#support-modal');
        if (modal) {
            modal.style.display = 'block';
        }
    }

    async submitSupportTicket(ticketData) {
        try {
            const response = await fetch(`${this.apiBase}/support`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(ticketData)
            });

            if (response.ok) {
                this.showMessage('Support ticket submitted successfully!', 'success');
                document.querySelector('#support-modal').style.display = 'none';
                return true;
            } else {
                throw new Error('Failed to submit support ticket');
            }
        } catch (error) {
            console.error('Error submitting support ticket:', error);
            this.showMessage('Failed to submit ticket. Please try again.', 'error');
            return false;
        }
    }

    // Download Center
    showDownloadCenter() {
        window.location.href = '/downloads.html';
    }

    // Utility Methods
    showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${type}`;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 2rem;
            border-radius: 5px;
            z-index: 1000;
            color: white;
            background: ${type === 'success' ? '#00b894' : type === 'error' ? '#d63031' : '#74b9ff'};
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        `;

        document.body.appendChild(messageDiv);

        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }
}

// Initialize member area
document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('member-area')) {
        window.memberArea = new MemberArea();
    }
});
