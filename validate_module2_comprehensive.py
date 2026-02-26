#!/usr/bin/env python3
"""
Module 2 Validation Against Actual Chapter 2 Content
Compares current module against SBD source material
"""

import json

print("=" * 80)
print("MODULE 2 VALIDATION REPORT")
print("Comparing current module against actual Chapter 2 from pdf-extracted-content.txt")
print("=" * 80)
print()

# Load current Module 2
with open('courses-catalogue.json', 'r') as f:
    catalogue = json.load(f)
    
sbd_course = [c for c in catalogue if c.get('courseId') == 'sex-by-design-for-dummies'][0]
module_2 = sbd_course['modules'][1]

# Current Module 2 Stats
print("📊 CURRENT MODULE 2 STATISTICS:")
print(f"  Title: {module_2['title']}")
print(f"  Content Length: {len(module_2['content']):,} characters")
print(f"  Lessons: {len(module_2.get('lessons', []))}")
print(f"  Exercises: {len(module_2.get('exercises', []))}")
print(f"  Core Teachings: {len(module_2.get('core_teachings', []))}")
print(f"  Downloads: {len(module_2.get('downloads', []))}")
print()

# Chapter 2 Actual Requirements (from pdf-extracted-content.txt pages 14-28)
print("📖 CHAPTER 2 ACTUAL REQUIREMENTS (from source book):")
print()

chapter_2_requirements = {
    "2.1 The Uncomfortable Question": {
        "description": "Sexual imagery everywhere, sexual literacy nowhere",
        "key_concepts": [
            "Culture saturates with images but starves literacy",
            "Sexual literacy is stewardship of sacred design",
            "Clarity (not prudishness or permissiveness) is answer"
        ]
    },
    "2.2 Nakedness Without Shame (Genesis 2:25)": {
        "description": "Original atmosphere of marriage, not spiritual concept",
        "key_concepts": [
            "Nakedness = covenant posture, not accident",
            "Shame entered through disobedience, not through sexuality",
            "Marriage restores original atmosphere"
        ]
    },
    "2.3 Sexual Hedonism CORRECTLY DEFINED": {
        "description": "Revelation 4:11 - Created for God's pleasure",
        "key_concepts": [
            "Epicure Originativeness: Pleasure originates in design",
            "TRUE hedonism = devotion to pleasure AS STEWARDSHIP",
            "FALSE hedonism = pleasure divorced from design/purpose",
            "Conjugal pleasure is worshipful when covenant-ordered"
        ]
    },
    "2.4 Sexuality as Birthright (Anthropogenic)": {
        "description": "You're born sexual, not taught to be sexual",
        "key_concepts": [
            "Anthropogenic pleasure = inherent, not acquired",
            "Sexual attributes (desire, arousal, imagination) = DESIGN",
            "Sexual practice (acts) = COVENANT-ONLY",
            "Literacy before passion: know before you act"
        ]
    },
    "2.5 Sex = Marriage (1 Cor 6:16)": {
        "description": "Sexual union creates covenant reality",
        "key_concepts": [
            "Genesis 2:24 + 1 Cor 6:16 = mathematical equation",
            "Certificate vs. Covenant: paper records, sex consummates",
            "One-flesh reality is BIOLOGICAL, not spiritual metaphor",
            "Sex outside marriage = covenant fraud"
        ]
    },
    "2.6 Wholeness Math (1+1=1)": {
        "description": "Two whole persons, not broken halves",
        "key_concepts": [
            "FALSE: 0.5 + 0.5 = 1 (broken halves completing each other)",
            "TRUE: 1 + 1 = 1 (two whole persons → one flesh)",
            "Marriage doesn't complete you; it reveals whether you're complete",
            "Teleios prerequisite: full age required (UDHR 16:1, Heb 5:14)"
        ]
    },
    "2.7 Fidelity Inside vs. Infidelity Outside": {
        "description": "1 Corinthians 7:2-4 - Conjugal duty",
        "key_concepts": [
            "Bodies are covenant property, not private property",
            "Mutual authority: 'wife hath not power of her own body'",
            "Defraud ye not one the other",
            "Fidelity = full participation, not just 'not cheating'"
        ]
    },
    "2.8 Exercises": {
        "description": "Practical application of literacy",
        "key_concepts": [
            "Genesis 2:24, 1 Cor 6:16, Heb 13:4 side-by-side comparison",
            "Marriage Math Journal (wholeness equation reflection)",
            "Habit Loop Builder (daily/weekly fidelity practices)",
            "Cultural Critique (identify false equations, write rebuttal)"
        ]
    }
}

for section, details in chapter_2_requirements.items():
    print(f"\n{section}:")
    print(f"  Description: {details['description']}")
    print("  Key Concepts:")
    for concept in details['key_concepts']:
        print(f"    • {concept}")

print()
print("=" * 80)
print("VALIDATION CHECKLIST")
print("=" * 80)
print()

# Check current module against requirements
current_teachings = module_2.get('core_teachings', [])
current_key_terms = module_2.get('keyTerms', [])

print("✅ WHAT'S CORRECT IN CURRENT MODULE:")
correct_elements = [
    "Sexual literacy is not optional; ignorance causes harm",
    "Sex makes oneness (1 Cor 6:16), not paper",
    "Wholeness math: 1 + 1 = 1 (two whole persons, not broken halves)",
]

for element in correct_elements:
    found = any(element.lower() in t.lower() for t in current_teachings)
    status = "✓" if found else "✗"
    print(f"  {status} {element}")

print()
print("❌ WHAT'S MISSING OR WRONG:")

missing_elements = [
    "Sexual hedonism CORRECTLY defined (Rev 4:11: pleasure as stewardship, NOT 'pleasure without consequences')",
    "Anthropogenic pleasure (born sexual, inherent attributes vs. covenant practice)",
    "Epicure Originativeness terminology",
    "Conjugal duty framework (1 Cor 7:3-4: bodies as covenant property)",
    "Certificate vs. Covenant distinction (paper records; sex consummates)",
    "Fidelity as FULL PARTICIPATION (not just 'not cheating')",
    "Nakedness as ORIGINAL ATMOSPHERE (Gen 2:25), not spiritual concept",
    "Literacy BEFORE passion (not 'learn after marriage')",
]

for element in missing_elements:
    print(f"  ✗ {element}")

print()
print("⚠️  LANGUAGE ISSUES TO FIX:")

# Check downloads for problematic language
downloads_to_check = [
    "cultural-lies-inventory.html - Uses 'BIBLICAL TRUTH' headers (should be 'Design Truth')",
    "cultural-lies-inventory.html - Uses 'spiritual consequences' (should be 'covenant violations')",
    "chapter-2-study-guide.html - May have religious framing instead of design reasoning",
    "complete-sexual-literacy-assessment.html - Questions may not test SBD concepts accurately",
]

for issue in downloads_to_check:
    print(f"  ⚠️  {issue}")

print()
print("=" * 80)
print("RECOMMENDED ACTIONS")
print("=" * 80)
print()

actions = [
    "1. REVISE ALL DOWNLOADS - Remove religious sermon language, install design reasoning",
    "2. EXPAND MODULE 2 CONTENT - Current is likely too scanty, doesn't cover engagement per section",
    "3. ADD MISSING CONCEPTS - Epicure Originativeness, Anthropogenic pleasure, Certificate vs. Covenant",
    "4. FIX HEDONISM DEFINITION - Must be 'pleasure as stewardship' NOT 'pleasure without consequences'",
    "5. ADD PROPER EXERCISES - Scripture comparison, Marriage Math journal, Habit loops, Cultural critique",
    "6. VALIDATE LESSONS - Ensure each lesson covers actual Chapter 2 section content",
    "7. CHECK KEY TERMS - Must include: Epicure Originativeness, Anthropogenic Pleasure, Teleios, Conjugal Order",
]

for action in actions:
    print(f"  {action}")

print()
print("=" * 80)
print("STATUS: Module 2 requires COMPREHENSIVE REVISION before Modules 3-13 can be built")
print("=" * 80)
