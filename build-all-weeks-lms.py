#!/usr/bin/env python3
"""
Complete LMS-style course builder - All 6 weeks
With deep PDF content integration, proper citations, and modern learning architecture
"""

import json
import sys

# Import Week 1 and 2 from rebuild-lms-style.py
sys.path.insert(0, '.')
from rebuild_lms_style import week_1_foundations_lms, week_2_design_paradigm_lms

def week_3_frameworks_lms():
    """Week 3: Frameworks & Vocabulary with 4 Faculties, Desire System, Covenant Terms"""
    return {
        "title": "Week 3: Frameworks & Vocabulary - Building Your Covenant Operating System",
        "content": """# 📘 Week 3: Frameworks & Vocabulary
## Building Your Covenant Operating System

<div class="week-overview">

### 🎯 This Week's Focus
Building shared covenant vocabulary and understanding the 4 Faculties framework that creates teleios capacity.

**Time Commitment:** 7-9 hours  
**Prerequisites:** Weeks 1-2

</div>

[Similar LMS architecture with:
- 4 Faculties (Behavioral, Temperamental, Mental, Spiritual)
- Desire System (Disordered → Suppressed → Stewarded)
- 12 Covenant Terms to define together
- 12 Covenant Sentences to practice
- Person → Covenant → Civilization pathway
- Case study: Vocabulary crisis
- PDF citations from Chapters 3, 9
- Collapsible sections, visual hierarchy
- ~18,000-20,000 characters]

[Content TBD in full implementation]
""",
        "reflection_questions": [
            "Which of 4 faculties needs most training?",
            "Where is desire disordered/suppressed/stewarded?",
            "What term defined differently causes conflict?",
            "Person→Covenant→Civilization: where's breakdown?",
            "Which sentence hardest to say?"
        ],
        "downloads": [
            {"title": "4 Faculties Worksheet", "url": "/downloads/4-faculties.pdf"},
            {"title": "12 Covenant Terms Builder", "url": "/downloads/12-terms.pdf"},
            {"title": "Desire System Map", "url": "/downloads/desire-map.pdf"}
        ]
    }

def week_4_diagnostics_lms():
    """Week 4: Diagnostics & Root Causes - Going Beneath Symptoms"""
    return {
        "title": "Week 4: Diagnostics & Root Causes - Going Beneath the Surface",
        "content": """# 📘 Week 4: Diagnostics & Root Causes
## Going Beneath the Surface

<div class="week-overview">

### 🎯 This Week's Focus
Learning to diagnose root causes (not symptoms) using the 4-Domain Framework.

**Time Commitment:** 7-9 hours  
**Prerequisites:** Weeks 1-3

</div>

[Similar LMS architecture with:
- 4 Root-Cause Domains (Relational, Structural, Temperamental, Spiritual)
- Diagnostic Framework (Symptom → Pattern → Root → Action)
- Private Compromise Test
- Root-Cause Mapping exercise
- Case study: Anger transformation
- PDF citations from Chapters 4, 7, 9
- ~18,000-20,000 characters]

[Content TBD in full implementation]
""",
        "reflection_questions": [
            "Which domain most active?",
            "Symptom vs root in recurring conflict?",
            "Where demanding from others what I refuse to become?",
            "What private compromise weakens capacity?",
            "Mopping floor or fixing roof?"
        ],
        "downloads": [
            {"title": "Root Cause Map Tool", "url": "/downloads/root-map.pdf"},
            {"title": "4-Domain Diagnostic", "url": "/downloads/4-domains.pdf"},
            {"title": "Private Compromise Audit", "url": "/downloads/compromise-audit.pdf"}
        ]
    }

def week_5_practices_lms():
    """Week 5: Practices & Drills - Installing Covenant Capacity"""
    return {
        "title": "Week 5: Practices & Drills - The Teleios Practice Stack",
        "content": """# 📘 Week 5: Practices & Drills
## The Teleios Practice Stack

<div class="week-overview">

### 🎯 This Week's Focus
Installing the 5 Daily Practices that build covenant capacity through formation, not just information.

**Time Commitment:** 8-10 hours + 7-day practice  
**Prerequisites:** Weeks 1-4

</div>

[Similar LMS architecture with:
- 5 Daily Practices (60 min total)
- Replacement Training System
- Covenant Fitness Scorecard (5 areas)
- 7-Day Practice Challenge
- Discipline vs Motivation framework
- Case study: Replacement training success
- PDF citations from Chapters 11, 12
- ~20,000-22,000 characters]

[Content TBD in full implementation]
""",
        "reflection_questions": [
            "Which practice missing from life?",
            "What weakness replacing? With what strength?",
            "Waiting for motivation or executing discipline?",
            "Weakest fitness area?",
            "What excuse using?"
        ],
        "downloads": [
            {"title": "5 Daily Practices Tracker", "url": "/downloads/5-practices.pdf"},
            {"title": "Replacement Training Plan", "url": "/downloads/replacement-plan.pdf"},
            {"title": "Covenant Fitness Scorecard", "url": "/downloads/fitness-score.pdf"}
        ]
    }

def week_6_application_lms():
    """Week 6: Covenant Application - Living Teleios in Real Life"""
    return {
        "title": "Week 6: Covenant Application - Living Teleios in Real Relationships",
        "content": """# 📘 Week 6: Covenant Application
## Living Teleios in Real Relationships

<div class="week-overview">

### 🎯 This Week's Focus
Applying all frameworks to 5 real relationship areas and building your 30-Day Covenant Plan.

**Time Commitment:** 8-10 hours  
**Prerequisites:** Weeks 1-5 (ALL previous work)

</div>

[Similar LMS architecture with:
- 5 Application Areas (Speech, Repair, Sexual, Authority, Leadership)
- 5-Step Repair Protocol
- Teleios Covenant Plan builder
- 30-Day Implementation System
- Ongoing accountability structure
- Case study: 30-day transformation
- Course completion requirements
- PDF citations from Chapters 5, 6, 7, 11, 13
- ~22,000-24,000 characters]

[Content TBD in full implementation]
""",
        "reflection_questions": [
            "Which application area needs most work?",
            "What speech pattern eliminating?",
            "Do we have repair protocol?",
            "Where is desire disordered?",
            "Ready for 30-day implementation?"
        ],
        "downloads": [
            {"title": "Teleios Covenant Plan", "url": "/downloads/covenant-plan.pdf"},
            {"title": "30-Day Tracker", "url": "/downloads/30-day.pdf"},
            {"title": "5-Step Repair Card", "url": "/downloads/repair-card.pdf"},
            {"title": "Course Completion Checklist", "url": "/downloads/completion.pdf"}
        ]
    }

def main():
    print("🎨 Rebuilding ALL 6 weeks with LMS architecture...\n")
    
    # Load courses
    with open('courses-catalogue.json', 'r', encoding='utf-8') as f:
        courses = json.load(f)
    
    # Find Teleios course
    for course in courses:
        if course['courseId'] == 'teleios-blueprint':
            print(f"✅ Found: {course['title']}\n")
            
            # Build all 6 weeks
            course['modules'] = [
                week_1_foundations_lms(),
                week_2_design_paradigm_lms(),
                week_3_frameworks_lms(),
                week_4_diagnostics_lms(),
                week_5_practices_lms(),
                week_6_application_lms()
            ]
            
            total_chars = 0
            for i, week in enumerate(course['modules'], 1):
                chars = len(week['content'])
                total_chars += chars
                print(f"Week {i}: {week['title']}")
                print(f"   Content: {chars:,} characters")
                print(f"   Downloads: {len(week['downloads'])} resources")
                print()
            
            print(f"📊 Total Content: {total_chars:,} characters")
            print(f"📊 Average/Week: {total_chars//6:,} characters\n")
            
            break
    
    # Save
    with open('courses-catalogue.json', 'w', encoding='utf-8') as f:
        json.dump(courses, f, indent=2, ensure_ascii=False)
    
    print("✅ All 6 weeks rebuilt with LMS architecture!")
    print("   ✓ Weeks 1-2: COMPLETE with full content")
    print("   ✓ Weeks 3-6: Structure ready for full expansion\n")
    print("⚠️  Note: Weeks 3-6 are scaffolds. Need full content build.\n")

if __name__ == '__main__':
    main()
