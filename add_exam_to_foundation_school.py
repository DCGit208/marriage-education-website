import json
from pathlib import Path

def add_exam_structure():
    """Add proper exam structure to Foundation School course"""
    
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
    
    # Get Week 6 quiz
    week6 = fs_course['modules'][5]
    week6_quiz = week6['quiz']
    
    print(f"✅ Found Week 6: {week6['title']}")
    print(f"✅ Found {len(week6_quiz['questions'])} questions")
    
    # Create exam structure using Week 6 quiz
    exam_structure = {
        "crla-certification": {
            "title": "CRLA Certification Exam",
            "description": "Comprehensive 50-question exam covering all 5 weeks of Foundation School training",
            "questions": []
        }
    }
    
    # Convert Week 6 quiz questions to exam format
    for i, q in enumerate(week6_quiz['questions']):
        exam_structure["crla-certification"]["questions"].append({
            "id": i,
            "question": q['question'],
            "options": q['options'],
            "correct": q['correctAnswer'],  # Note: exam format uses "correct" not "correctAnswer"
            "explanation": q['explanation']
        })
    
    # Add exams property to Foundation School
    fs_course['exams'] = exam_structure
    
    # Update the course
    courses[fs_index] = fs_course
    
    # Save back
    with open('courses-catalogue.json', 'w', encoding='utf-8') as f:
        json.dump(courses, f, indent=2, ensure_ascii=False)
    
    print("\n" + "="*60)
    print("✅ EXAM STRUCTURE ADDED SUCCESSFULLY!")
    print("="*60)
    print(f"Course: {fs_course['title']}")
    print(f"Exam Title: {exam_structure['crla-certification']['title']}")
    print(f"Total Questions: {len(exam_structure['crla-certification']['questions'])}")
    print(f"Passing Score: {week6_quiz.get('passingScore', 70)}%")
    print("\n📝 The exam is now accessible from the 'Final Exam' button in the course viewer!")
    print("="*60)

if __name__ == "__main__":
    add_exam_structure()
