import json

with open('courses-catalogue.json', 'r') as f:
    cat = json.load(f)

sbd = [c for c in cat if c.get('courseId') == 'sex-by-design-for-dummies'][0]

# Restore downloads section in Module 2 with HTML file paths
sbd['modules'][1]['downloads'] = [
    {
        'title': 'Chapter 2 Study Guide: Sexual Literacy Foundations',
        'url': 'downloads/chapter-2-study-guide.html',
        'type': 'html'
    },
    {
        'title': 'Wholeness Math Self-Assessment Worksheet',
        'url': 'downloads/wholeness-math-worksheet.html',
        'type': 'html'
    },
    {
        'title': 'Green/Yellow/Red Lists Builder (Printable)',
        'url': 'downloads/green-yellow-red-lists.html',
        'type': 'html'
    },
    {
        'title': 'Complete Sexual Literacy Assessment (40 questions)',
        'url': 'downloads/complete-sexual-literacy-assessment.html',
        'type': 'html'
    },
    {
        'title': 'Module 2 Scripture Memory Cards',
        'url': 'downloads/module-2-scripture-cards.html',
        'type': 'html'
    },
    {
        'title': 'Cultural Lies Inventory Template',
        'url': 'downloads/cultural-lies-inventory.html',
        'type': 'html'
    }
]

with open('courses-catalogue.json', 'w') as f:
    json.dump(cat, f, indent=2)

print('✅ Restored downloads section in Module 2')
print('✅ All 6 downloadable resources now linked')
print()
print('Downloads:')
for i, dl in enumerate(sbd['modules'][1]['downloads'], 1):
    print(f'{i}. {dl["title"]}')
    print(f'   → {dl["url"]}')
