# PERFORMANCE OPTIMIZATION GUIDE
# ================================
# 
# Strategies for scaling the SBD Network to handle 10,000+ concurrent users

## 1. FIREBASE OPTIMIZATION

### Firestore Query Optimization
```javascript
// ❌ BAD: Loading entire collections
const allCourses = await db.collection('courses').get();

// ✅ GOOD: Limit queries
const recentCourses = await db.collection('courses')
  .orderBy('createdAt', 'desc')
  .limit(20)
  .get();

// ✅ GOOD: Use indexes for complex queries
const userProgress = await db.collection('users')
  .doc(userId)
  .collection('progress')
  .where('status', '==', 'inProgress')
  .orderBy('lastActivity', 'desc')
  .limit(10)
  .get();
```

### Use Firestore Realtime Listeners Sparingly
```javascript
// ❌ BAD: Realtime listener for rarely-changing data
db.collection('courses').onSnapshot(snapshot => { /* ... */ });

// ✅ GOOD: One-time fetch for static content
const courses = await db.collection('courses').get();

// ✅ GOOD: Realtime only for live data (chat, notifications)
db.collection('boards').doc(boardId).collection('posts')
  .orderBy('createdAt', 'desc')
  .limit(50)
  .onSnapshot(snapshot => { /* ... */ });
```

### Security Rules for Performance
```javascript
// Firestore Security Rules (firestore.rules)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Limit document reads
    match /users/{userId} {
      allow read: if request.auth.uid == userId;
      allow write: if request.auth.uid == userId;
    }
    
    // Use get() sparingly - each costs a read
    match /courses/{courseId} {
      allow read: if request.auth != null 
        && (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.tier in ['foundation', 'premium', 'elite']);
    }
  }
}
```

## 2. CACHING STRATEGIES

### Service Worker Caching
See `/public/service-worker.js` for implementation.

**Cache-First Strategy** (for static assets):
- CSS files
- JavaScript bundles
- Images, icons, logos
- Fonts

**Network-First Strategy** (for dynamic content):
- API calls
- User-specific data
- Real-time content

**Stale-While-Revalidate** (for hybrid content):
- Course lists
- Module content
- Board posts

### LocalStorage Caching
```javascript
// Cache user tier for 5 minutes
function cacheUserTier(userId, tier) {
  const cache = {
    tier,
    timestamp: Date.now(),
    expiresIn: 5 * 60 * 1000 // 5 minutes
  };
  localStorage.setItem(`user_tier_${userId}`, JSON.stringify(cache));
}

function getCachedUserTier(userId) {
  const cached = localStorage.getItem(`user_tier_${userId}`);
  if (!cached) return null;
  
  const data = JSON.parse(cached);
  if (Date.now() - data.timestamp > data.expiresIn) {
    localStorage.removeItem(`user_tier_${userId}`);
    return null;
  }
  
  return data.tier;
}
```

### IndexedDB for Offline Content
```javascript
// Store entire course for offline access
async function cacheCoursesOffline(courseId) {
  const db = await openIndexedDB();
  const course = await fetchCourse(courseId);
  await db.put('courses', course);
}
```

## 3. IMAGE & VIDEO OPTIMIZATION

### Lazy Loading Images
```html
<!-- Native lazy loading -->
<img src="course-thumbnail.jpg" loading="lazy" alt="Course">

<!-- Intersection Observer for more control -->
<img data-src="large-image.jpg" class="lazy-load" alt="Content">

<script>
const lazyImages = document.querySelectorAll('.lazy-load');
const imageObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      img.classList.remove('lazy-load');
      observer.unobserve(img);
    }
  });
});

lazyImages.forEach(img => imageObserver.observe(img));
</script>
```

### Responsive Images
```html
<picture>
  <source srcset="hero-mobile.webp" media="(max-width: 768px)" type="image/webp">
  <source srcset="hero-desktop.webp" media="(min-width: 769px)" type="image/webp">
  <img src="hero-desktop.jpg" alt="Hero" loading="lazy">
</picture>
```

### Video Optimization
```html
<!-- Poster prevents autoload -->
<video poster="thumbnail.jpg" controls preload="metadata">
  <source src="lesson-video.mp4" type="video/mp4">
</video>

<!-- Lazy load video sources -->
<video poster="thumbnail.jpg" controls class="lazy-video">
  <source data-src="lesson-video.mp4" type="video/mp4">
</video>
```

## 4. CODE SPLITTING & BUNDLING

### Defer Non-Critical JavaScript
```html
<!-- Critical: Load immediately -->
<script src="/js/firebase-config.js"></script>
<script src="/js/auth-check.js"></script>

<!-- Non-critical: Defer -->
<script src="/js/quiz.js" defer></script>
<script src="/js/certificate.js" defer></script>

<!-- Third-party: Async -->
<script src="https://cdn.example.com/library.js" async></script>
```

### Dynamic Imports
```javascript
// Load module only when needed
async function openQuiz(quizId) {
  const { loadQuiz, renderQuestion } = await import('/js/quiz.js');
  await loadQuiz(quizId);
  renderQuestion();
}

// Load paywall only when triggered
async function showPaywall() {
  const { createPaywallModal } = await import('/js/paywall.js');
  createPaywallModal();
}
```

## 5. DATABASE DENORMALIZATION

### Store Commonly Accessed Data Together
```javascript
// ❌ BAD: Multiple queries
const user = await db.collection('users').doc(userId).get();
const courses = await db.collection('courses').where('userId', '==', userId).get();
const progress = await db.collection('progress').where('userId', '==', userId).get();

// ✅ GOOD: Denormalize user document
const user = await db.collection('users').doc(userId).get();
// user.data() now includes:
// - activeCourses: ['course1', 'course2']
// - progress: { course1: 45, course2: 80 }
// - tier: 'premium'
// - lastActivity: Timestamp
```

### Aggregate Counts at Write Time
```javascript
// When user completes module, update counters
async function completeModule(userId, moduleId) {
  const userRef = db.collection('users').doc(userId);
  
  await userRef.update({
    'stats.modulesCompleted': firebase.firestore.FieldValue.increment(1),
    'stats.lastCompleted': firebase.firestore.FieldValue.serverTimestamp(),
    'progress.completedModules': firebase.firestore.FieldValue.arrayUnion(moduleId)
  });
}

// Now dashboard can show stats without counting
const user = await db.collection('users').doc(userId).get();
console.log('Modules completed:', user.data().stats.modulesCompleted);
```

## 6. FRONT-END OPTIMIZATIONS

### Debounce Expensive Operations
```javascript
// Search input
let searchTimeout;
function handleSearch(query) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    performSearch(query); // Only fires 300ms after typing stops
  }, 300);
}
```

### Throttle Scroll Events
```javascript
let scrollTimeout;
window.addEventListener('scroll', () => {
  if (scrollTimeout) return;
  
  scrollTimeout = setTimeout(() => {
    updateScrollProgress();
    scrollTimeout = null;
  }, 100); // Max 10 times per second
});
```

### Virtual Scrolling for Large Lists
```javascript
// Instead of rendering 1000 discussion posts, render only visible ones
function renderVisiblePosts(allPosts) {
  const scrollTop = container.scrollTop;
  const viewportHeight = container.clientHeight;
  const itemHeight = 100; // px
  
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.ceil((scrollTop + viewportHeight) / itemHeight);
  
  const visiblePosts = allPosts.slice(startIndex, endIndex);
  renderPosts(visiblePosts);
}
```

## 7. MONITORING & ANALYTICS

### Performance Monitoring
```javascript
// Firebase Performance Monitoring
const perf = firebase.performance();

// Track page load time
const trace = perf.trace('dashboard_load');
trace.start();
await loadDashboardData();
trace.stop();

// Track custom metrics
trace.putMetric('courses_loaded', coursesCount);
trace.putMetric('api_calls', apiCallCount);
```

### Error Tracking
```javascript
// Log errors to Firestore for analysis
window.addEventListener('error', (event) => {
  db.collection('errors').add({
    message: event.error.message,
    stack: event.error.stack,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
});
```

## 8. CDN & ASSET DELIVERY

### Firebase Hosting CDN (Built-in)
Firebase Hosting automatically uses global CDN. Optimize with:

```json
// firebase.json
{
  "hosting": {
    "public": "public",
    "headers": [
      {
        "source": "**/*.@(jpg|jpeg|gif|png|webp|avif)",
        "headers": [{
          "key": "Cache-Control",
          "value": "max-age=31536000" // 1 year
        }]
      },
      {
        "source": "**/*.@(css|js)",
        "headers": [{
          "key": "Cache-Control",
          "value": "max-age=604800" // 1 week
        }]
      }
    ]
  }
}
```

### Serve from Firebase Storage
```javascript
// Upload large files to Storage, not Hosting
const storageRef = firebase.storage().ref();
const videoRef = storageRef.child('videos/lesson-1.mp4');

// Get URL with cache control
const url = await videoRef.getDownloadURL();
// URL includes auth token and CDN caching
```

## 9. REAL-TIME OPTIMIZATIONS

### Batch Firestore Writes
```javascript
// ❌ BAD: Multiple individual writes
await db.collection('posts').doc(postId1).set(data1);
await db.collection('posts').doc(postId2).set(data2);
await db.collection('posts').doc(postId3).set(data3);

// ✅ GOOD: Batch write (counts as 1 operation)
const batch = db.batch();
batch.set(db.collection('posts').doc(postId1), data1);
batch.set(db.collection('posts').doc(postId2), data2);
batch.set(db.collection('posts').doc(postId3), data3);
await batch.commit();
```

### Use Transactions for Consistency
```javascript
// Update user stats atomically
await db.runTransaction(async (transaction) => {
  const userRef = db.collection('users').doc(userId);
  const userDoc = await transaction.get(userRef);
  
  const newCount = (userDoc.data().postsCount || 0) + 1;
  
  transaction.update(userRef, { postsCount: newCount });
});
```

## 10. SCALING CHECKLIST

### Pre-Launch
- [ ] Enable Firebase Performance Monitoring
- [ ] Set up error logging
- [ ] Configure CDN caching headers
- [ ] Implement lazy loading for all images
- [ ] Add service worker caching
- [ ] Test offline functionality
- [ ] Optimize Firestore security rules
- [ ] Create Firestore indexes for all queries
- [ ] Minify CSS and JavaScript
- [ ] Compress images (WebP format)

### Post-Launch Monitoring
- [ ] Monitor Firebase quota usage
- [ ] Track page load times (target: < 3 seconds)
- [ ] Monitor Firestore read/write counts
- [ ] Check CDN cache hit rates
- [ ] Track user engagement metrics
- [ ] Monitor error rates
- [ ] Review slow queries in Firestore
- [ ] Optimize high-traffic pages first

### Scaling Triggers
**Upgrade Firebase Plan if:**
- Daily reads exceed 50,000 (Spark → Blaze)
- Storage exceeds 1 GB
- Hosting bandwidth exceeds 10 GB/month
- Concurrent users exceed 100

**Optimize Database if:**
- Query latency > 500ms
- Document sizes > 1 MB
- Collection scans happening

**Add Caching if:**
- Same data fetched repeatedly
- API response time > 200ms
- User experiences lag

## PERFORMANCE TARGETS

### Page Load Times
- First Contentful Paint: < 1.5 seconds
- Time to Interactive: < 3 seconds
- Cumulative Layout Shift: < 0.1

### Firestore Operations
- Average query time: < 200ms
- Dashboard load: < 10 reads
- Profile page load: < 5 reads

### User Experience
- Button click response: < 100ms
- Form submission feedback: < 500ms
- Page transition: < 300ms

---

**Priority Order for Implementation:**
1. Enable service worker caching (biggest impact)
2. Implement lazy loading for images/videos
3. Add user tier caching (reduces Firestore reads)
4. Denormalize frequently accessed data
5. Add performance monitoring
6. Optimize heavy queries with indexes
7. Implement code splitting for large files
8. Add virtual scrolling for long lists
