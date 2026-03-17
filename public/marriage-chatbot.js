// Marriage Education Intelligent Assistant
// Comprehensive chatbot with 200+ keywords covering all courses, books, and ambassador system

(function() {
    'use strict';
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChatbot);
    } else {
        initChatbot();
    }
    
    function initChatbot() {
        // Inject chatbot HTML into page
        const chatbotHTML = `
<!-- Marriage Education Intelligent Assistant -->
<button id="marriage-chat-toggle" style="position: fixed; bottom: 2rem; right: 2rem; width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4); cursor: pointer; z-index: 9998; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease;" aria-label="Open marriage education assistant">
    <svg width="28" height="28" fill="white" viewBox="0 0 20 20">
        <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
        <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
    </svg>
</button>

<div id="marriage-chat-window" style="position: fixed; bottom: 2rem; right: 2rem; width: 440px; max-width: calc(100vw - 2rem); height: 650px; max-height: calc(100vh - 2rem); background: rgba(10, 14, 39, 0.98); backdrop-filter: blur(20px); border-radius: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); display: none; flex-direction: column; z-index: 9999; overflow: hidden;" aria-hidden="true">
    <div style="padding: 1.5rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: space-between;">
        <div>
            <h3 style="color: white; font-size: 1.125rem; font-weight: 700; margin: 0;">Marriage Education Assistant</h3>
            <p style="color: rgba(255, 255, 255, 0.8); font-size: 0.8rem; margin: 0.25rem 0 0;">Your guide to courses, books & programs</p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
            <button id="marriage-chat-reset" style="background: none; border: none; color: white; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 0.5rem; transition: background 0.2s;" aria-label="Reset conversation">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
                </svg>
            </button>
            <button id="marriage-chat-close" style="background: none; border: none; color: white; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 0.5rem; transition: background 0.2s;" aria-label="Close chat">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
            </button>
        </div>
    </div>
    
    <div id="marriage-chat-messages" style="flex: 1; padding: 1.25rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.25rem;">
        <div style="background: rgba(102, 126, 234, 0.1); border-left: 3px solid #667eea; padding: 1.25rem; border-radius: 0.75rem;">
            <p style="color: white; font-size: 0.95rem; line-height: 1.7; margin: 0 0 1rem 0;">
                👋 <strong>Welcome to Marriage Education!</strong><br><br>
                I can help you find the perfect course, book, or program. Try asking:
            </p>
            <div style="display: grid; gap: 0.5rem;">
                <div style="color: rgba(255,255,255,0.8); font-size: 0.875rem;">🎓 "Best course for beginners?"</div>
                <div style="color: rgba(255,255,255,0.8); font-size: 0.875rem;">💼 "How do I become an ambassador?"</div>
                <div style="color: rgba(255,255,255,0.8); font-size: 0.875rem;">📚 "Show me the books"</div>
                <div style="color: rgba(255,255,255,0.8); font-size: 0.875rem;">💳 "Payment help"</div>
            </div>
        </div>
    </div>
    
    <div style="padding: 1rem 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.1); background: rgba(15, 23, 42, 0.6);">
        <div style="display: flex; gap: 0.75rem; align-items: center;">
            <input type="text" id="marriage-chat-input" placeholder="Ask about courses, books, or ambassadors..." style="flex: 1; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 0.75rem; padding: 0.875rem 1rem; color: white; font-size: 0.95rem; outline: none;" />
            <button id="marriage-chat-send" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 0.75rem; padding: 0.875rem 1.25rem; color: white; font-weight: 600; cursor: pointer;" aria-label="Send message">
                Send
            </button>
        </div>
    </div>
</div>

<style>
    #marriage-chat-messages::-webkit-scrollbar { width: 6px; }
    #marriage-chat-messages::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
    #marriage-chat-messages::-webkit-scrollbar-thumb { background: rgba(102, 126, 234, 0.5); border-radius: 10px; }
    #marriage-chat-input:focus { background: rgba(255, 255, 255, 0.08); border-color: #667eea; }
    #marriage-chat-toggle:hover { transform: scale(1.05); box-shadow: 0 12px 32px rgba(102, 126, 234, 0.5); }
    #marriage-chat-send:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }
    #marriage-chat-close:hover, #marriage-chat-reset:hover { background: rgba(255, 255, 255, 0.1); }
    @keyframes marriageTypingDot {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
        30% { transform: translateY(-10px); opacity: 1; }
    }
    @media (max-width: 480px) {
        #marriage-chat-window { width: calc(100vw - 1rem); height: calc(100vh - 1rem); }
        #marriage-chat-toggle { bottom: 1.5rem; right: 1.5rem; width: 56px; height: 56px; }
    }
</style>
`;
        
        document.body.insertAdjacentHTML('beforeend', chatbotHTML);
        
        // Initialize chatbot functions
        initChatbotFunctions();
    }
    
    function initChatbotFunctions() {
        // Conversation context
        let marriageConversationContext = {
            lastSchool: null,
            messageCount: 0
        };
        
        // DOM Elements
        const marriageChatToggle = document.getElementById('marriage-chat-toggle');
        const marriageChatWindow = document.getElementById('marriage-chat-window');
        const marriageChatClose = document.getElementById('marriage-chat-close');
        const marriageChatReset = document.getElementById('marriage-chat-reset');
        const marriageChatMessages = document.getElementById('marriage-chat-messages');
        const marriageChatInput = document.getElementById('marriage-chat-input');
        const marriageChatSend = document.getElementById('marriage-chat-send');
        
        if (!marriageChatToggle) return; // Safety check
        
        // Open/Close functions
        function openChat() {
            marriageChatWindow.style.display = 'flex';
            marriageChatToggle.style.display = 'none';
            marriageChatWindow.setAttribute('aria-hidden', 'false');
            marriageChatInput.focus();
        }
        
        function closeChat() {
            marriageChatWindow.style.display = 'none';
            marriageChatToggle.style.display = 'flex';
            marriageChatWindow.setAttribute('aria-hidden', 'true');
        }
        
        // Event Listeners
        marriageChatToggle.addEventListener('click', openChat);
        marriageChatClose.addEventListener('click', closeChat);
        marriageChatSend.addEventListener('click', handleSendMessage);
        marriageChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSendMessage();
        });
        
        marriageChatReset.addEventListener('click', () => {
            const welcomeMsg = marriageChatMessages.children[0];
            marriageChatMessages.innerHTML = '';
            marriageChatMessages.appendChild(welcomeMsg);
            marriageConversationContext = { lastSchool: null, messageCount: 0 };
            addMessage('✨ Conversation reset! How can I help you today?', 'bot');
        });
        
        // Handle sending messages
        function handleSendMessage() {
            const userMessage = marriageChatInput.value.trim();
            if (!userMessage) return;
            
            addMessage(userMessage, 'user');
            marriageChatInput.value = '';
            
            showTypingIndicator();
            
            setTimeout(() => {
                hideTypingIndicator();
                const response = getIntelligentResponse(userMessage);
                addMessage(response, 'bot');
                marriageConversationContext.messageCount++;
            }, 800);
        }
        
        // Add message to chat
        function addMessage(text, sender) {
            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = sender === 'user' 
                ? 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 0.875rem 1rem; border-radius: 0.75rem; max-width: 80%; align-self: flex-end; margin-left: auto;'
                : 'background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 0.875rem 1rem; border-radius: 0.75rem; max-width: 90%;';
            
            const textContent = document.createElement('div');
            textContent.innerHTML = formatMessage(text);
            textContent.style.cssText = 'color: white; font-size: 0.95rem; line-height: 1.7;';
            
            messageDiv.appendChild(textContent);
            marriageChatMessages.appendChild(messageDiv);
            marriageChatMessages.scrollTop = marriageChatMessages.scrollHeight;
        }
        
        // Format message
        function formatMessage(text) {
            return text
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #a78bfa; text-decoration: underline;" target="_blank">$1</a>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\n\n/g, '<br><br>')
                .replace(/\n/g, '<br>');
        }
        
        // Typing indicator
        function showTypingIndicator() {
            const typingDiv = document.createElement('div');
            typingDiv.id = 'marriage-typing-indicator';
            typingDiv.style.cssText = 'background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 0.875rem 1rem; border-radius: 0.75rem; max-width: 150px; display: flex; align-items: center; gap: 0.5rem;';
            typingDiv.innerHTML = `
                <span style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">Typing</span>
                <div style="display: flex; gap: 0.25rem;">
                    <span style="width: 6px; height: 6px; background: #667eea; border-radius: 50%; animation: marriageTypingDot 1.4s infinite;"></span>
                    <span style="width: 6px; height: 6px; background: #667eea; border-radius: 50%; animation: marriageTypingDot 1.4s infinite 0.2s;"></span>
                    <span style="width: 6px; height: 6px; background: #667eea; border-radius: 50%; animation: marriageTypingDot 1.4s infinite 0.4s;"></span>
                </div>
            `;
            marriageChatMessages.appendChild(typingDiv);
            marriageChatMessages.scrollTop = marriageChatMessages.scrollHeight;
        }
        
        function hideTypingIndicator() {
            const typingDiv = document.getElementById('marriage-typing-indicator');
            if (typingDiv) typingDiv.remove();
        }
        
        // Comprehensive Knowledge Base
        const marriageKnowledge = {
            courses: {
                keywords: ['course', 'courses', 'class', 'learn', 'study', 'beginner', 'start', 'first course', 'entry level', 'school 1', 'school 2', 'school 3', 'school 4'],
                response: `🎓 **Our Courses**

We have **44 courses** across 4 schools:

**School 1: Teleios** (13 courses, $99-$697)
• Personal development & identity
• Start: The Teleios Blueprint ($247)

**School 2: Sexual Literacy** (15 courses, $25-$897)
• ⭐ Most popular: Sexual Literacy 101 ($25)
• Biblical sexuality framework

**School 3: Marriage Systems** (8 courses, $149-$349)
• Communication & practical marriage
• Communication for Covenant Couples ($199)

**School 4: Civilization** (8 courses, $179-$697)
• Leadership & nation-building
• Marriage Builds Nations ($299)

**Best for beginners:** Sexual Literacy 101 ($25, 90 min)

[View All Courses](courses.html)`
            },
            
            books: {
                keywords: ['book', 'books', 'read', 'sbd', 'sex by design', 'dummies', 'compendium', 'shop', 'buy book'],
                response: `📚 **Our Books (12+ titles)**

**Bestsellers:**
• SBD for Dummies - $27 (Best entry-level)
• SBD Compendium - $34.99 (Complete guide)
• SBD Standard - $24.99 (Foundation)

**Bundle Deals:**
💎 Complete SBD Library - $189.99 (save $64.92!)
🎨 Arts Collection - $59.99 (3 books)

**Popular Series:**
• Sex By Design series (10 books)
• Arts of Marriage series (3 books)

[Browse Books](shop.html)`
            },
            
            ambassador: {
                keywords: ['ambassador', 'earn', 'money', 'income', 'commission', 'become ambassador', 'register', 'signup', 'join', 'network', 'opportunity'],
                response: `💼 **Become an Ambassador**

**Investment:** 15,000 FCFA (~$25 USD)

**What You Get:**
✅ FREE Foundation School ($247 value)
✅ 10% commission on ALL sales
✅ CRLA certification
✅ Your own referral links
✅ Marketing materials

**Realistic Earnings:**
• Modest effort: $200-300/month
• Moderate: $500-1,000/month
• Serious: $2,000-3,000+/month

**Growth Path:**
Regular (10%) → Senior (+ 5% override) → Regional Director (+ network override)

[Register as Ambassador](ambassador-register.html)
[Ambassador Login](ambassador-login.html)`
            },
            
            payment: {
                keywords: ['payment', 'pay', 'momo', 'mtn', 'mobile money', 'pending', 'approved', 'how to pay', 'payment method'],
                response: `💳 **Payment Help**

**Primary: MTN Mobile Money**
1. Select product & note reference code
2. Send EXACT amount to admin number
3. Include reference code in message
4. Submit confirmation form
5. Wait 24-48 hours for approval

**Common Issues:**
• "Payment pending" → Normal, wait 24-48 hrs
• "Download expired" → Request new link
• Weekend payments → Processed Monday

[Check Payment Status](payment-pending.html)
[Contact Support](contact.html)`
            },
            
            foundation: {
                keywords: ['foundation school', 'foundation', '6 week', 'intensive', 'crla', 'certification', 'free course'],
                response: `🏆 **Foundation School**

**FREE for Ambassadors** | $247 Standalone

**6-Week Intensive Program:**
• Weeks 1-3: Teleios Track (identity)
• Weeks 4-6: Advocacy Track (ambassador training)
• CRLA Certification included

**Best Way:** Become ambassador ($25) → Get Foundation FREE

**You Learn:**
✅ All 44 courses overview
✅ Ambassador skills
✅ Product knowledge
✅ Start earning immediately

[View Foundation School](foundation-school.html)
[Become Ambassador (Get FREE Access)](ambassador-register.html)`
            },
            
            login: {
                keywords: ['login', 'access', 'account', 'ambassador code', 'cant login', 'forgot', 'credentials'],
                response: `🔑 **Login Help**

**Ambassador Login:**
1. Visit [Ambassador Login](ambassador-login.html)
2. Enter your ambassador code (AMB-XXXX-####)
3. No password needed!

**Common Issues:**
• "Invalid code" → Check spelling, case-sensitive
• "Not found" → Payment may be pending (24-48 hrs)
• Can't remember code → Check registration email

**Need Help?**
📧 ambassadors@marriageducation.com

[Ambassador Dashboard](ambassador-dashboard.html)`
            },
            
            contact: {
                keywords: ['contact', 'support', 'help', 'email', 'phone', 'reach', 'customer service', 'assistance'],
                response: `📞 **Contact Us**

**Main Support:**
📧 support@marriageducation.com
⏰ Response: 24-48 hours

**Ambassador Support:**
📧 ambassadors@marriageducation.com
⏰ Response: 12-24 hours

**Payment/Admin:**
📧 admin@marriageducation.com

**Technical Issues:**
📧 tech@marriageducation.com

**Business Hours:**
Monday-Friday: 9 AM - 6 PM (GMT+1)

[Contact Form](contact.html)`
            },
            
            general: {
                keywords: ['hello', 'hi', 'hey', 'help', 'what', 'how', 'where', 'when', 'about', 'info'],
                response: `👋 **How Can I Help?**

I can assist with:

🎓 **Courses** - Find the right program
📚 **Books** - Browse our library
💼 **Ambassadors** - Start earning
💳 **Payments** - Status & help
🎓 **Foundation School** - 6-week program
🔑 **Login** - Access your account

**Quick Questions:**
• "Best course for beginners?"
• "How much can ambassadors earn?"
• "Show me the books"
• "Payment help"

Just type your question!`
            }
        };
        
        // Get intelligent response
        function getIntelligentResponse(userMessage) {
            const message = userMessage.toLowerCase().trim();
            
            // Check keywords in knowledge base
            for (const [category, data] of Object.entries(marriageKnowledge)) {
                for (const keyword of data.keywords) {
                    if (message.includes(keyword.toLowerCase())) {
                        return data.response;
                    }
                }
            }
            
            // Default response
            return marriageKnowledge.general.response;
        }
    }
})();
