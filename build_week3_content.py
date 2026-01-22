#!/usr/bin/env python3
"""
Build Remaining Course Content (Weeks 3-13)
Sex By Design For Dummies - Complete Course Development
"""

import json

def create_remaining_weeks():
    
    # Week 3: Birthright and Design
    week3_content = """# Week 3: How Am I a Part of It? - Birthright and Design

> **Week 3 of 13** | Chapter 3 | Foundation Level

---

## Introduction

You are not an accident. Your sexuality is not random. This week explores your personal role in God's design—your birthright, identity, and how your maleness or femaleness fits into the covenant order.

---

## Core Concept: Birthright

**Birthright** = Your God-given inheritance as male or female created in His image

You were born with:
- **Design** - Male or female by creation (not choice)
- **Purpose** - Specific role in covenant and family
- **Dignity** - Image-bearer of God (Genesis 1:27)
- **Responsibility** - Steward your sexuality for God's glory

**Psalm 139:13-14 (KJV)**  
*"For thou hast possessed my reins: thou hast covered me in my mother's womb. I will praise thee; for I am fearfully and wonderfully made."*

---

## Male and Female: Design, Not Accident

### The Binary Reality:

**Genesis 1:27 (KJV)**  
*"So God created man in his own image, in the image of God created he him; male and female created he them."*

Key truths:
- **Two sexes**, not a spectrum
- **By creation**, not social construction  
- **Complementary**, not identical or interchangeable
- **Both** bear God's image fully

### Rejecting the Design:

When culture says "gender is fluid" or "biology doesn't matter," it's rejecting the Creator's authority. Your sex is:
- Fixed at conception (XX or XY chromosomes)
- Visible in anatomy
- Purposeful for procreation and covenant

---

## Your Sexual Identity in Christ

**2 Corinthians 5:17 (KJV)**  
*"Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new."*

### The Hierarchy of Identity:

1. **Image-bearer** (Genesis 1:27) - Primary identity
2. **Male or Female** (Genesis 1:27) - Created design
3. **Redeemed in Christ** (2 Cor 5:17) - Restored identity
4. **Covenant spouse** (if married) - Functional role

Your sexuality serves your identity in Christ—it doesn't define it independently.

---

## The Imago Dei and Sexuality

**Imago Dei** = Image of God

How sexuality reflects God's image:
- **Relationality** - God is triune (Father, Son, Spirit); humans designed for covenant union
- **Creativity** - God creates; humans procreate
- **Complementarity** - Unity in diversity (male/female mirror Trinity's unity)
- **Covenant Fidelity** - God keeps covenant; marriage reflects His faithfulness

---

## Stewarding Your Design (Not Rejecting It)

**Romans 12:1 (KJV)**  
*"I beseech you therefore, brethren, by the mercies of God, that ye present your bodies a living sacrifice, holy, acceptable unto God, which is your reasonable service."*

### What Stewardship Means:

✅ **Accept** your biological sex as God's design  
✅ **Develop** masculine or feminine virtues appropriate to your sex  
✅ **Use** your sexuality within covenant marriage only  
✅ **Protect** your body from sexual sin  
✅ **Honor** the complementary design of male and female

### What Rejection Looks Like:

❌ Denying biological sex in favor of "gender identity"  
❌ Refusing masculine/feminine roles (attempting androgyny)  
❌ Sexual sin (fornication, adultery, homosexuality)  
❌ Pornography (abusing sexuality outside covenant)  
❌ Despising marriage or procreation

---

## Personal Responsibility in the Covenant Order

**Romans 14:12 (KJV)**  
*"So then every one of us shall give account of himself to God."*

### Your Personal Accountability:

As a **male**, you will give account for:
- Protecting and providing for family
- Leading with Christ-like servant headship
- Stewarding virility with strength and sacrifice
- Keeping covenant fidelity

As a **female**, you will give account for:
- Nurturing and building the home
- Respecting and supporting husband's headship
- Stewarding muliebrity with grace and wisdom
- Keeping covenant fidelity

**Both** will give account for sexual purity, marital faithfulness, and raising godly children.

---

## Week 3 Exercises

### Personal Reflection:

1. **Write Your Birthright Statement**:  
   "I am [male/female] by God's design. My sexuality is a gift to steward for..."

2. **Identify Design Acceptance**:  
   Do I fully accept my biological sex? If not, what lies am I believing?

3. **Assess Stewardship**:  
   Am I developing virtues appropriate to my sex, or am I trying to be androgynous?

### Couple Dialogue:

1. **Discuss Complementarity**:  
   How do our differences as male/female strengthen our marriage?

2. **Share Responsibilities**:  
   What unique responsibilities do each of us carry based on our design?

3. **Plan for Legacy**:  
   What will we teach our children about male/female design?

---

## Summary

✅ **Birthright** = Your God-given inheritance as male or female  
✅ **Design is fixed** - Two sexes by creation, complementary  
✅ **Identity in Christ** - Sexuality serves, doesn't define  
✅ **Stewardship required** - Accept and develop your design  
✅ **Personal accountability** - You'll give account to God

### Next Week:

**Chapter 4: The Sexual One and Only - The Anatomy (Epicure Originativeness)**

Comprehensive anatomical education with dignity and design perspective.

---

**End of Week 3**"""

    # Load and update catalogue
    with open('courses-catalogue.json', 'r', encoding='utf-8') as f:
        catalogue = json.load(f)
    
    # Find course and update Week 3
    for course in catalogue:
        if course['courseId'] == 'sex-by-design-for-dummies':
            for module in course['modules']:
                if module['moduleId'] == 3:
                    module['content'] = week3_content
                    print(f"✅ Week 3 content added ({len(week3_content)} chars)")
            break
    
    # Save
    with open('courses-catalogue.json', 'w', encoding='utf-8') as f:
        json.dump(catalogue, f, indent=2, ensure_ascii=False)
    
    print("\n📊 Course Progress: 3/13 weeks complete (23%)")
    print("   Week 1: ✅ Eudaemonia & Flourishing")
    print("   Week 2: ✅ Sexual Literacy")
    print("   Week 3: ✅ Birthright & Design")
    print("   Week 4-13: 🔄 In development...")

if __name__ == "__main__":
    create_remaining_weeks()
