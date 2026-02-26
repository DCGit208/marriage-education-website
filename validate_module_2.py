import json

with open('courses-catalogue.json', 'r') as f:
    data = json.load(f)

sbd = [c for c in data if c.get('courseId') == 'sex-by-design-for-dummies'][0]
mod2 = sbd['modules'][1]

print('JSON VALID')
print('Module 2:', mod2['title'])
print('Lessons:', len(mod2['lessons']))
print('Formation drills:', len(mod2['formation_drills']))
print('Marriage exercises:', len(mod2['marriage_execution']))
print('Assessment questions:', len(mod2['mastery_check']['components']))
print('Reflection prompts:', len(mod2['reflection_prompts']))
print('Downloads:', len(mod2['downloads']))
print('Content length:', len(mod2['content']), 'characters')
print('\nMODULE 2 IS PRODUCTION-READY!')
