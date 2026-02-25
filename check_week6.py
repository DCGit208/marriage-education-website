import json

with open('courses-catalogue.json', 'r') as f:
    data = json.load(f)

fs = [c for c in data if c.get('courseId') == 'foundation-school'][0]
week6 = fs['modules'][5]

print("=" * 60)
print("WEEK 6 REBUILD VERIFICATION")
print("=" * 60)
print(f"\nTitle: {week6['title']}")
print(f"Total Questions: {len(week6['quiz']['questions'])}")
print(f"Passing Score: {week6['quiz']['passingScore']}%")
print(f"Downloads: {len(week6.get('downloads', []))}")
print(f"Reflection Questions: {len(week6.get('reflection_questions', []))}")

print("\n" + "=" * 60)
print("SAMPLE QUESTIONS")
print("=" * 60)

# Show first 3 questions
for idx in range(min(3, len(week6['quiz']['questions']))):
    q = week6['quiz']['questions'][idx]
    print(f"\nQuestion {idx + 1}:")
    print(f"Q: {q['question']}")
    print("Options:")
    for i, opt in enumerate(q['options']):
        marker = "✓" if i == q['correctAnswer'] else " "
        print(f"  {marker} {chr(65+i)}. {opt}")
    print(f"Explanation: {q['explanation'][:100]}...")

print("\n" + "=" * 60)
print("DOWNLOADS")
print("=" * 60)
for dl in week6.get('downloads', []):
    print(f"• {dl['title']}")

print("\n" + "=" * 60)
print("✅ WEEK 6 REBUILD COMPLETE!")
print("=" * 60)
