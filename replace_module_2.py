import json

print("Loading files...")
with open('courses-catalogue.json', 'r') as f:
    catalogue = json.load(f)

with open('sbd-module-02-complete.json', 'r') as f:
    new_module_2 = json.load(f)

print("Finding SBD course...")
for course in catalogue:
    if course.get('courseId') == 'sex-by-design-for-dummies':
        print("Replacing Module 2...")
        course['modules'][1] = new_module_2
        break

print("Saving updated catalogue...")
with open('courses-catalogue.json', 'w') as f:
    json.dump(catalogue, f, indent=2, ensure_ascii=False)

print("\n✅ MODULE 2 SUCCESSFULLY REPLACED!")
print("=" * 60)
print(f"Title: {new_module_2['title']}")
print(f"Lessons: {len(new_module_2['lessons'])}")
print(f"Formation drills: {len(new_module_2['formation_drills'])}")
print(f"Marriage exercises: {len(new_module_2['marriage_execution'])}")
print(f"Reflection prompts: {len(new_module_2['reflection_prompts'])}")
print(f"Assessment questions: {len(new_module_2['mastery_check']['components'])}")
print(f"Downloads: {len(new_module_2['downloads'])}")
print(f"Content length: {len(new_module_2['content']):,} characters")
print("=" * 60)
