#!/usr/bin/env python3
"""
Create the integrated Foundation School course by merging
Teleios Blueprint + Advocacy Training week by week.
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

def create_foundation_school():
    """Create the integrated Foundation School course."""
    print("Loading courses catalogue...")
    courses = load_courses()
    
    # Find the two source courses
    teleios = find_course(courses, 'teleios-blueprint')
    advocacy = find_course(courses, 'advocacy-training')
    
    if not teleios:
        print("ERROR: Could not find teleios-blueprint course")
        return
    
    if not advocacy:
        print("ERROR: Could not find advocacy-training course")
        return
    
    print(f"Found Teleios Blueprint: {len(teleios['modules'])} modules")
    print(f"Found Advocacy Training: {len(advocacy['modules'])} modules")
    
    # Create the integrated course structure
    foundation_school = {
        "courseId": "foundation-school",
        "course_no": 3,
        "school": 1,
        "school_name": "Foundation School",
        "category": "integrated-training",
        "title": "Marriage Foundation School: Complete Training (Teleios + Advocacy)",
        "price": 0,  # FREE for ambassadors
        "duration_weeks": 6,
        "badge": "CRLA Certified",
        "description": "The complete 6-week integrated training combining personal development (Teleios Blueprint) and deployment skills (Advocacy Training). Earn your CRLA certification.",
        "modules": []
    }
    
    # Merge modules week by week
    num_weeks = min(len(teleios['modules']), len(advocacy['modules']))
    print(f"\nMerging {num_weeks} weeks...")
    
    for week in range(num_weeks):
        teleios_module = teleios['modules'][week]
        advocacy_module = advocacy['modules'][week]
        
        # Create integrated week module
        integrated_module = {
            "title": f"Week {week + 1}: Integrated Training",
            "content": f"""# Week {week + 1} of 6: Integrated Training
## Teleios Blueprint + Advocacy Training

> **Week {week + 1} of 6** | 7-9 hours | Integrated Level

---

This week combines TWO tracks of learning:
- 📚 **Teleios Track**: Personal development and covenant maturity
- 🎯 **Advocacy Track**: Deployment psychology and community engagement

Complete BOTH tracks to progress to the next week.

---

## 📚 TRACK 1: TELEIOS BLUEPRINT

### {teleios_module['title']}

{teleios_module['content']}

---

---

## 🎯 TRACK 2: ADVOCACY TRAINING

### {advocacy_module['title']}

{advocacy_module['content']}

---

---

## Week {week + 1} Completion Checklist

### Teleios Track
- [ ] Complete all Teleios readings
- [ ] Answer Teleios reflection questions
- [ ] Complete daily Teleios practices (7 days)
- [ ] Download and use Teleios worksheets

### Advocacy Track
- [ ] Complete all Advocacy readings
- [ ] Answer Advocacy reflection questions
- [ ] Complete daily Advocacy practices (7 days)
- [ ] Download and use Advocacy worksheets

**Both tracks must be completed before progressing to Week {week + 2 if week < num_weeks - 1 else 'CRLA Certification'}.**

---

**Progress**: Week {week + 1} of 6 complete → {int((week + 1) / num_weeks * 100)}% toward CRLA Certification

""",
            "reflection_questions": teleios_module.get('reflection_questions', []) + advocacy_module.get('reflection_questions', []),
            "downloads": teleios_module.get('downloads', []) + advocacy_module.get('downloads', [])
        }
        
        foundation_school['modules'].append(integrated_module)
        print(f"  ✓ Week {week + 1} integrated")
    
    # Check if foundation-school already exists
    existing = find_course(courses, 'foundation-school')
    if existing:
        print("\n⚠️  Foundation School already exists. Replacing...")
        courses.remove(existing)
    
    # Add the new course to the beginning (so it's prominent)
    courses.insert(0, foundation_school)
    
    print(f"\n✅ Foundation School created with {len(foundation_school['modules'])} integrated weeks")
    print(f"   Total modules in course: {len(foundation_school['modules'])}")
    print(f"   Total reflection questions: {sum(len(m.get('reflection_questions', [])) for m in foundation_school['modules'])}")
    print(f"   Total downloads: {sum(len(m.get('downloads', [])) for m in foundation_school['modules'])}")
    
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
    print("FOUNDATION SCHOOL CREATED SUCCESSFULLY")
    print("="*60)
    print(f"Course ID: {foundation_school['courseId']}")
    print(f"Title: {foundation_school['title']}")
    price_display = 'FREE' if foundation_school['price'] == 0 else f"${foundation_school['price']}"
    print(f"Price: {price_display}")
    print(f"Duration: {foundation_school['duration_weeks']} weeks")
    print(f"Badge: {foundation_school['badge']}")
    print(f"Modules: {len(foundation_school['modules'])} integrated weeks")
    print("\nAmbassadors can now access via:")
    print("  - Dashboard: 'Continue Learning' button")
    print("  - URL: course-viewer.html?course=foundation-school")
    print("="*60)

if __name__ == "__main__":
    create_foundation_school()
