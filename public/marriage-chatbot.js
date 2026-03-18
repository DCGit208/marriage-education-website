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
<button id="marriage-chat-toggle" style="position: fixed; bottom: 2rem; right: 2rem; width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #00b894 0%, #00a085 100%); border: none; box-shadow: 0 8px 24px rgba(0, 184, 148, 0.4); cursor: pointer; z-index: 9998; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease;" aria-label="Open marriage education assistant">
    <svg width="28" height="28" fill="white" viewBox="0 0 20 20">
        <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
        <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
    </svg>
</button>

<div id="marriage-chat-window" style="position: fixed; bottom: 2rem; right: 2rem; width: 440px; max-width: calc(100vw - 2rem); height: 650px; max-height: calc(100vh - 2rem); background: rgba(10, 14, 39, 0.98); backdrop-filter: blur(20px); border-radius: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); display: none; flex-direction: column; z-index: 9999; overflow: hidden;" aria-hidden="true">
    <div style="padding: 1.5rem; background: linear-gradient(135deg, #00b894 0%, #00a085 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.1); display: flex; align-items: center; justify-content: space-between;">
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
        <div style="background: rgba(0, 184, 148, 0.1); border-left: 3px solid #00b894; padding: 1.25rem; border-radius: 0.75rem;">
            <p style="color: white; font-size: 0.95rem; line-height: 1.7; margin: 0 0 1rem 0;">
                👋 <strong>Welcome to Marriage Education!</strong><br><br>
                I can help you find the perfect course, book, or program. Try asking:
            </p>
            <div style="display: grid; gap: 0.5rem;">
                <button class="quick-action-btn" data-query="Best course for beginners?" style="color: rgba(255,255,255,0.8); font-size: 0.875rem; background: rgba(0,184,148,0.1); border: 1px solid rgba(0,184,148,0.3); padding: 0.5rem 0.75rem; border-radius: 0.5rem; cursor: pointer; text-align: left; transition: all 0.2s;">🎓 "Best course for beginners?"</button>
                <button class="quick-action-btn" data-query="How do I become an ambassador?" style="color: rgba(255,255,255,0.8); font-size: 0.875rem; background: rgba(0,184,148,0.1); border: 1px solid rgba(0,184,148,0.3); padding: 0.5rem 0.75rem; border-radius: 0.5rem; cursor: pointer; text-align: left; transition: all 0.2s;">💼 "How do I become an ambassador?"</button>
                <button class="quick-action-btn" data-query="Show me the books" style="color: rgba(255,255,255,0.8); font-size: 0.875rem; background: rgba(0,184,148,0.1); border: 1px solid rgba(0,184,148,0.3); padding: 0.5rem 0.75rem; border-radius: 0.5rem; cursor: pointer; text-align: left; transition: all 0.2s;">📚 "Show me the books"</button>
                <button class="quick-action-btn" data-query="Show me bundles to save money" style="color: rgba(255,255,255,0.8); font-size: 0.875rem; background: rgba(0,184,148,0.1); border: 1px solid rgba(0,184,148,0.3); padding: 0.5rem 0.75rem; border-radius: 0.5rem; cursor: pointer; text-align: left; transition: all 0.2s;">💎 "Show me bundles to save money"</button>
            </div>
        </div>
    </div>
    
    <div style="padding: 1rem 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.1); background: rgba(15, 23, 42, 0.6);">
        <div style="display: flex; gap: 0.75rem; align-items: center;">
            <button id="marriage-chat-voice" style="background: rgba(0,184,148,0.15); border: 1px solid rgba(0,184,148,0.3); border-radius: 0.75rem; padding: 0.875rem; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" aria-label="Voice input" title="Click to speak">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clip-rule="evenodd"/>
                </svg>
            </button>
            <input type="text" id="marriage-chat-input" placeholder="Ask about courses, books, or ambassadors..." style="flex: 1; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 0.75rem; padding: 0.875rem 1rem; color: white; font-size: 0.95rem; outline: none;" />
            <button id="marriage-chat-send" style="background: linear-gradient(135deg, #00b894 0%, #00a085 100%); border: none; border-radius: 0.75rem; padding: 0.875rem 1.25rem; color: white; font-weight: 600; cursor: pointer;" aria-label="Send message">
                Send
            </button>
        </div>
    </div>
</div>

<style>
    #marriage-chat-messages::-webkit-scrollbar { width: 6px; }
    #marriage-chat-messages::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
    #marriage-chat-messages::-webkit-scrollbar-thumb { background: rgba(0, 184, 148, 0.5); border-radius: 10px; }
    #marriage-chat-input:focus { background: rgba(255, 255, 255, 0.08); border-color: #00b894; }
    #marriage-chat-toggle:hover { transform: scale(1.05); box-shadow: 0 12px 32px rgba(0, 184, 148, 0.5); }
    #marriage-chat-send:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0, 184, 148, 0.4); }
    #marriage-chat-close:hover, #marriage-chat-reset:hover { background: rgba(255, 255, 255, 0.1); }
    #marriage-chat-voice:hover { background: rgba(0,184,148,0.25) !important; border-color: rgba(0,184,148,0.5) !important; transform: scale(1.05); }
    #marriage-chat-voice.listening { background: rgba(220,38,38,0.2) !important; border-color: rgba(220,38,38,0.5) !important; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    .quick-action-btn:hover { background: rgba(0,184,148,0.2) !important; border-color: rgba(0,184,148,0.5) !important; transform: translateX(4px); }
    .suggested-btn { display: inline-block; background: rgba(0,184,148,0.15); border: 1px solid rgba(0,184,148,0.4); padding: 0.45rem 0.9rem; margin: 0.25rem; border-radius: 1rem; color: rgba(255,255,255,0.9); font-size: 0.85rem; cursor: pointer; transition: all 0.2s; }
    .suggested-btn:hover { background: rgba(0,184,148,0.25); border-color: rgba(0,184,148,0.6); transform: translateY(-1px); }
    .feedback-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1) !important; transform: scale(1.05); }
    .feedback-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    @keyframes marriageTypingDot {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
        30% { transform: translateY(-10px); opacity: 1; }
    }
    @media (max-width: 480px) {
        #marriage-chat-window { width: calc(100vw - 1rem); height: calc(100vh - 1rem); border-radius: 1rem; }
        #marriage-chat-toggle { bottom: 1.5rem; right: 1.5rem; width: 56px; height: 56px; }
        .quick-action-btn { font-size: 0.8rem !important; padding: 0.4rem 0.6rem !important; }
        .suggested-btn { font-size: 0.75rem; padding: 0.35rem 0.7rem; }
    }
</style>
`;
        
        document.body.insertAdjacentHTML('beforeend', chatbotHTML);
        
        // Initialize chatbot functions
        initChatbotFunctions();
    }
    
    function initChatbotFunctions() {
        // Conversation context with enhanced memory
        let marriageConversationContext = {
            lastSchool: null,
            messageCount: 0,
            topicsDiscussed: [],
            interests: [],
            budget: null,
            situation: null,
            lastCategory: null,
            confusionCount: 0,
            lastQueries: [],
            userId: 'anon_' + Math.random().toString(36).substr(2, 9)
        };
        
        // DOM Elements
        const marriageChatToggle = document.getElementById('marriage-chat-toggle');
        const marriageChatWindow = document.getElementById('marriage-chat-window');
        const marriageChatClose = document.getElementById('marriage-chat-close');
        const marriageChatReset = document.getElementById('marriage-chat-reset');
        const marriageChatMessages = document.getElementById('marriage-chat-messages');
        const marriageChatInput = document.getElementById('marriage-chat-input');
        const marriageChatSend = document.getElementById('marriage-chat-send');
        const marriageChatVoice = document.getElementById('marriage-chat-voice');
        
        // Firestore reference (check if Firebase is loaded)
        const firestoreDB = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
        
        if (!marriageChatToggle) return; // Safety check
        
        // Enhanced Analytics with Firestore + localStorage backup
        const analytics = {
            queries: [],
            logQuery: async function(query, category, feedback = null) {
                const logData = {
                    userId: marriageConversationContext.userId,
                    query: query,
                    category: category,
                    timestamp: new Date().toISOString(),
                    feedback: feedback,
                    context: {
                        situation: marriageConversationContext.situation,
                        budget: marriageConversationContext.budget,
                        topicsDiscussed: marriageConversationContext.topicsDiscussed.slice(-3)
                    }
                };
                
                this.queries.push(logData);
                if (this.queries.length > 50) this.queries.shift();
                
                // Save to localStorage as backup
                try {
                    localStorage.setItem('marriage-chat-analytics', JSON.stringify(this.queries.slice(-20)));
                } catch(e) {}
                
                // Save to Firestore if available
                if (firestoreDB) {
                    try {
                        await firestoreDB.collection('chatbot_analytics').add(logData);
                        console.log('✅ Analytics logged to Firestore');
                    } catch(error) {
                        console.warn('⚠️ Firestore write failed, using localStorage only:', error.message);
                    }
                }
            },
            getPopularTopics: function() {
                const topics = {};
                this.queries.forEach(q => {
                    topics[q.category] = (topics[q.category] || 0) + 1;
                });
                return topics;
            }
        };
        
        // Load previous analytics if available
        try {
            const saved = localStorage.getItem('marriage-chat-analytics');
            if (saved) analytics.queries = JSON.parse(saved);
        } catch(e) {}
        
        // Session persistence - restore conversation on page reload
        function saveSession() {
            try {
                localStorage.setItem('marriage-chat-session', JSON.stringify({
                    context: marriageConversationContext,
                    timestamp: Date.now()
                }));
            } catch(e) {}
        }
        
        function loadSession() {
            try {
                const saved = localStorage.getItem('marriage-chat-session');
                if (saved) {
                    const session = JSON.parse(saved);
                    // Only restore if less than 2 hours old
                    if (Date.now() - session.timestamp < 7200000) {
                        marriageConversationContext = session.context;
                        return true;
                    }
                }
            } catch(e) {}
            return false;
        }
        
        // Load saved session on init
        const sessionRestored = loadSession();
        if (sessionRestored && marriageConversationContext.messageCount > 0) {
            addMessage('👋 Welcome back! I remember our previous conversation. How can I help you today?', 'bot');
        }
        
        // Open/Close functions
        function openChat() {
            marriageChatWindow.style.display = 'flex';
            marriageChatToggle.style.display = 'none';
            marriageChatWindow.setAttribute('aria-hidden', 'false');
            marriageChatInput.focus();
            
            // Track chat open
            analytics.logQuery('_CHAT_OPENED', 'system');
        }
        
        function closeChat() {
            marriageChatWindow.style.display = 'none';
            marriageChatToggle.style.display = 'flex';
            marriageChatWindow.setAttribute('aria-hidden', 'true');
            
            // Save session on close
            saveSession();
        }
        
        // Event Listeners
        marriageChatToggle.addEventListener('click', openChat);
        marriageChatClose.addEventListener('click', closeChat);
        marriageChatSend.addEventListener('click', handleSendMessage);
        marriageChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSendMessage();
        });
        
        // Quick action buttons
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const query = this.getAttribute('data-query');
                marriageChatInput.value = query;
                handleSendMessage();
            });
        });
        
        marriageChatReset.addEventListener('click', () => {
            const welcomeMsg = marriageChatMessages.children[0];
            marriageChatMessages.innerHTML = '';
            marriageChatMessages.appendChild(welcomeMsg);
            marriageConversationContext = { 
                lastSchool: null, 
                messageCount: 0,
                topicsDiscussed: [],
                interests: [],
                budget: null,
                situation: null,
                lastCategory: null,
                confusionCount: 0,
                lastQueries: [],
                userId: 'anon_' + Math.random().toString(36).substr(2, 9)
            };
            // Clear session
            try {
                localStorage.removeItem('marriage-chat-session');
            } catch(e) {}
            addMessage('✨ Conversation reset! How can I help you today?', 'bot');
            analytics.logQuery('_CHAT_RESET', 'system');
        });
        
        // Voice Input - Web Speech API
        let recognition = null;
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';
            
            recognition.onstart = function() {
                marriageChatVoice.classList.add('listening');
                marriageChatVoice.title = 'Listening... (click to stop)';
            };
            
            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript;
                marriageChatInput.value = transcript;
                marriageChatVoice.classList.remove('listening');
                marriageChatVoice.title = 'Click to speak';
                // Auto-send after voice input
                setTimeout(() => handleSendMessage(), 300);
            };
            
            recognition.onerror = function(event) {
                console.warn('Speech recognition error:', event.error);
                marriageChatVoice.classList.remove('listening');
                marriageChatVoice.title = 'Click to speak';
                if (event.error === 'no-speech') {
                    addMessage('🎤 No speech detected. Please try again.', 'bot');
                } else if (event.error === 'not-allowed') {
                    addMessage('🎤 Microphone access denied. Please enable microphone permissions.', 'bot');
                }
            };
            
            recognition.onend = function() {
                marriageChatVoice.classList.remove('listening');
                marriageChatVoice.title = 'Click to speak';
            };
            
            marriageChatVoice.addEventListener('click', () => {
                if (marriageChatVoice.classList.contains('listening')) {
                    recognition.stop();
                } else {
                    recognition.start();
                }
            });
        } else {
            // Voice not supported - hide button
            marriageChatVoice.style.display = 'none';
        }
        
        // Smart Escalation Detection
        function checkEscalationTriggers(userMessage, responseCategory) {
            // Track repeated queries
            marriageConversationContext.lastQueries.push(userMessage.toLowerCase().trim());
            if (marriageConversationContext.lastQueries.length > 3) {
                marriageConversationContext.lastQueries.shift();
            }
            
            // Detect confusion signals
            const confusionKeywords = ['confused', 'don\'t understand', 'unclear', 'what do you mean', 'huh', 'help me', 'frustrated', 'not working', 'doesn\'t make sense'];
            const isConfused = confusionKeywords.some(kw => userMessage.toLowerCase().includes(kw));
            
            // Detect repeated similar queries (user asking same thing multiple times)
            const uniqueQueries = [...new Set(marriageConversationContext.lastQueries)];
            const isRepeating = marriageConversationContext.lastQueries.length >= 3 && uniqueQueries.length === 1;
            
            // Detect if response was "general" (meaning we didn't understand)
            const didntUnderstand = responseCategory === 'general';
            
            if (isConfused || isRepeating || (didntUnderstand && marriageConversationContext.confusionCount > 1)) {
                marriageConversationContext.confusionCount++;
                
                if (marriageConversationContext.confusionCount >= 2) {
                    return true; // Trigger escalation
                }
            } else if (responseCategory !== 'general') {
                // Reset confusion count on successful match
                marriageConversationContext.confusionCount = 0;
            }
            
            return false;
        }
        
        function showEscalation() {
            const escalationHTML = `
                <div style="background: rgba(220,38,38,0.1); border-left: 3px solid #dc2626; padding: 1rem; border-radius: 0.75rem; margin-top: 1rem;">
                    <p style="color: white; font-size: 0.9rem; margin: 0 0 0.75rem 0;">
                        <strong>🆘 Need personalized help?</strong><br>
                        Let me connect you with a real person:
                    </p>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <a href="https://wa.me/+14695039898?text=Hi%2C%20I%20need%20help%20with%20Marriage%20Education%20courses" target="_blank" style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(0,184,148,0.2); border: 1px solid rgba(0,184,148,0.4); padding: 0.5rem 1rem; border-radius: 0.5rem; color: white; text-decoration: none; font-size: 0.85rem; transition: all 0.2s;">
                            💬 WhatsApp Chat
                        </a>
                        <a href="tel:+14695039898" style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(0,184,148,0.2); border: 1px solid rgba(0,184,148,0.4); padding: 0.5rem 1rem; border-radius: 0.5rem; color: white; text-decoration: none; font-size: 0.85rem; transition: all 0.2s;">
                            📞 Call Now
                        </a>
                        <a href="mailto:support@marriageeducation.com?subject=Help%20with%20Marriage%20Education" style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(0,184,148,0.2); border: 1px solid rgba(0,184,148,0.4); padding: 0.5rem 1rem; border-radius: 0.5rem; color: white; text-decoration: none; font-size: 0.85rem; transition: all 0.2s;">
                            ✉️ Email Us
                        </a>
                    </div>
                </div>
            `;
            
            const lastMessage = marriageChatMessages.lastElementChild;
            if (lastMessage) {
                lastMessage.insertAdjacentHTML('beforeend', escalationHTML);
            }
            
            // Log escalation
            analytics.logQuery('_ESCALATION_TRIGGERED', 'escalation');
        }
        
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
                
                // Check if escalation is needed
                const shouldEscalate = checkEscalationTriggers(userMessage, marriageConversationContext.lastCategory);
                if (shouldEscalate) {
                    setTimeout(() => showEscalation(), 500);
                }
                
                // Save session after each interaction
                saveSession();
            }, 800);
        }
        
        // Add message to chat
        function addMessage(text, sender) {
            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = sender === 'user' 
                ? 'background: linear-gradient(135deg, #00b894 0%, #00a085 100%); padding: 0.875rem 1rem; border-radius: 0.75rem; max-width: 80%; align-self: flex-end; margin-left: auto;'
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
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #00b894; text-decoration: underline;" target="_blank">$1</a>')
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
                    <span style="width: 6px; height: 6px; background: #00b894; border-radius: 50%; animation: marriageTypingDot 1.4s infinite;"></span>
                    <span style="width: 6px; height: 6px; background: #00b894; border-radius: 50%; animation: marriageTypingDot 1.4s infinite 0.2s;"></span>
                    <span style="width: 6px; height: 6px; background: #00b894; border-radius: 50%; animation: marriageTypingDot 1.4s infinite 0.4s;"></span>
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
                response: `🎓 **Best Course for Beginners**

⭐ **Sex By Design For Dummies** - $300
The Complete Marriage Handbook for Human Flourishing

**Why Start Here:**
✅ 13-week comprehensive program
✅ Most complete marriage framework
✅ Book included (PDF)
✅ Video lessons + exercises
✅ Lifetime access
✅ Certificate upon completion

**Our Full Course Library (44 courses):**

**School 1: Teleios** (13 courses, $99-$697)
• Personal development & identity
• The Teleios Blueprint ($247)

**School 2: Sexual Literacy** (15 courses, $25-$897)
• Sexuality education framework
• Budget option: Sexual Literacy 101 ($25)

**School 3: Marriage Systems** (8 courses, $149-$349)
• Communication & practical marriage
• Communication for Covenant Couples ($199)

**School 4: Civilization** (8 courses, $179-$697)
• Leadership & nation-building
• Marriage Builds Nations ($299)

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
            
            coaching: {
                keywords: ['coaching', 'counseling', 'help', 'crisis', 'struggling', 'marriage problems', 'therapy', 'counselor', '1:1', 'one on one', 'private help', 'personal help', 'couples help', 'marriage help', 'need help', 'intensive', 'breakthrough'],
                response: `💝 **Need Personal Help? We're Here.**

**🎯 SBD Private Coaching — 1:1 with Dr. Coach**
**Best for:** Individuals or couples needing *precision* help, not generic advice

**What You Get:**
✅ Deep diagnostic using SBD & Teleios framework
✅ Custom practice plan (6-12 weeks)
✅ Between-session support (email/WhatsApp)
✅ 60-minute sessions (video/phone)

**Investment:** $150/hour (bundles available)

**Contact Us:**
[📧 Email](mailto:orders@marriageducation.com?subject=Private%20Coaching%20Inquiry) | [💬 WhatsApp](https://wa.me/237677604100?text=Hi%2C%20I%27m%20interested%20in%20SBD%20Private%20Coaching) | [📞 Call](tel:+237677604100)

---

**🔥 SBD Marriage Labs — Weekend Intensives**
**Best for:** Couples needing breakthrough in 48 hours

**What You Experience:**
✅ 2 days of teaching + labs + guided conversations
✅ Sexual literacy labs (covenant-anchored)
✅ Personal development integration
✅ Follow-up group calls after retreat

**Investment:** From $899/couple (venue dependent)

**Contact Us:**
[📧 Email](mailto:orders@marriageducation.com?subject=SBD%20Marriage%20Lab%20Registration) | [💬 WhatsApp](https://wa.me/237677604100?text=Hi%2C%20I%27m%20interested%20in%20the%20SBD%20Marriage%20Lab) | [📞 Call](tel:+237677604100)

---

**Need guidance?** Click any icon above to reach us!

[View All Coaching Options](courses.html#premium-support)`
            },
            
            bundles: {
                keywords: ['bundle', 'bundles', 'package', 'deal', 'deals', 'save money', 'discount', 'best value', 'save', 'savings', 'combo', 'everything', 'all courses', 'lifetime', 'lifetime access'],
                response: `💎 **Course Bundles - MASSIVE Savings!**

**🔥 Sexual Mastery Bundle** - $399
Save $793 (67% off!) | Value: $1,192

**Includes:**
• The Art of Sexuality ($397)
• The Art of Seduction ($347)
• The Art of Nakedness ($199)
• Sexual Imagination Course ($249)
[Get Bundle](payment.html?product=bundle-sexual-mastery&price=399)

---

**🎯 Teleios Development Bundle** - $299
Save $445 (60% off!) | Value: $744

**Includes:**
• The Teleios Blueprint ($247)
• Identity Mastery ($149)
• The Heart of Relationship ($149)
• Four Faculties Training ($199)
[Get Bundle](payment.html?product=bundle-teleios&price=299)

---

**💼 Marriage Governance Bundle** - $349
Save $545 (61% off!) | Value: $894

**Includes:**
• Marriage System Design ($297)
• Covenant Governance ($249)
• Daily Liturgies of Marriage ($149)
• Communication Mastery ($199)
[Get Bundle](payment.html?product=bundle-marriage-governance&price=349)

---

**🌟 ULTIMATE: Lifetime Access Pass** - $1,997
ALL courses (current + future) + books + lifetime membership!

[View All Bundles](courses.html#bundles)`
            },
            
            magazine: {
                keywords: ['magazine', 'subscription', 'subscribe', 'publication', 'articles', 'reading', 'content', 'sbd magazine', 'quarterly', 'monthly'],
                response: `📖 **SBD Magazine - World's #1 Marriage Education Publication**

**Join 200,000+ Couples Worldwide!**

**What You Get:**
✓ 200+ pages per issue
✓ 3 issues per year
✓ Expert articles & real transformation stories
✓ Practical guides & exercises
✓ Digital + Print options available
✓ Ships to 50+ countries

**Why Subscribe?**
• Cutting-edge insights on sexuality
• Real couple testimonials
• Expert guidance from Dr. Coach
• Comprehensive marriage education

**Special Offer:**
🎁 Get FREE sample issue to preview!

[View Magazine Details](magazine.html)
[Get Free Sample](magazine.html#free-sample)
[Subscribe Now](magazine.html#subscription)`
            },
            
            corporate: {
                keywords: ['corporate', 'business', 'company', 'enterprise', 'bulk', 'bulk order', 'team', 'workplace', 'hr', 'employee', 'organization', 'church', 'group'],
                response: `🏢 **Corporate Training Programs**

**Transform Your Workplace with Professional Marriage Education**

**Perfect For:**
• HR departments & wellness programs
• Churches & ministry groups
• Corporate team building
• Employee benefits packages
• Bulk orders for organizations

**Benefits:**
✅ Reduce workplace conflict
✅ Boost employee retention & satisfaction
✅ Enhance team dynamics
✅ Custom training packages
✅ Volume discounts available
✅ Dedicated account manager

**Program Options:**
• **Bronze**: Basic course access (10+ licenses)
• **Silver**: Training + support (25+ licenses)
• **Gold**: Full suite + coaching (50+ licenses)

**Industries We Serve:**
Tech companies, healthcare, education, ministry, government

**Contact Us:**
[📧 Email](mailto:orders@marriageducation.com?subject=Corporate%20Training%20Inquiry) | [💬 WhatsApp](https://wa.me/237677604100?text=Hi%2C%20interested%20in%20corporate%20training) | [📞 Call](tel:+237677604100)

[View Corporate Programs](corporate.html)`
            },
            
            situations: {
                keywords: ['engaged', 'engaged couple', 'getting married', 'about to marry', 'wedding', 'premarital', 'pre-marriage', 'struggling', 'problems', 'fighting', 'argue', 'divorce', 'considering divorce', 'crisis', 'budget', 'cheap', 'affordable', 'cant afford', 'expensive', 'single', 'not married', 'dating', 'newlywed', 'just married', 'married years', 'intimacy issues', 'sex problems', 'communication problems', 'trust issues', 'infidelity', 'affair'],
                response: `🎯 **Let me recommend the perfect solution for your situation:**

**💍 Engaged/Getting Married?**
Start with: **Sexual Literacy 101** ($25) or **SBD for Dummies Course** ($300)
[View Pre-Marriage Options](courses.html)

**🆘 Struggling/Crisis?**
Get help now: **Private Coaching** ($150/hr) or **Marriage Lab** ($899)
[📧 Email](mailto:orders@marriageducation.com?subject=Urgent%20Help%20Needed) | [💬 WhatsApp](https://wa.me/237677604100?text=Need%20urgent%20marriage%20help) | [📞 Call](tel:+237677604100)

**💰 On a Budget?**
Best value: **Sexual Literacy 101** ($25) or **SBD Dummies Book** ($27)
Want everything later? Become **Ambassador** ($25) → Get Foundation School FREE!
[Budget Options](shop.html)

**👤 Single/Dating?**
Build foundation: **Teleios Blueprint** ($247) or **Identity Mastery** ($149)
[Personal Development Courses](courses.html)

**💑 Newlywed?**
Perfect start: **Sexual Literacy 101** ($25) + **Communication Course** ($199)
[Newlywed Packages](courses.html)

**🔥 Intimacy/Bedroom Issues?**
Get: **Sexual Mastery Bundle** ($399, saves $793!) includes all sexuality courses
[View Sexual Mastery Bundle](courses.html#bundles)

**💬 Communication Problems?**
Try: **Communication for Covenant Couples** ($199)
[View Communication Courses](courses.html)

Tell me more about your situation for a personalized recommendation!`
            },
            
            contact: {
                keywords: ['contact', 'support', 'email', 'phone', 'reach', 'customer service', 'assistance'],
                response: `📞 **Contact Us**

**Main Support:**
[📧 Email](mailto:support@marriageducation.com) | [💬 WhatsApp](https://wa.me/237677604100) | [📞 Call](tel:+237677604100)
⏰ Response: 24-48 hours

**Ambassador Support:**
[📧 Email](mailto:ambassadors@marriageducation.com)
⏰ Response: 12-24 hours

**Payment/Admin:**
[📧 Email](mailto:admin@marriageducation.com)

**Technical Issues:**
[📧 Email](mailto:tech@marriageducation.com)

**Business Hours:**
Monday-Friday: 9 AM - 6 PM (GMT+1)

[Contact Form](contact.html)`
            },
            
            general: {
                keywords: ['hello', 'hi', 'hey', 'what', 'how', 'where', 'when', 'about', 'info'],
                response: `👋 **How Can I Help?**

I can assist with:

🎓 **Courses** - Find the right program
📚 **Books** - Browse our library
� **Bundles** - Save BIG on packages (up to 67% off!)
📖 **Magazine** - Subscribe to SBD Magazine
💝 **Coaching/Counseling** - Get personal help
💼 **Ambassadors** - Start earning commissions
🏢 **Corporate** - Training for businesses/churches
💳 **Payments** - Status & help
🎓 **Foundation School** - 6-week program
🔑 **Login** - Access your account

**Smart Recommendations:**
• "I'm engaged"
• "We're struggling"
• "On a budget"
• "Want everything"
• "Intimacy issues"

**Quick Questions:**
• "Best course for beginners?"
• "Show me bundles to save money"
• "I need counseling help"
• "How do I subscribe to the magazine?"

Just type your question - I'll help you find exactly what you need!`
            },
            
            faqs: {
                keywords: ['refund', 'guarantee', 'return', 'cancel', 'expire', 'lifetime', 'access', 'download', 'format', 'biblical', 'christian', 'for singles', 'for couples', 'certificate', 'certified', 'accredited'],
                response: `❓ **Frequently Asked Questions**

**Do courses expire?**
✅ No! All courses include **LIFETIME ACCESS** - study at your own pace forever.

**Can I get a refund?**
✅ Yes! **30-day money-back guarantee** on all digital products.

**Is this biblical/Christian?**
✅ Absolutely! All content is **covenant-anchored** and biblically sound.

**For singles or couples?**
✅ **Both!** Singles: Teleios courses. Couples: Sexual Literacy & Marriage courses.

**Do I get a certificate?**
✅ Yes! Certificates provided upon course completion.

**What format are books/courses?**
✅ Books: Digital (PDF) + Print options. Courses: Video lessons + workbooks.

**Can I cancel my magazine subscription?**
✅ Yes, cancel anytime. No questions asked.

**Is my payment secure?**
✅ Yes! We use MTN Mobile Money (local) or Stripe (international) - both secure.

**Do you ship internationally?**
✅ Yes! We ship books/magazines to **50+ countries**.

**Can I share course access?**
✅ Courses are for personal use. Want to share? Check our [Corporate Programs](corporate.html)!

More questions? Ask away!`
            },
            
            pricing: {
                keywords: ['price', 'cost', 'how much', 'pricing', 'under', 'less than', 'cheap', 'cheapest', 'most expensive', 'compare prices', 'what costs'],
                response: `💰 **Price Guide**

**BUDGET-FRIENDLY (Under $50):**
• Sexual Literacy 101 - **$25** ⭐ Best beginner value
• Ambassador Registration - **$25** (includes FREE Foundation School!)
• SBD for Dummies book - **$27**
• SBD Standard book - **$24.99**

**MID-RANGE ($50-$300):**
• Single courses - **$99-$299**
• Most books - **$27-$35**
• Book bundles - **$60-$190**
• SBD for Dummies Course - **$300** (book included)

**PREMIUM ($300-$900):**
• Course bundles - **$299-$399** (save 60-67%!)
• Advanced courses - **$397-$697**
• Marriage Lab weekend - **$899/couple**

**ULTIMATE:**
• **Lifetime Access Pass** - **$1,997** (ALL courses forever!)

**MAXIMUM SAVINGS:**
💎 **Sexual Mastery Bundle** - $399 (saves $793!)
💎 **Teleios Bundle** - $299 (saves $445!)
💎 **Marriage Governance Bundle** - $349 (saves $545!)

**Want to earn instead?**
Become an **Ambassador** for $25 → Earn 10% on all sales!

[View All Pricing](courses.html)
[See Bundle Deals](courses.html#bundles)`
            },
            
            comparison: {
                keywords: ['difference between', 'vs', 'versus', 'compare', 'which is better', 'or', 'should i get', 'what\'s better', 'course vs book', 'book or course'],
                response: `⚖️ **Comparison Guide**

**📚 SBD Book vs 🎓 SBD Course:**
• **Book** ($27): Read at your pace, no exercises, immediate access
• **Course** ($300): 13 weeks, video lessons, exercises, exams, certificate, book included
• **Best**: Course if you want transformation + certificate

**💼 Ambassador vs 🎓 Student:**
• **Ambassador** ($25): Get Foundation School FREE + earn 10% commissions
• **Student** ($247): Pay for Foundation School, no commissions
• **Best**: Ambassador route saves $222 AND you earn!

**📖 Magazine vs 📚 Books:**
• **Magazine** (subscription): Ongoing content, 3x/year, community stories
• **Books**: One-time purchase, deep-dive specific topics, reference material
• **Best**: Both! Magazine for fresh content, books for depth

**🎯 Single Course vs 💎 Bundle:**
• **Single course**: $99-$697 each
• **Bundle**: $299-$399 for 4+ courses (save 60-67%!)
• **Best**: Bundle if you want complete training in one area

**🔥 Coaching vs 🎓 Courses:**
• **Coaching** ($150/hr): 1-on-1 personalized help, immediate crisis support
• **Courses**: Self-paced learning, lifetime access, no pressure
• **Best**: Coaching for crisis/urgency, courses for self-study

**🌟 Lifetime Pass vs 💎 Bundles:**
• **Lifetime** ($1,997): ALL 44+ courses forever + future releases
• **Bundles** ($299-$399): Specific topic focus (4 courses each)
• **Best**: Lifetime if you want EVERYTHING, bundles for targeted learning

**School 1 vs School 2 vs School 3 vs School 4:**
• **School 1 (Teleios)**: Personal identity & development
• **School 2 (Sexual Literacy)**: Sexuality & intimacy
• **School 3 (Marriage Systems)**: Communication & governance
• **School 4 (Civilization)**: Leadership & nation-building
• **Best**: Start School 2 if married, School 1 if single

Need specific comparison? Ask me! "What's the difference between [X] and [Y]?"`
            },
            
            wizard: {
                keywords: ['recommend', 'recommendation', 'help me choose', 'what should i', 'not sure', 'guide me', 'confused', 'dont know', 'undecided'],
                response: `🧙‍♂️ **Let Me Guide You - Answer These Questions:**

**1️⃣ What's your current situation?**
• Single/Dating
• Engaged (getting married soon)
• Newlywed (married <2 years)
• Married 2-10 years
• Married 10+ years
• Struggling/Crisis

**2️⃣ What's your main goal?**
• Better intimacy/sexuality
• Improve communication
• Rebuild trust
• Personal growth/identity
• Leadership/impact
• Save my marriage (urgent)

**3️⃣ What's your budget?**
• Under $50 (budget-conscious)
• $50-$300 (moderate investment)
• $300-$900 (serious commitment)
• $1,000+ (want everything)

**4️⃣ Learning style preference?**
• Books (read at my pace)
• Video courses (structured learning)
• 1-on-1 coaching (personal help)
• Weekend intensive (fast breakthrough)
• Magazine (ongoing content)

**Just tell me your answers!** Example:
"I'm married 5 years, want better communication, budget $200, prefer video courses"

I'll give you the PERFECT recommendation! 🎯`
            },
            
            followup: {
                keywords: ['what else', 'anything else', 'what next', 'more', 'tell me more', 'continue', 'and'],
                response: `💡 **Great question! Here are your next steps:**

**Based on what we discussed, you might also want to know about:**

📚 **Related Resources:**
• Check our bundles to save money (up to 67% off!)
• See if becoming an ambassador makes sense ($25 = FREE Foundation School + earn commissions)
• Preview our magazine subscription (200K+ readers)

🎯 **Smart Next Actions:**
• Ready to purchase? [View payment options](payment.html)
• Want personalized help? [Contact us via WhatsApp](https://wa.me/237677604100)
• Need more time? [Browse all courses](courses.html)

❓ **Common Follow-Up Questions:**
• "How do I pay?"
• "What's the difference between X and Y?"
• "Show me bundle deals"
• "I need help choosing"
• "Can I talk to someone?"

**What would you like to explore next?** 🌟`
            }
        };
        
        // Get intelligent response with priority matching and memory
        function getIntelligentResponse(userMessage) {
            const message = userMessage.toLowerCase().trim();
            
            // Track topics discussed for context
            const topicDetection = {
                'course': 'courses',
                'book': 'books',
                'bundle': 'bundles',
                'ambassador': 'ambassador',
                'magazine': 'magazine',
                'coach': 'coaching',
                'price': 'pricing',
                'engaged': 'engaged',
                'budget': 'budget'
            };
            
            // Detect and track interests
            for (const [keyword, topic] of Object.entries(topicDetection)) {
                if (message.includes(keyword) && !marriageConversationContext.topicsDiscussed.includes(topic)) {
                    marriageConversationContext.topicsDiscussed.push(topic);
                }
            }
            
            // Detect budget mentions
            if (message.match(/\$?\d+/)) {
                const matches = message.match(/\$?(\d+)/);
                if (matches) marriageConversationContext.budget = parseInt(matches[1]);
            }
            
            // Detect situation
            if (message.includes('engaged') || message.includes('getting married')) {
                marriageConversationContext.situation = 'engaged';
            } else if (message.includes('struggling') || message.includes('crisis')) {
                marriageConversationContext.situation = 'crisis';
            } else if (message.includes('single') || message.includes('dating')) {
                marriageConversationContext.situation = 'single';
            }
            
            // Priority order: check specific features first
            const priorityOrder = ['wizard', 'comparison', 'followup', 'situations', 'faqs', 'pricing', 'bundles', 'coaching', 'magazine', 'corporate', 'courses', 'books', 'ambassador', 'payment', 'foundation', 'login', 'contact', 'general'];
            
            // Check categories in priority order
            for (const categoryName of priorityOrder) {
                const data = marriageKnowledge[categoryName];
                if (!data) continue;
                
                for (const keyword of data.keywords) {
                    if (message.includes(keyword.toLowerCase())) {
                        marriageConversationContext.lastCategory = categoryName;
                        
                        // Track analytics
                        analytics.logQuery(userMessage, categoryName);
                        
                        return addFollowUp(data.response, categoryName);
                    }
                }
            }
            
            // Default response
            analytics.logQuery(userMessage, 'general');
            return addFollowUp(marriageKnowledge.general.response, 'general');
        }
        
        // Add contextual follow-up suggestions with clickable buttons and feedback
        function addFollowUp(response, category) {
            // Don't add follow-ups to certain categories
            if (['followup', 'wizard', 'general'].includes(category)) {
                return response;
            }
            
            const followUpButtons = {
                'courses': ['Show me bundles', 'Help me decide', 'How do I pay?'],
                'books': ['What courses?', 'Show bundle deals', 'Best for beginners?'],
                'bundles': ['How do I pay?', 'Compare courses', 'Lifetime pass vs bundle'],
                'coaching': ['What courses?', 'Show me prices', 'How do I pay?'],
                'magazine': ['Show courses', 'What books?', 'Show bundles'],
                'ambassador': ['Ambassador vs student?', 'Show Foundation School', 'How do I apply?'],
                'situations': ['Show me bundles', 'Help me choose', 'I need coaching'],
                'pricing': ['Show bundles', 'Course vs book?', 'Payment plans?'],
                'faqs': ['Help me decide', 'How much?', 'Show bundles'],
                'payment': ['Recommend a course', 'Show deals', 'Ambassador program?'],
                'corporate': ['Contact coaching', 'Show courses', 'Bulk pricing?'],
                'comparison': ['How do I pay?', 'Help me choose', 'Show bundles']
            };
            
            const buttons = followUpButtons[category] || ['Show bundles', 'Help me choose', 'What courses?'];
            
            // Create clickable button HTML
            const buttonHTML = buttons.map(btn => 
                `<button class="suggested-btn" data-query="${btn}">${btn}</button>`
            ).join(' ');
            
            // Add feedback buttons
            const feedbackHTML = `
                <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; gap: 0.5rem;">
                    <span style="color: rgba(255,255,255,0.6); font-size: 0.8rem;">Was this helpful?</span>
                    <button class="feedback-btn" data-feedback="positive" data-category="${category}" style="background: none; border: 1px solid rgba(255,255,255,0.2); padding: 0.3rem 0.7rem; border-radius: 0.5rem; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 0.85rem; transition: all 0.2s;">
                        👍 Yes
                    </button>
                    <button class="feedback-btn" data-feedback="negative" data-category="${category}" style="background: none; border: 1px solid rgba(255,255,255,0.2); padding: 0.3rem 0.7rem; border-radius: 0.5rem; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 0.85rem; transition: all 0.2s;">
                        👎 No
                    </button>
                </div>
            `;
            
            return response + `\n\n💡 **Quick Actions:**\n<div style="margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">${buttonHTML}</div>${feedbackHTML}`;
        }
        
        // Auto-Learning System with Safety Thresholds
        const learningSystem = {
            data: {},
            thresholds: {
                minSamples: 10,
                confidenceLevel: 0.70
            },
            
            async recordFeedback(category, isPositive) {
                if (!this.data[category]) {
                    this.data[category] = { positive: 0, negative: 0, total: 0 };
                }
                
                this.data[category].total++;
                if (isPositive) {
                    this.data[category].positive++;
                } else {
                    this.data[category].negative++;
                }
                
                // Save to localStorage
                try {
                    localStorage.setItem('marriage-chat-learning', JSON.stringify(this.data));
                } catch(e) {}
                
                // Save to Firestore
                if (firestoreDB) {
                    try {
                        await firestoreDB.collection('chatbot_learning').doc('feedback_data').set({
                            categories: this.data,
                            lastUpdated: new Date().toISOString()
                        }, { merge: true });
                    } catch(error) {
                        console.warn('⚠️ Learning data save failed:', error.message);
                    }
                }
                
                // Check if adjustment needed
                this.evaluateAdjustments();
            },
            
            evaluateAdjustments() {
                for (const [category, stats] of Object.entries(this.data)) {
                    // Only adjust if we have enough samples
                    if (stats.total < this.thresholds.minSamples) continue;
                    
                    const successRate = stats.positive / stats.total;
                    
                    // Low success rate - may need attention
                    if (successRate < this.thresholds.confidenceLevel) {
                        console.log(`⚠️ Category "${category}" has low success rate: ${(successRate * 100).toFixed(1)}% (${stats.total} samples)`);
                        // Don't auto-adjust responses, just log for review
                    } else {
                        console.log(`✅ Category "${category}" performing well: ${(successRate * 100).toFixed(1)}% (${stats.total} samples)`);
                    }
                }
            },
            
            loadData() {
                try {
                    const saved = localStorage.getItem('marriage-chat-learning');
                    if (saved) {
                        this.data = JSON.parse(saved);
                        console.log('📊 Learning data loaded:', this.data);
                    }
                } catch(e) {}
            },
            
            getInsights() {
                const insights = [];
                for (const [category, stats] of Object.entries(this.data)) {
                    if (stats.total >= this.thresholds.minSamples) {
                        const successRate = (stats.positive / stats.total * 100).toFixed(1);
                        insights.push(`${category}: ${successRate}% (${stats.total} samples)`);
                    }
                }
                return insights;
            }
        };
        
        // Load learning data on init
        learningSystem.loadData();
        
        // Handle clicks on suggested buttons and feedback buttons (delegated event handling)
        document.addEventListener('click', function(e) {
            // Suggested action buttons
            if (e.target.classList.contains('suggested-btn')) {
                const query = e.target.getAttribute('data-query');
                if (query) {
                    marriageChatInput.value = query;
                    handleSendMessage();
                }
            }
            
            // Feedback buttons
            if (e.target.classList.contains('feedback-btn')) {
                const feedback = e.target.getAttribute('data-feedback');
                const category = e.target.getAttribute('data-category');
                const isPositive = feedback === 'positive';
                
                // Record feedback
                learningSystem.recordFeedback(category, isPositive);
                
                // Log to analytics
                analytics.logQuery(`_FEEDBACK_${feedback.toUpperCase()}`, category, feedback);
                
                // Update UI
                e.target.style.background = isPositive ? 'rgba(0,184,148,0.3)' : 'rgba(220,38,38,0.3)';
                e.target.style.borderColor = isPositive ? 'rgba(0,184,148,0.6)' : 'rgba(220,38,38,0.6)';
                e.target.disabled = true;
                
                // Disable the other button too
                const siblingBtn = e.target.parentElement.querySelector('.feedback-btn:not([disabled])');
                if (siblingBtn) siblingBtn.disabled = true;
                
                // Show thank you
                const thankYou = document.createElement('span');
                thankYou.style.cssText = 'color: rgba(255,255,255,0.6); font-size: 0.8rem; margin-left: 0.5rem;';
                thankYou.textContent = isPositive ? '✨ Thanks!' : '📝 Noted, we\'ll improve!';
                e.target.parentElement.appendChild(thankYou);
            }
        });
    }
})();
