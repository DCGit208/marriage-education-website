#!/usr/bin/env python3
"""Display Marriage=Porn & Beyond course exams"""

import json

with open('courses-catalogue.json', 'r') as f:
    courses = json.load(f)

course = next(c for c in courses if c['courseId'] == 'marriage-porn-beyond')

print('\n' + '='*80)
print('MARRIAGE=PORN & BEYOND — COURSE EXAMS')
print('='*80)
print(f'\nTotal: {sum(len(exam["questions"]) for exam in course["exams"].values())} questions across 5 exams\n')

for exam_key, exam in course['exams'].items():
    print(f'\n\n{"▼"*40}')
    print(f'{exam["title"]}')
    print(f'Passing Score: {exam["passing_score"]}%')
    print(f'Total Questions: {len(exam["questions"])}')
    print(f'{"▼"*40}\n')
    
    for i, q in enumerate(exam['questions'], 1):
        print(f'━━━ Question {i} of {len(exam["questions"])} ━━━')
        print(f'{q["question"]}\n')
        print('Options:')
        for j, opt in enumerate(q['options']):
            marker = ' ✓ CORRECT ✓' if j == q['correct'] else ''
            print(f'  {chr(65+j)}. {opt}{marker}')
        print(f'\n💡 Explanation: {q["explanation"]}\n')
