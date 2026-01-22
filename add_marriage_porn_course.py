#!/usr/bin/env python3
import json

# Read existing catalogue
with open('courses-catalogue.json', 'r', encoding='utf-8') as f:
    courses = json.load(f)

# Add Marriage=Porn & Beyond course
marriage_porn_course = {
    "courseId": "marriage-porn-beyond",
    "course_no": 14,
    "school": 2,
    "school_name": "School of Sexuality & Conjugal Mastery",
    "category": "sexual-literacy",
    "title": "Marriage=Porn & Beyond — 5-Day Freedom Lab",
    "price": 250,
    "duration_weeks": 1,
    "badge": "Freedom Lab Certificate",
    "description": "5-day intensive freedom lab for individuals and couples wrestling with pornography — or wanting a marriage that makes porn irrelevant.",
    "modules": [
        {
            "title": "Day 1: Why Porn 'Works'",
            "content": "# Day 1: Why Porn 'Works' — And Why Marriage Must Do It Better\n\nPornography doesn't succeed by accident. **Porn is powerful because it imitates what belongs to covenant.**\n\n> *\"And they were both naked, the man and his wife, and were not ashamed.\"* — **Genesis 2:25**\n\n## The Axiom\n\"What is unpracticed in covenant will be perfected by the counterfeit.\"\n\n## Day 1 Exercise: The Honesty Audit\n1. On a scale of 1-10, how practiced is nakedness in my marriage?\n2. On a scale of 1-10, how practiced is seduction in my marriage?\n3. What has been outsourced to screens that should be stewarded in covenant?\n",
            "reflection_questions": [
                "On a scale of 1-10, how practiced is nakedness in my marriage?",
                "On a scale of 1-10, how practiced is seduction in my marriage?",
                "What has been outsourced to screens?",
                "What am I afraid to practice that porn does without shame?"
            ],
            "downloads": []
        },
        {
            "title": "Day 2: Nakedness as Divine Asset",
            "content": "# Day 2: Nakedness as Divine Asset\n\nNakedness is **the divine asset of marriage**.\n\n> *\"The wife hath not power of her own body, but the husband.\"* — **1 Corinthians 7:3-4**\n\n## Day 2 Exercise: Song Hour\nSchedule 30 minutes of unashamed nakedness with your spouse.\n",
            "reflection_questions": [
                "When was the last time I presented my nakedness as a gift?",
                "What shame narratives prevent covenant nakedness?",
                "What would nakedness stewardship look like?"
            ],
            "downloads": []
        },
        {
            "title": "Day 3: Pics & Pearls",
            "content": "# Day 3: Pics & Pearls — Covenant Imagery\n\n**Pics & Pearls** = Private images and phrases exclusive to covenant.\n\n> *\"How fair and how pleasant art thou, O love!\"* — **Song of Solomon 7:6-7**\n\n## Day 3 Exercise\n1. Create private \"Pics\" folder (with consent)\n2. Write 5 \"Pearls\" (phrases that arouse desire)\n3. Delete all counterfeit imagery\n",
            "reflection_questions": [
                "What Pics & Pearls arouse desire for my spouse?",
                "What counterfeit imagery do I need to delete?",
                "How would covenant imagery change my imagination?"
            ],
            "downloads": []
        },
        {
            "title": "Day 4: A³ Practice",
            "content": "# Day 4: Marriage = Sexuality = Sex\n\n**Sex is the product. Sexuality is the lifestyle.**\n\n## The A³ Practice\n- **Attitude:** Intentional seduction\n- **Attire:** Dress for desire\n- **Allure:** Create environment\n\n## Day 4 Exercise\nSchedule your weekly A³ Night.\n",
            "reflection_questions": [
                "How intentional am I about practicing sexuality?",
                "What would A³ weekly look like for 90 days?",
                "Which sexuality component is weakest?"
            ],
            "downloads": []
        },
        {
            "title": "Day 5: Covenant Superiority",
            "content": "# Day 5: Building a Marriage Porn Can't Compete With\n\nThe goal is **covenant superiority**.\n\n> *\"Be not overcome of evil, but overcome evil with good.\"* — **Romans 12:21**\n\n## The System\n**Weekly:** Song Hour, A³ Night, Check-In\n**Daily:** Tender pursuit, Pics & Pearls\n**Monthly:** Inventory\n**Quarterly:** Deep dive\n\n## Day 5 Exercise: 90-Day Freedom Plan\n1. Write out weekly habits\n2. Set up accountability\n3. Schedule first monthly inventory\n",
            "reflection_questions": [
                "What weekly habits will I commit to for 90 days?",
                "Who will I tell (accountability)?",
                "What does covenant superiority look like?",
                "What would change if I practiced these rhythms?"
            ],
            "downloads": []
        }
    ]
}

courses.append(marriage_porn_course)

# Save updated catalogue
with open('courses-catalogue.json', 'w', encoding='utf-8') as f:
    json.dump(courses, f, indent=2, ensure_ascii=False)

print(f"✅ Added Marriage=Porn & Beyond course to catalogue")
print(f"📊 Total courses: {len(courses)}")
