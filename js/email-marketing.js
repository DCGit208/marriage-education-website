// Email Marketing Integration
// Supports Mailchimp, ConvertKit, and EmailJS

class EmailMarketing {
    constructor() {
        this.mailchimpApiKey = 'your_mailchimp_api_key';
        this.mailchimpListId = 'your_mailchimp_list_id';
        this.convertkitApiKey = 'your_convertkit_api_key';
        this.convertkitFormId = 'your_convertkit_form_id';
        this.emailjsUserId = 'your_emailjs_user_id';
        this.emailjsServiceId = 'your_emailjs_service_id';
        this.emailjsTemplateId = 'your_emailjs_template_id';
        
        this.initializeEmailJS();
    }

    // Initialize EmailJS for transactional emails
    initializeEmailJS() {
        if (typeof emailjs !== 'undefined') {
            emailjs.init(this.emailjsUserId);
        }
    }

    // Subscribe to Mailchimp
    async subscribeToMailchimp(email, firstName = '', lastName = '', tags = []) {
        try {
            const response = await fetch('/api/mailchimp-subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email_address: email,
                    status: 'subscribed',
                    merge_fields: {
                        FNAME: firstName,
                        LNAME: lastName
                    },
                    tags: tags
                })
            });

            if (!response.ok) {
                throw new Error('Subscription failed');
            }

            return await response.json();
        } catch (error) {
            console.error('Mailchimp subscription error:', error);
            throw error;
        }
    }

    // Subscribe to ConvertKit
    async subscribeToConvertKit(email, firstName = '', tags = []) {
        try {
            const response = await fetch(`https://api.convertkit.com/v3/forms/${this.convertkitFormId}/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    api_key: this.convertkitApiKey,
                    email: email,
                    first_name: firstName,
                    tags: tags
                })
            });

            if (!response.ok) {
                throw new Error('ConvertKit subscription failed');
            }

            return await response.json();
        } catch (error) {
            console.error('ConvertKit subscription error:', error);
            throw error;
        }
    }

    // Send welcome email via EmailJS
    async sendWelcomeEmail(toEmail, firstName, downloadLink = '') {
        try {
            const templateParams = {
                to_email: toEmail,
                to_name: firstName,
                from_name: 'Dr.Coach - Marriage Education',
                message: `Welcome to Marriage Education! Thank you for joining our community.`,
                download_link: downloadLink
            };

            const response = await emailjs.send(
                this.emailjsServiceId,
                this.emailjsTemplateId,
                templateParams
            );

            return response;
        } catch (error) {
            console.error('Welcome email error:', error);
            throw error;
        }
    }

    // Send course access email
    async sendCourseAccessEmail(toEmail, firstName, courseName, accessLink) {
        try {
            const templateParams = {
                to_email: toEmail,
                to_name: firstName,
                from_name: 'Dr.Coach - Marriage Education',
                course_name: courseName,
                access_link: accessLink,
                message: `Congratulations! You now have access to ${courseName}. Click the link below to get started.`
            };

            const response = await emailjs.send(
                this.emailjsServiceId,
                'course_access_template',
                templateParams
            );

            return response;
        } catch (error) {
            console.error('Course access email error:', error);
            throw error;
        }
    }

    // Handle form submissions
    async handleFormSubmission(formData, formType) {
        const { email, firstName = '', lastName = '' } = formData;
        
        try {
            // Subscribe to email list
            let subscriptionResult;
            
            // Choose your preferred email service
            if (this.mailchimpApiKey && this.mailchimpListId) {
                subscriptionResult = await this.subscribeToMailchimp(
                    email, 
                    firstName, 
                    lastName, 
                    [formType]
                );
            } else if (this.convertkitApiKey && this.convertkitFormId) {
                subscriptionResult = await this.subscribeToConvertKit(
                    email, 
                    firstName, 
                    [formType]
                );
            }

            // Send welcome email
            if (formType === 'lead_magnet') {
                await this.sendWelcomeEmail(
                    email, 
                    firstName, 
                    '/downloads/5-secrets-lasting-intimacy.pdf'
                );
            }

            return subscriptionResult;
        } catch (error) {
            console.error('Form submission error:', error);
            throw error;
        }
    }
}

// Form handling functions
function setupEmailForms() {
    const emailMarketing = new EmailMarketing();

    // Handle lead magnet forms
    document.querySelectorAll('.email-form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const email = formData.get('email');
            const firstName = formData.get('first_name') || '';
            
            const submitButton = form.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.textContent = 'Subscribing...';
            submitButton.disabled = true;

            try {
                await emailMarketing.handleFormSubmission({
                    email,
                    firstName
                }, 'lead_magnet');

                // Show success message
                showSuccessMessage('Thank you! Check your email for the download link.');
                form.reset();
            } catch (error) {
                showErrorMessage('Subscription failed. Please try again.');
            } finally {
                submitButton.textContent = originalText;
                submitButton.disabled = false;
            }
        });
    });

    // Handle blog subscription forms
    document.querySelectorAll('.blog-subscribe-form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const email = formData.get('email');
            
            try {
                await emailMarketing.handleFormSubmission({
                    email
                }, 'blog_subscriber');

                showSuccessMessage('Successfully subscribed to our blog!');
                form.reset();
            } catch (error) {
                showErrorMessage('Subscription failed. Please try again.');
            }
        });
    });
}

// Utility functions
function showSuccessMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'success-message';
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #00b894;
        color: white;
        padding: 1rem 2rem;
        border-radius: 5px;
        z-index: 1000;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

function showErrorMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'error-message';
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #d63031;
        color: white;
        padding: 1rem 2rem;
        border-radius: 5px;
        z-index: 1000;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

// Initialize email marketing when DOM is loaded
document.addEventListener('DOMContentLoaded', setupEmailForms);
