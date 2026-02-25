import json

def update_exam_structure():
    """Update exam to 80% passing score and add section metadata"""
    
    # Load courses
    with open('courses-catalogue.json', 'r', encoding='utf-8') as f:
        courses = json.load(f)
    
    # Find Foundation School
    fs_course = None
    fs_index = None
    for i, course in enumerate(courses):
        if course.get('courseId') == 'foundation-school':
            fs_course = course
            fs_index = i
            break
    
    if not fs_course:
        print("❌ Foundation School course not found!")
        return
    
    # Get Week 6
    week6 = fs_course['modules'][5]
    
    # Update passing score to 80%
    week6['quiz']['passingScore'] = 80
    
    # Add section metadata to questions
    questions = week6['quiz']['questions']
    
    # Define section structure
    sections = [
        # Teleios Blueprint (Questions 1-25)
        {"start": 0, "end": 5, "section": "Teleios Blueprint", "subsection": "Week 1: Teleios Foundations, Created Perfection, 5 Faculties"},
        {"start": 5, "end": 10, "section": "Teleios Blueprint", "subsection": "Week 2: Design Paradigm, Four Faculties, Anakephalaiosis"},
        {"start": 10, "end": 15, "section": "Teleios Blueprint", "subsection": "Week 3: Four Attributes, Marriage Readiness, Leave & Cleave"},
        {"start": 15, "end": 20, "section": "Teleios Blueprint", "subsection": "Week 4: Axiomatic Dimensions (Epistemology, Axiology, Ontology)"},
        {"start": 20, "end": 25, "section": "Teleios Blueprint", "subsection": "Week 5: Civilizational Scaling, Covenant Capacity"},
        
        # Advocacy Training (Questions 26-45)
        {"start": 25, "end": 29, "section": "Advocacy Training", "subsection": "Week 1: Ambassador Role, Deployment Models, Advocate's Code"},
        {"start": 29, "end": 33, "section": "Advocacy Training", "subsection": "Week 2: Deployment Psychology, Protection-Relief-Hope Framework"},
        {"start": 33, "end": 37, "section": "Advocacy Training", "subsection": "Week 3: Empathy-First Communication, Community Engagement"},
        {"start": 37, "end": 41, "section": "Advocacy Training", "subsection": "Week 4: Advanced Deployment Models, Sponsored Access"},
        {"start": 41, "end": 45, "section": "Advocacy Training", "subsection": "Week 5: Leadership Foundations, Regional Impact, Senior Roles"},
        
        # Integration & Application (Questions 46-50)
        {"start": 45, "end": 47, "section": "Integration & Application", "subsection": "How Teleios and Advocacy Work Together"},
        {"start": 47, "end": 49, "section": "Integration & Application", "subsection": "CRLA Certification Meaning and Value"},
        {"start": 49, "end": 50, "section": "Integration & Application", "subsection": "Foundation School Structure and Real-World Application"},
    ]
    
    # Apply section metadata to questions
    for section_info in sections:
        for i in range(section_info['start'], section_info['end']):
            if i < len(questions):
                questions[i]['section'] = section_info['section']
                questions[i]['subsection'] = section_info['subsection']
    
    # Update the course
    week6['quiz']['questions'] = questions
    fs_course['modules'][5] = week6
    courses[fs_index] = fs_course
    
    # Also update the exams structure if it exists
    if 'exams' in fs_course and 'crla-certification' in fs_course['exams']:
        exam = fs_course['exams']['crla-certification']
        for i, q in enumerate(exam['questions']):
            if i < len(questions):
                exam['questions'][i]['section'] = questions[i].get('section', '')
                exam['questions'][i]['subsection'] = questions[i].get('subsection', '')
    
    # Save back
    with open('courses-catalogue.json', 'w', encoding='utf-8') as f:
        json.dump(courses, f, indent=2, ensure_ascii=False)
    
    print("\n" + "="*70)
    print("✅ EXAM STRUCTURE UPDATED SUCCESSFULLY!")
    print("="*70)
    print(f"Course: {fs_course['title']}")
    print(f"Passing Score: {week6['quiz']['passingScore']}% (was 70%)")
    print(f"Total Questions: {len(questions)}")
    print("\nSection Breakdown:")
    print("  📘 Teleios Blueprint: Questions 1-25 (5 weeks × 5 questions)")
    print("  📗 Advocacy Training: Questions 26-45 (5 weeks × 4 questions)")
    print("  📙 Integration & Application: Questions 46-50 (5 questions)")
    print("\n✅ Each question now has section and subsection metadata for headers")
    print("="*70)

if __name__ == "__main__":
    update_exam_structure()
