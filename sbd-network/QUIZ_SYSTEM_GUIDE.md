# Quiz System Implementation Guide

## Overview
The quiz system enforces learning progression by requiring users to pass quizzes (80%+ score) before accessing the next module. Fully integrated with Firebase and the formation system.

## Files Created

### 1. **/public/css/quiz.css**
- Complete quiz UI styling
- Question cards, answer options, progress bar
- Results screen with pass/fail states
- Mobile responsive design
- Accessibility features

### 2. **/public/js/quiz.js**
- Quiz rendering logic
- Answer tracking
- Grading system (80% passing score)
- Firebase integration for saving attempts
- Progress blocking system

### 3. **/public/quiz.html**
- Standalone quiz page
- Loads quiz by ID from URL: `/quiz.html?id=quiz-teleios-week-1`
- Auth-protected
- Prevents accidental page close during quiz

## How It Works

### Quiz Flow
1. User completes a module
2. Module page links to quiz: `/quiz.html?id=quiz-module-123`
3. Quiz displays questions one at a time
4. User selects answers (can navigate back/forth)
5. Submit button appears on last question
6. System calculates score and saves to Firestore
7. If score ≥ 80%, quiz marked as passed in `user.progress.passedQuizzes`
8. User can proceed to next module

### Progress Blocking
Modules can require a previous quiz to be passed:

```javascript
// In module document:
{
  id: 'module-week-2',
  requiredQuizId: 'quiz-week-1', // Must pass this first
  ...
}

// Check requirement:
const requirement = await checkQuizRequirement('module-week-2');
if (requirement.required && !requirement.passed) {
  // Block access, redirect to quiz
  window.location.href = `/quiz.html?id=${requirement.quizId}`;
}
```

## Creating a Quiz

### Firestore Structure
Create quiz documents in the `quizzes` collection:

```javascript
{
  id: 'quiz-teleios-week-1',
  title: 'Teleios Identity - Week 1 Foundations',
  description: 'Test your understanding of Week 1 core concepts',
  moduleId: 'module-teleios-week-1',  // Link to module
  courseId: 'course-teleios-101',      // Link to course
  passingScore: 80,                    // Percentage required to pass
  
  questions: [
    {
      id: 'q1',
      text: 'What is the primary focus of Teleios identity formation?',
      options: [
        {
          id: 'a',
          text: 'Self-improvement and personal success',
          correct: false
        },
        {
          id: 'b',
          text: 'Covenant self-donation and marital formation',
          correct: true
        },
        {
          id: 'c',
          text: 'Conflict resolution techniques',
          correct: false
        },
        {
          id: 'd',
          text: 'Communication skills training',
          correct: false
        }
      ],
      explanation: 'Teleios focuses on covenant identity—learning to become a person capable of total self-donation in marriage, not just improving communication skills.'
    },
    {
      id: 'q2',
      text: 'According to the consent pathway model, what precedes marital intimacy?',
      options: [
        {
          id: 'a',
          text: 'Physical attraction',
          correct: false
        },
        {
          id: 'b',
          text: 'Emotional readiness',
          correct: false
        },
        {
          id: 'c',
          text: 'Full, free, faithful, and fruitful consent',
          correct: true
        },
        {
          id: 'd',
          text: 'Legal marriage certificate',
          correct: false
        }
      ],
      explanation: 'The SBD consent pathway model emphasizes that consent must be full, free, faithful, and fruitful before intimacy.'
    },
    // ... 8-12 more questions for comprehensive assessment
  ],
  
  createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
}
```

### Quiz Best Practices

**Number of Questions:**
- Beginner modules: 8-10 questions
- Intermediate modules: 10-12 questions
- Advanced modules: 12-15 questions

**Question Types:**
- **Conceptual** (50%): Test understanding of core ideas
- **Application** (30%): Scenario-based questions
- **Definition** (20%): Key term recall

**Answer Design:**
- 4 options per question (A, B, C, D)
- 1 correct answer
- 3 plausible distractors (common misconceptions)
- Explanations for learning reinforcement

**Difficulty:**
- 70% moderate difficulty (standard learners get right)
- 20% easy (everyone should get right)
- 10% challenging (tests deep understanding)

### Sample Quiz Creation Script

```javascript
// Admin tool to create quiz (run in Firebase console or admin panel)
async function createQuiz() {
  const quiz = {
    id: 'quiz-teleios-week-2',
    title: 'Teleios Identity - Week 2: Virtue Integration',
    description: 'Assessment covering virtue formation and identity architecture',
    moduleId: 'module-teleios-week-2',
    courseId: 'course-teleios-101',
    passingScore: 80,
    questions: [
      {
        id: 'q1',
        text: 'Which virtue is the foundation of covenant identity?',
        options: [
          { id: 'a', text: 'Temperance', correct: false },
          { id: 'b', text: 'Prudence', correct: false },
          { id: 'c', text: 'Fortitude', correct: false },
          { id: 'd', text: 'Justice', correct: true }
        ],
        explanation: 'Justice—giving the other what is due—forms the foundation of covenant relationships.'
      },
      // Add 9-11 more questions...
    ],
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  await db.collection('quizzes').doc(quiz.id).set(quiz);
  console.log('Quiz created:', quiz.id);
}
```

## Module Integration

### Add Quiz Link to Module Page

In `module.html` or `module.js`:

```javascript
// After module content
const quizButton = document.createElement('button');
quizButton.className = 'btn btn-primary';
quizButton.textContent = '📝 Take Quiz to Continue';
quizButton.onclick = () => {
  window.location.href = `/quiz.html?id=quiz-${moduleId}`;
};

moduleFooter.appendChild(quizButton);
```

### Block Next Module Until Quiz Passed

In next module's `checkAccess()` function:

```javascript
async function checkModuleAccess(moduleId) {
  // Check quiz requirement
  const quizReq = await checkQuizRequirement(moduleId);
  
  if (quizReq.required && !quizReq.passed) {
    // Show locked message
    showLockedMessage({
      title: 'Quiz Required',
      message: 'Complete the previous module\'s quiz to unlock this content.',
      actionText: 'Take Quiz',
      actionUrl: `/quiz.html?id=${quizReq.quizId}`
    });
    return false;
  }
  
  return true;
}
```

## User Progress Tracking

### Firestore User Document Structure

```javascript
{
  uid: 'user123',
  progress: {
    passedQuizzes: [
      'quiz-teleios-week-1',
      'quiz-teleios-week-2',
      // ... more quiz IDs
    ],
    completedModules: ['module-week-1', 'module-week-2'],
    lastActivityDate: Timestamp
  }
}
```

### Quiz Attempt History

Quiz attempts are saved in subcollection:

```javascript
// Path: /users/{userId}/quizAttempts/{attemptId}
{
  quizId: 'quiz-teleios-week-1',
  moduleId: 'module-teleios-week-1',
  courseId: 'course-teleios-101',
  score: 85,              // Percentage
  correctCount: 9,        // Out of total
  totalQuestions: 10,
  passed: true,           // true if score >= passingScore
  answers: ['b', 'a', 'd', ...],  // User's selected option IDs
  startTime: 1234567890,  // Timestamp
  endTime: 1234567900,    // Timestamp
  duration: 10000,        // Milliseconds
  timestamp: Timestamp
}
```

### Query Quiz Results

```javascript
// Get user's quiz attempts
const attempts = await db.collection('users')
  .doc(userId)
  .collection('quizAttempts')
  .where('quizId', '==', 'quiz-teleios-week-1')
  .orderBy('timestamp', 'desc')
  .get();

const latestAttempt = attempts.docs[0]?.data();
console.log('Latest score:', latestAttempt.score + '%');
```

## Admin Tools Needed

### Quiz Editor (Future Phase 5)
Allow admins to create quizzes without code:

1. **Quiz Builder UI**
   - Add/remove questions
   - Mark correct answer per question
   - Add explanations
   - Set passing score
   - Link to module

2. **Question Bank**
   - Reusable questions
   - Tag by topic
   - Difficulty rating
   - Usage analytics

3. **Analytics Dashboard**
   - Average scores per quiz
   - Most missed questions
   - Time to complete
   - Pass rate trends

## Testing Checklist

### Manual Tests
- [ ] Quiz loads correctly with ID parameter
- [ ] All questions display properly
- [ ] Answer selection works (A, B, C, D options)
- [ ] Navigation (Previous/Next/Submit) functional
- [ ] Progress bar updates correctly
- [ ] Submit button disabled until last question answered
- [ ] Score calculation accurate
- [ ] Pass threshold (80%) enforced
- [ ] Failed quiz shows "Retake" option
- [ ] Passed quiz marks module as accessible
- [ ] Quiz attempts save to Firestore
- [ ] passedQuizzes array updates on pass
- [ ] Already-passed quiz shows completion message
- [ ] Mobile responsive design verified

### Edge Cases
- [ ] User closes browser mid-quiz (beforeunload warning)
- [ ] User navigates back to already-passed quiz
- [ ] Quiz with 0 questions (error handling)
- [ ] Quiz not found (404 handling)
- [ ] Network timeout during submission
- [ ] User answers all questions, then changes answers
- [ ] User submits with unanswered questions (confirmation prompt)

### Integration Tests
- [ ] Module → Quiz link works
- [ ] Quiz → Next Module link works (on pass)
- [ ] Quiz blocks module access correctly
- [ ] Dashboard shows quiz progress
- [ ] Certificates reference quiz completion

## Sample Quiz Data

Create sample quizzes for testing:

```bash
# Teleios Week 1 Quiz (Beginner)
/quiz.html?id=quiz-teleios-week-1

# Sexual Literacy Intro (Intermediate)
/quiz.html?id=quiz-sexual-literacy-intro

# Muliebrity Advanced (Hard)
/quiz.html?id=quiz-muliebrity-advanced
```

## Known Limitations

1. **No Question Shuffle**: Questions appear in fixed order
2. **No Answer Shuffle**: Answer options don't randomize (prevents cheating discussion)
3. **No Time Limit**: Users can take unlimited time (add later if needed)
4. **No Partial Credit**: All-or-nothing per question (no multi-select)
5. **No Quiz Cooldown**: Users can immediately retake failed quizzes

## Future Enhancements

1. **Adaptive Quizzes**: Difficulty adjusts based on performance
2. **Question Pool**: Random selection from larger bank
3. **Timed Quizzes**: Optional time limits for advanced content
4. **Peer Review**: Flag questions that are confusing
5. **Detailed Analytics**: Track most-missed questions per user
6. **Quiz Badges**: Awards for perfect scores
7. **Study Mode**: Practice without affecting progress

## Troubleshooting

### Quiz Won't Load
```javascript
// Check console for errors
// Verify quiz exists in Firestore
db.collection('quizzes').doc('quiz-id').get().then(doc => {
  console.log('Quiz exists:', doc.exists);
});
```

### Score Not Updating
```javascript
// Check user.progress.passedQuizzes array
db.collection('users').doc(userId).get().then(doc => {
  console.log('Passed quizzes:', doc.data().progress.passedQuizzes);
});
```

### Module Still Locked After Passing
```javascript
// Verify module.requiredQuizId matches passed quiz
const module = await db.collection('modules').doc('module-id').get();
console.log('Required quiz:', module.data().requiredQuizId);

const user = await db.collection('users').doc(userId).get();
console.log('Passed quizzes:', user.data().progress.passedQuizzes);
```

---

**Status**: Quiz system complete and ready for use. Create quizzes in Firestore and link to modules via `requiredQuizId` field.
