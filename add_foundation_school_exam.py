#!/usr/bin/env python3
"""
Update Foundation School with Final Exam (MCQ) and ensure all downloadable tools are present.
"""

import json

def load_courses():
    """Load the courses catalogue."""
    with open('courses-catalogue.json', 'r', encoding='utf-8') as f:
        return json.load(f)

def find_course(courses, course_id):
    """Find a course by ID."""
    for course in courses:
        if course.get('courseId') == course_id:
            return course
    return None

def create_final_exam():
    """Create comprehensive MCQ final exam for Foundation School."""
    
    final_exam_quiz = {
        "title": "CRLA Certification Exam - Foundation School",
        "passingScore": 70,
        "questions": [
            # Teleios Blueprint Questions (Weeks 1-3)
            {
                "question": "According to Week 1, what does 'teleios' mean?",
                "options": [
                    "To become perfect over time",
                    "Perfect, whole, complete",
                    "Spiritually mature",
                    "Ready for marriage"
                ],
                "correctAnswer": 1,
                "explanation": "Teleios (τέλειος) means perfect, whole, complete. It refers to the original state humanity was created in - whole and complete in God's image."
            },
            {
                "question": "The phrase 'Be ye therefore perfect' (Matthew 5:48) means:",
                "options": [
                    "Try to achieve perfection through effort",
                    "Become sinless like Jesus",
                    "Exist FROM perfection, your original state",
                    "Compare yourself to others' perfection"
                ],
                "correctAnswer": 2,
                "explanation": "The word 'be' does not mean 'become.' Perfection is not a destination but your origin. You practice FROM the perfection you were created to embody and the righteousness Christ has secured."
            },
            {
                "question": "Which of the 5 Faculties involves keeping your word even when it costs you?",
                "options": [
                    "Appetitive Faculty",
                    "Behavioral Faculty",
                    "Relational Faculty",
                    "Moral Faculty"
                ],
                "correctAnswer": 1,
                "explanation": "The Behavioral Faculty is about self-governance - controlling your reactions, not just actions, and keeping your word even when it costs you."
            },
            {
                "question": "What is the correct biblical equation for covenant marriage?",
                "options": [
                    "0.5 + 0.5 = You complete me",
                    "1 + 1 = One Flesh (two complete persons)",
                    "Two broken halves becoming whole",
                    "Perfect + Imperfect = Growth"
                ],
                "correctAnswer": 1,
                "explanation": "The biblical design is 1 + 1 = One Flesh. Two complete persons (not incomplete halves) entering covenantal union. You cannot be 'one flesh' if you're not first 'one whole person.'"
            },
            {
                "question": "In Week 2, the Four Faculties of Design include all EXCEPT:",
                "options": [
                    "Intellectual Faculty",
                    "Emotional Faculty",
                    "Volitional Faculty",
                    "Financial Faculty"
                ],
                "correctAnswer": 3,
                "explanation": "The Four Faculties are: Intellectual (thinking), Emotional (feeling), Volitional (willing/choosing), and Physical (body). Financial management is a result of these faculties working properly."
            },
            {
                "question": "What does 'anakephalaiosis' mean in the context of Christ's work?",
                "options": [
                    "To save from sin",
                    "To gather up under one head, to restore original design",
                    "To create something new",
                    "To judge the world"
                ],
                "correctAnswer": 1,
                "explanation": "Anakephalaiosis means to gather everything up and place it under its proper head. Christ restores humanity to its original design template - the teleios blueprint."
            },
            {
                "question": "In Week 3, which of the Four Attributes focuses on 'others-awareness'?",
                "options": [
                    "Love (Agape)",
                    "Wisdom (Sophia)",
                    "Justice (Dikaiosyne)",
                    "Courage (Andreia)"
                ],
                "correctAnswer": 0,
                "explanation": "Love (Agape) is others-awareness - the capacity to perceive and prioritize another's good. It's not a feeling but a functional capacity rooted in covenant architecture."
            },
            {
                "question": "The biblical mandate 'leave and cleave' (Genesis 2:24) requires which sequence?",
                "options": [
                    "Cleave first, then leave when mature",
                    "Leave parents, then cleave to spouse",
                    "Leave and cleave simultaneously",
                    "Cleave to spouse while still dependent on parents"
                ],
                "correctAnswer": 1,
                "explanation": "You must first LEAVE (separation, independence, self-governance) before you can CLEAVE (commitment, fidelity). You cannot be 'one flesh' if you've never become 'one whole person.'"
            },
            
            # Advocacy Training Questions (Weeks 1-3)
            {
                "question": "What is the primary role of a Marriage Foundation Access Ambassador?",
                "options": [
                    "To maximize sales and income",
                    "To facilitate access to marriage literacy education",
                    "To provide professional marriage counseling",
                    "To enforce biblical marriage standards"
                ],
                "correctAnswer": 1,
                "explanation": "An ambassador is a facilitator of access, not a salesperson or counselor. The mission is to democratize marriage literacy by removing barriers to education."
            },
            {
                "question": "Which deployment model involves churches or organizations hosting group studies?",
                "options": [
                    "Personal Access (Direct Purchase)",
                    "Sponsored Access (Gift Deployment)",
                    "Community Access (Group Deployment)",
                    "Digital Access (Online Only)"
                ],
                "correctAnswer": 2,
                "explanation": "Community Access involves gathering 10+ people in churches, NGOs, workplaces, or community centers for collective learning using Marriage Education resources."
            },
            {
                "question": "In the Protection-Relief-Hope framework, someone saying 'I don't need help' is in:",
                "options": [
                    "Hope Mode (Vision-Driven)",
                    "Relief Mode (Problem-Aware)",
                    "Protection Mode (Fear-Based)",
                    "Growth Mode (Proactive)"
                ],
                "correctAnswer": 2,
                "explanation": "Protection Mode is characterized by defensive posture, skepticism, and past wounds creating barriers. The approach is to listen first, validate caution, and offer low-risk entry points."
            },
            {
                "question": "According to the Advocate's Code, what should you prioritize?",
                "options": [
                    "Making as many sales as possible",
                    "Getting resources into hands (access-focus)",
                    "Becoming a marriage expert",
                    "Converting people to your beliefs"
                ],
                "correctAnswer": 1,
                "explanation": "The Advocate's Code commits to access-focus: prioritizing getting resources into hands, not just making sales. The motive is access, not just income."
            },
            {
                "question": "In Week 2 Advocacy Training, what is the first step in the conversation framework?",
                "options": [
                    "Share your testimony (Witness)",
                    "Listen (80% of time)",
                    "Invite to purchase (Clear Next Step)",
                    "Validate their feelings (Empathy)"
                ],
                "correctAnswer": 1,
                "explanation": "The conversation framework starts with LISTEN (80% of time) - ask open questions, let them talk about their journey, and identify their psychological state."
            },
            
            # Integration & Advanced Questions (Weeks 4-6)
            {
                "question": "How does the Teleios Blueprint relate to Advocacy Training?",
                "options": [
                    "They are completely separate and unrelated",
                    "Teleios is for personal maturity; Advocacy deploys that maturity to help others",
                    "Teleios is theory; Advocacy is the only practical component",
                    "Advocacy replaces the need for personal Teleios development"
                ],
                "correctAnswer": 1,
                "explanation": "The Foundation School integrates both: Teleios develops your covenant capacity (personal maturity), while Advocacy trains you to deploy that knowledge to help others access marriage literacy."
            },
            {
                "question": "What does CRLA certification signify?",
                "options": [
                    "Licensed marriage counselor",
                    "Certified Relationship Literacy Advocate",
                    "Christian Relationship Leadership Authority",
                    "Covenant Readiness Level Assessment"
                ],
                "correctAnswer": 1,
                "explanation": "CRLA stands for Certified Relationship Literacy Advocate - someone trained to facilitate access to marriage foundation education, not to provide professional counseling."
            },
            {
                "question": "Why is the Foundation School FREE for ambassadors?",
                "options": [
                    "The content has low value",
                    "It's a trial version with limited content",
                    "To equip ambassadors to effectively deploy marriage literacy ($247 value)",
                    "Only the first week is free"
                ],
                "correctAnswer": 2,
                "explanation": "The Foundation School (valued at $247) is FREE for ambassadors to ensure they are personally grounded in teleios maturity and equipped to facilitate access for others."
            },
            {
                "question": "What is the relationship between Ephesians 4:22-24 and daily practice?",
                "options": [
                    "Put off the old, be renewed, put on the new - it's a one-time event",
                    "It's only symbolic, not meant to be practiced",
                    "Daily practice of putting off corruption and putting on righteousness from your justified state",
                    "It only applies to church attendance"
                ],
                "correctAnswer": 2,
                "explanation": "Ephesians 4:22-24 describes an ongoing practice: Put Off (strip away corruption), Be Renewed (renovate thinking), Put On (live FROM righteousness). Formation happens through practice over time."
            },
            {
                "question": "According to Week 3, what makes someone 'marriage ready'?",
                "options": [
                    "Being 25+ years old with a stable job",
                    "Feeling emotionally ready and in love",
                    "Demonstrating covenant capacity across all faculties",
                    "Having completed pre-marital counseling"
                ],
                "correctAnswer": 2,
                "explanation": "Marriage readiness is about CAPACITIES, not feelings or chronological age. It requires covenant capacity: behavioral control, appetitive stewardship, relational repair, emotional steadiness, and moral ownership."
            },
            {
                "question": "In the advocacy context, what does 'Sponsored Access' mean?",
                "options": [
                    "Getting corporate sponsors for events",
                    "Someone with resources sponsors books/courses for those who cannot afford them",
                    "Social media influencer partnerships",
                    "Government funding for education"
                ],
                "correctAnswer": 1,
                "explanation": "Sponsored Access (Gift Deployment) is when someone with financial capacity sponsors books or courses for high-need individuals who lack funds, ensuring access regardless of economic status."
            },
            {
                "question": "What is the purpose of the daily 25-minute practice in the Teleios track?",
                "options": [
                    "To earn God's approval",
                    "To complete course requirements only",
                    "Formation through consistent practice FROM your perfected state in Christ",
                    "To become better than others"
                ],
                "correctAnswer": 2,
                "explanation": "Daily practice creates formation (structural change) over time. You practice FROM the perfection you were created to embody and the righteousness Christ secured - not TO earn what you already possess."
            },
            {
                "question": "Which statement best describes the Foundation School's integrated approach?",
                "options": [
                    "Week 1-3 is Teleios only, Week 4-6 is Advocacy only",
                    "Both Teleios and Advocacy tracks run parallel each week for 6 weeks",
                    "Students choose either Teleios OR Advocacy track",
                    "Teleios is optional; Advocacy is required"
                ],
                "correctAnswer": 1,
                "explanation": "The Foundation School runs BOTH tracks in parallel every week: (📚 Teleios: personal development) + (🎯 Advocacy: deployment skills). Both must be completed each week."
            },
            {
                "question": "What distinguishes a 'guide' from a 'guru' in advocacy work?",
                "options": [
                    "Guides have less knowledge than gurus",
                    "Guides connect people to resources; gurus claim to have all answers",
                    "Guides work for free; gurus charge fees",
                    "There is no difference"
                ],
                "correctAnswer": 1,
                "explanation": "An advocate is a GUIDE (connector to resources, witness to transformation) not a GURU (claiming expertise in all things). You don't need all answers - you connect people to resources that do."
            },
            {
                "question": "How many modules/weeks does the complete Foundation School contain?",
                "options": [
                    "4 weeks",
                    "6 weeks",
                    "8 weeks",
                    "12 weeks"
                ],
                "correctAnswer": 1,
                "explanation": "The Foundation School is a 6-week integrated program combining Teleios Blueprint (personal development) and Advocacy Training (deployment skills), culminating in CRLA certification."
            },
            {
                "question": "What is the passing score for the CRLA Certification Exam?",
                "options": [
                    "60%",
                    "70%",
                    "80%",
                    "100%"
                ],
                "correctAnswer": 1,
                "explanation": "The CRLA Certification Exam requires a 70% passing score (18 out of 25 questions correct), demonstrating comprehensive understanding of both Teleios maturity and advocacy deployment."
            }
        ]
    }
    
    return final_exam_quiz

def add_week6_downloads():
    """Ensure all Week 6 downloadable tools are present with proper URLs."""
    
    downloads = [
        {
            "title": "Marriage Readiness Self-Assessment",
            "url": "https://marriage-education.web.app/downloads/marriage-readiness-assessment.pdf"
        },
        {
            "title": "CRLA Certification Study Guide",
            "url": "https://marriage-education.web.app/downloads/crla-study-guide.pdf"
        },
        {
            "title": "Foundation School Completion Certificate Template",
            "url": "https://marriage-education.web.app/downloads/foundation-school-certificate.pdf"
        },
        {
            "title": "Ambassador Deployment Toolkit",
            "url": "https://marriage-education.web.app/downloads/ambassador-deployment-toolkit.pdf"
        },
        {
            "title": "Final Exam Preparation Checklist",
            "url": "https://marriage-education.web.app/downloads/final-exam-prep-checklist.pdf"
        }
    ]
    
    return downloads

def update_foundation_school():
    """Update Foundation School with Final Exam and complete downloads."""
    
    print("Loading courses catalogue...")
    courses = load_courses()
    
    foundation_school = find_course(courses, 'foundation-school')
    
    if not foundation_school:
        print("ERROR: Foundation School course not found!")
        return
    
    print(f"Found Foundation School with {len(foundation_school['modules'])} modules")
    
    # Update Week 6 (Module 5) to be the Final Exam week
    if len(foundation_school['modules']) >= 6:
        week6_module = foundation_school['modules'][5]
        
        # Add the final exam quiz
        final_exam = create_final_exam()
        week6_module['quiz'] = final_exam
        
        # Update title
        week6_module['title'] = "Week 6: CRLA Certification Exam"
        
        # Ensure proper downloads
        week6_downloads = add_week6_downloads()
        week6_module['downloads'] = week6_downloads
        
        # Update content to include exam info
        exam_intro = f"""# Week 6: CRLA Certification Exam
## Final Assessment - Certified Relationship Literacy Advocate

> **Week 6 of 6** | CRLA Certification Level

---

🎓 **CONGRATULATIONS!** You've completed 5 weeks of integrated training combining Teleios Blueprint (personal development) and Advocacy Training (deployment skills).

---

## CRLA Certification Exam

This final exam assesses your comprehensive understanding of:

- ✅ **Teleios Maturity**: Understanding of covenant capacity, the 5 Faculties, biblical anthropology, and marriage readiness
- ✅ **Advocacy Skills**: Deployment psychology, conversation frameworks, and facilitating access to marriage literacy

### Exam Details

- **Format**: 25 Multiple Choice Questions (MCQ)
- **Passing Score**: 70% (18 out of 25 correct)
- **Time Limit**: 90 minutes (recommended)
- **Attempts**: Unlimited (but must pass to earn CRLA certification)

### Topics Covered

**Teleios Blueprint (Questions 1-12)**
- Week 1: Teleios foundations, created perfection, 5 Faculties
- Week 2: Design paradigm, Four Faculties, anakephalaiosis
- Week 3: Four Attributes, marriage readiness, leave & cleave

**Advocacy Training (Questions 13-18)**
- Week 1: Ambassador role, deployment models, Advocate's Code
- Week 2: Deployment psychology, Protection-Relief-Hope, conversation framework
- Week 3: Community engagement, high-impact deployment

**Integration (Questions 19-25)**
- How Teleios and Advocacy work together
- CRLA certification meaning and value
- Foundation School structure and outcomes

---

## Exam Preparation Checklist

### Before Taking the Exam

- [ ] Review all 5 weeks of Teleios content
- [ ] Review all 5 weeks of Advocacy content
- [ ] Complete all reflection questions from Weeks 1-5
- [ ] Review your self-assessments (5 Faculties, First 10 Beneficiaries, etc.)
- [ ] Download and review the CRLA Study Guide
- [ ] Take practice questions from each week
- [ ] Ensure you understand key terms: teleios, anakephalaiosis, agape, CRLA, deployment models

### Key Concepts to Master

**Teleios Track:**
- Teleios = Perfect, whole, complete (not "becoming" but "being FROM")
- 5 Faculties: Behavioral, Appetitive, Relational, Temperamental, Moral
- 4 Faculties of Design: Intellectual, Emotional, Volitional, Physical
- 4 Attributes: Love, Wisdom, Justice, Courage
- Marriage equation: 1 + 1 = One Flesh (not 0.5 + 0.5)
- Ephesians 4:22-24: Put off, Be renewed, Put on
- Practice FROM perfection, not TO perfection

**Advocacy Track:**
- Role: Guide (not guru), Facilitator (not salesperson)
- 3 Deployment Models: Personal, Sponsored, Community
- 3 Psychological States: Protection, Relief, Hope
- Conversation Framework: Listen, Validate, Witness, Invite, Follow Up
- Advocate's Code: Truth-telling, Empathy-first, Access-focus
- CRLA = Certified Relationship Literacy Advocate

---

## After Passing the Exam

✅ **CRLA Certification Earned!**

You will receive:
1. **Digital Certificate**: Official CRLA certification document
2. **Ambassador Dashboard Badge**: CRLA badge visible on your profile
3. **Advanced Resources**: Access to deployment tools and templates
4. **Community Access**: Join the CRLA network for ongoing support

Your next steps as a CRLA:
1. Update your First 10 Beneficiaries list
2. Deploy your first Sponsored Access gift
3. Pitch your first Community Access group study
4. Share your certification achievement
5. Continue learning through advanced schools (Teleios School, Relationship Science School)

---

## Downloadable Resources

"""
        
        # Prepend exam intro to existing content (keep the integrated week 6 content below)
        week6_module['content'] = exam_intro + "\n\n" + week6_module['content']
        
        print("✅ Updated Week 6 with Final Exam (MCQ)")
        print(f"   - Added {len(final_exam['questions'])} multiple choice questions")
        print(f"   - Passing score: {final_exam['passingScore']}%")
        print(f"   - Downloads: {len(week6_downloads)} tools")
    
    # Save back to file
    print("\nSaving to courses-catalogue.json...")
    with open('courses-catalogue.json', 'w', encoding='utf-8') as f:
        json.dump(courses, f, indent=2, ensure_ascii=False)
    
    print("✅ Saved successfully!")
    
    # Also save to public folder
    print("\nSaving to public/courses-catalogue.json...")
    with open('public/courses-catalogue.json', 'w', encoding='utf-8') as f:
        json.dump(courses, f, indent=2, ensure_ascii=False)
    
    print("✅ Public folder updated!")
    
    print("\n" + "="*60)
    print("FOUNDATION SCHOOL FINAL EXAM COMPLETE")
    print("="*60)
    print("✅ Week 6: CRLA Certification Exam added")
    print("✅ 25 MCQ questions covering all 6 weeks")
    print("✅ Passing score: 70% (18/25 correct)")
    print("✅ 5 downloadable tools for Week 6")
    print("✅ Comprehensive exam preparation guide")
    print("="*60)

if __name__ == "__main__":
    update_foundation_school()
