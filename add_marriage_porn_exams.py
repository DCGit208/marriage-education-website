#!/usr/bin/env python3
"""
Add comprehensive exams to Marriage=Porn & Beyond course
"""

import json

def create_exams():
    """Create exam questions for all 5 days"""
    
    exams = {
        "day1_exam": {
            "title": "Day 1 Exam: Why Porn 'Works' — Foundation Assessment",
            "passing_score": 70,
            "questions": [
                {
                    "question": "According to Day 1, why is pornography powerful?",
                    "options": [
                        "Because it's inherently evil and demonic",
                        "Because it imitates what belongs to covenant marriage",
                        "Because people are weak and sinful",
                        "Because marriage is outdated"
                    ],
                    "correct": 1,
                    "explanation": "Porn is powerful because it imitates covenant assets: nakedness, imagery, desire, and seduction — things that were designed for marriage first (Genesis 2:25)."
                },
                {
                    "question": "What is the A³ practice mentioned in Day 1?",
                    "options": [
                        "Accountability, Anointing, Authority",
                        "Attitude, Attire, Allure",
                        "Attention, Affection, Action",
                        "Agreement, Alignment, Achievement"
                    ],
                    "correct": 1,
                    "explanation": "A³ stands for Attitude (intentional seduction), Attire (dressing for desire), and Allure (creating erotic atmosphere)."
                },
                {
                    "question": "Complete the axiom: 'What is unpracticed in covenant will be...'",
                    "options": [
                        "...forgotten by the culture'",
                        "...perfected by the counterfeit'",
                        "...lost forever'",
                        "...replaced by shame'"
                    ],
                    "correct": 1,
                    "explanation": "The axiom is: 'What is unpracticed in covenant will be perfected by the counterfeit' (based on Romans 12:21 principle)."
                },
                {
                    "question": "According to Day 1, what is the biblical solution to pornography?",
                    "options": [
                        "Install accountability software and shame cycles",
                        "Avoid all sexual thoughts and desires",
                        "Build a marriage so sexually abundant that porn has nothing to offer",
                        "Pray more and fast regularly"
                    ],
                    "correct": 2,
                    "explanation": "The solution is covenant superiority — building a marriage that is more naked, more devoted, more alluring, more erotic, and more faithful than porn."
                },
                {
                    "question": "What does Genesis 2:25 teach about nakedness in marriage?",
                    "options": [
                        "Nakedness is shameful and should be avoided",
                        "Nakedness is only acceptable in darkness",
                        "They were both naked and not ashamed",
                        "Nakedness was only for Adam and Eve"
                    ],
                    "correct": 2,
                    "explanation": "Genesis 2:25 states: 'And they were both naked, the man and his wife, and were not ashamed' — establishing nakedness as the original design for covenant."
                },
                {
                    "question": "What is the primary problem that fuels pornography use in marriage?",
                    "options": [
                        "Lack of willpower",
                        "Spiritual warfare",
                        "Marital abdication — marriage doesn't practice sexuality",
                        "Cultural corruption"
                    ],
                    "correct": 2,
                    "explanation": "The root problem is marital abdication: when couples don't practice nakedness, seduction, or sexual imagination within covenant, counterfeits fill the void."
                },
                {
                    "question": "What does 'covenant superiority' mean in the context of this course?",
                    "options": [
                        "Feeling morally superior to those who struggle with porn",
                        "Having a perfect, sinless marriage",
                        "A marriage so sexually alive that porn has nothing to offer",
                        "Being better Christians than others"
                    ],
                    "correct": 2,
                    "explanation": "Covenant superiority means building a marriage that is so sexually practiced, devoted, and abundant that pornography cannot compete."
                },
                {
                    "question": "According to Romans 12:21 (quoted in Day 1), how do we overcome evil?",
                    "options": [
                        "By fighting and resisting it constantly",
                        "By being overcome with good",
                        "By ignoring it completely",
                        "Be not overcome of evil, but overcome evil with good"
                    ],
                    "correct": 3,
                    "explanation": "Romans 12:21: 'Be not overcome of evil, but overcome evil with good' — meaning we defeat porn by practicing covenant better, not by guilt management."
                },
                {
                    "question": "What are the 'covenant skills' that porn imitates counterfeitly?",
                    "options": [
                        "Prayer, fasting, and worship",
                        "Communication, compromise, and commitment",
                        "Presentation, angle, lighting, posture, expression",
                        "Love, joy, peace, and patience"
                    ],
                    "correct": 2,
                    "explanation": "Porn practices presentation skills — angle, lighting, posture, expression. These aren't 'sinful skills'; they're covenant skills used counterfeitly. Marriage should master these."
                },
                {
                    "question": "What is the honest audit question from Day 1?",
                    "options": [
                        "'How often do I pray for purity?'",
                        "'What am I afraid to practice in my marriage that porn does without shame?'",
                        "'How long has it been since I looked at porn?'",
                        "'Do I love my spouse enough?'"
                    ],
                    "correct": 1,
                    "explanation": "The Honesty Audit asks: 'What am I afraid to practice in my marriage that porn does without shame?' — identifying what needs to be reclaimed for covenant."
                }
            ]
        },
        
        "day2_exam": {
            "title": "Day 2 Exam: Nakedness as Divine Asset — Stewardship Assessment",
            "passing_score": 70,
            "questions": [
                {
                    "question": "According to 1 Corinthians 7:3-4, who has power over your body after marriage?",
                    "options": [
                        "You alone have complete ownership",
                        "Your spouse has complete ownership",
                        "Mutual stewardship — husband and wife steward each other's bodies",
                        "The church has authority over both"
                    ],
                    "correct": 2,
                    "explanation": "1 Corinthians 7:3-4 teaches mutual stewardship: 'The wife hath not power of her own body, but the husband: and likewise also the husband hath not power of his own body, but the wife.'"
                },
                {
                    "question": "What is the difference between 'nudity' and 'nakedness' as taught in Day 2?",
                    "options": [
                        "They are the same thing",
                        "Nudity is clinical/neutral; nakedness is relational/covenantal",
                        "Nudity is sinful; nakedness is holy",
                        "Nudity is for art; nakedness is for marriage"
                    ],
                    "correct": 1,
                    "explanation": "Nudity is clinical, neutral, functional, and public. Nakedness is relational, covenantal, devoted, and private — the unveiling of self for exclusive devotion."
                },
                {
                    "question": "According to Day 2, your nakedness is a _____ to your spouse.",
                    "options": [
                        "burden",
                        "duty",
                        "gift",
                        "private matter"
                    ],
                    "correct": 2,
                    "explanation": "Day 2 teaches: 'Your nakedness is a gift to your spouse' — not a burden, not a necessary evil, but a gift to be stewarded, presented, and celebrated."
                },
                {
                    "question": "What does it mean to 'steward your body as covenant responsibility'?",
                    "options": [
                        "Only worry about your body when you feel like it",
                        "Fitness, hygiene, grooming are acts of marital fidelity",
                        "Your body is private and no one's business",
                        "Only your spouse needs to maintain their appearance"
                    ],
                    "correct": 1,
                    "explanation": "Stewardship means fitness, hygiene, and grooming are acts of marital fidelity. You don't 'let yourself go' because your body isn't yours alone."
                },
                {
                    "question": "What is the 'Song Hour' exercise introduced in Day 2?",
                    "options": [
                        "Singing worship songs together",
                        "30 minutes of fully naked attention and appreciation without sexual pressure",
                        "Reading Song of Solomon aloud",
                        "Listening to romantic music"
                    ],
                    "correct": 1,
                    "explanation": "Song Hour (based on Song of Solomon) is 30 minutes where both partners are fully naked (lights on), practicing attention and appreciation without agenda or pressure."
                },
                {
                    "question": "Why does porn have power according to Day 2?",
                    "options": [
                        "Because it's demonic",
                        "Because it's easily accessible",
                        "Because porn takes nakedness seriously — displaying, presenting, celebrating it — while many marriages hide, neglect, and shame it",
                        "Because people are addicted"
                    ],
                    "correct": 2,
                    "explanation": "Porn has power because it takes nakedness seriously (displays it, practices presentation, celebrates it without shame) while many marriages hide, neglect, despise, and practice shame."
                },
                {
                    "question": "What shame narratives prevent covenant nakedness?",
                    "options": [
                        "'I'm too fat/thin/old/scarred' and 'My body isn't good enough'",
                        "'Nakedness is shameful/embarrassing' and 'Only perfect bodies should be seen'",
                        "Both A and B",
                        "None — shame has no place in covenant"
                    ],
                    "correct": 2,
                    "explanation": "Common shame narratives include body image issues and false beliefs that nakedness is shameful or only for 'perfect' bodies. The truth: shame has NO place in covenant nakedness (Genesis 2:25)."
                },
                {
                    "question": "What is the SBD directive about nakedness?",
                    "options": [
                        "Hide your nakedness except during intercourse",
                        "Steward it, present it, celebrate it without shame",
                        "Only practice nakedness in complete darkness",
                        "Nakedness is a private matter, not to be discussed"
                    ],
                    "correct": 1,
                    "explanation": "The SBD directive is to steward your nakedness as covenant responsibility, practice presentation with intentionality, and celebrate it without shame (Genesis 2:25)."
                },
                {
                    "question": "What does 'practice presentation' mean in the context of nakedness?",
                    "options": [
                        "Give PowerPoint presentations about marriage",
                        "Learn what awakens your spouse's desire; study angles, lighting, posture, expression",
                        "Always look perfect before being intimate",
                        "Hire a professional photographer"
                    ],
                    "correct": 1,
                    "explanation": "'Practice presentation' means learning what awakens your spouse's desire, studying angles, lighting, posture, expression. Nakedness is a skill, not an accident."
                },
                {
                    "question": "What is the homework before Day 3?",
                    "options": [
                        "Complete the Nakedness Inventory and schedule your first Song Hour",
                        "Read the entire Bible",
                        "Avoid all sexual thoughts for 24 hours",
                        "Buy new clothes"
                    ],
                    "correct": 0,
                    "explanation": "Day 2 homework includes: complete the Nakedness Inventory, schedule your first Song Hour (if married), read Song of Solomon 4:1-16, and journal about stewarding nakedness as a divine asset."
                }
            ]
        },
        
        "day3_exam": {
            "title": "Day 3 Exam: Pics & Pearls — Imagination Assessment",
            "passing_score": 70,
            "questions": [
                {
                    "question": "What does 'Pics & Pearls' refer to in Day 3?",
                    "options": [
                        "Photography equipment and jewelry",
                        "Private images, phrases, memories, and rituals exclusive to the covenant",
                        "Social media posts about marriage",
                        "Artwork and decorations for the bedroom"
                    ],
                    "correct": 1,
                    "explanation": "Pics & Pearls = Private images (visual catalog), private phrases (verbal catalog), private memories, and private rituals that are exclusive to the covenant."
                },
                {
                    "question": "According to Day 3, who owns erotic imagination?",
                    "options": [
                        "Pornography owns it",
                        "No one owns it — it's neutral",
                        "Marriage owns erotic imagination",
                        "It should be suppressed completely"
                    ],
                    "correct": 2,
                    "explanation": "Day 3 teaches: 'Pornography does not own erotic imagination. Marriage does.' Every fantasy, affair, or porn habit starts in imagination, so it must be governed, not ignored."
                },
                {
                    "question": "What is a 'Pic' in the Pics & Pearls framework?",
                    "options": [
                        "Any photo you like on social media",
                        "Visual memories and images that awaken desire for your spouse (texts, photos WITH CONSENT, outfits, memories)",
                        "Pictures of celebrities or models",
                        "Random images saved on your phone"
                    ],
                    "correct": 1,
                    "explanation": "A 'Pic' is a visual memory or image that awakens desire for your spouse — texts you saved, photos (WITH CONSENT), outfits, nights you remember, angles/expressions that drive you wild."
                },
                {
                    "question": "What is a 'Pearl' in the Pics & Pearls framework?",
                    "options": [
                        "Jewelry you buy for your spouse",
                        "Generic compliments like 'You're beautiful'",
                        "Erotic language, affirmations, and specific phrases that awaken desire",
                        "Bible verses about marriage"
                    ],
                    "correct": 2,
                    "explanation": "A 'Pearl' is erotic language — specific phrases that awaken desire. NOT generic ('You're beautiful'), but specific: 'I love how your hips move when you walk toward me.'"
                },
                {
                    "question": "What are the rules of covenant imagery (Pics & Pearls)?",
                    "options": [
                        "Never for public, never for strangers, never for leverage, monogamous imagination only, consent required",
                        "Share them on social media for accountability",
                        "Keep them private but imagine anyone you want",
                        "Only think about your spouse during sex"
                    ],
                    "correct": 0,
                    "explanation": "Rules: (1) Never for public, (2) Never for strangers, (3) Never for leverage/manipulation, (4) Monogamous imagination only, (5) Consent required, (6) Protected storage."
                },
                {
                    "question": "According to Song of Solomon 7:6-7 (quoted in Day 3), what does biblical erotic language include?",
                    "options": [
                        "Only spiritual and poetic language",
                        "Visual imagery, body descriptions, erotic language, and imagination directed toward covenant spouse",
                        "Generic compliments and affirmations",
                        "Avoiding all physical descriptions"
                    ],
                    "correct": 1,
                    "explanation": "Song of Solomon includes visual imagery ('palm tree,' 'clusters'), body descriptions ('stature,' 'breasts'), erotic language ('delights,' 'pleasant'), and imagination directed toward covenant spouse."
                },
                {
                    "question": "What must you delete to build a clean Pics & Pearls catalog?",
                    "options": [
                        "All images on your phone",
                        "All counterfeit imagery: porn, images of exes, fantasy scenarios involving others",
                        "Only illegal content",
                        "Nothing — keep everything"
                    ],
                    "correct": 1,
                    "explanation": "Day 3 requires deleting ALL counterfeit imagery: porn, images of exes, and fantasy scenarios involving others. 'Be ruthless. Monogamous imagination requires clean catalogs.'"
                },
                {
                    "question": "What is the biblical model for erotic language in marriage?",
                    "options": [
                        "The book of Proverbs",
                        "Song of Solomon (Song of Songs)",
                        "The Gospel of John",
                        "The book of Revelation"
                    ],
                    "correct": 1,
                    "explanation": "Song of Solomon is God's model for covenant erotic imagination — celebrating body descriptions, using metaphors, praising specific details, with no shame, only delight."
                },
                {
                    "question": "Why is consent required for creating/sharing Pics?",
                    "options": [
                        "It's a legal requirement only",
                        "To avoid arguments",
                        "Because both partners must agree to create/share covenant images — mutual stewardship, not control",
                        "It's not actually required"
                    ],
                    "correct": 2,
                    "explanation": "Consent is required because covenant imagery is about mutual stewardship and devotion, not control or manipulation. Both partners must freely agree to create and share Pics."
                },
                {
                    "question": "What is the couple exercise for Day 3?",
                    "options": [
                        "Take professional photos together",
                        "Exchange one Pearl — practice erotic language without shame",
                        "Delete all photos from your phone",
                        "Write love letters"
                    ],
                    "correct": 1,
                    "explanation": "The Day 3 couple exercise is to exchange ONE Pearl with your spouse — practicing erotic language without shame in a safe, covenant context."
                }
            ]
        },
        
        "day4_exam": {
            "title": "Day 4 Exam: Marriage = Sexuality = Sex — Lifestyle Assessment",
            "passing_score": 70,
            "questions": [
                {
                    "question": "What is the difference between 'sex' and 'sexuality' according to Day 4?",
                    "options": [
                        "They are the same thing",
                        "Sex is the product; sexuality is the lifestyle",
                        "Sex is physical; sexuality is emotional",
                        "Sex is for procreation; sexuality is for pleasure"
                    ],
                    "correct": 1,
                    "explanation": "Day 4 teaches: 'Sex is the product. Sexuality is the lifestyle.' Sexuality is how you dress, smell, present nakedness, steward your body, keep allure alive, maintain seduction."
                },
                {
                    "question": "What does 'due benevolence' mean in 1 Corinthians 7:3?",
                    "options": [
                        "Being kind and polite",
                        "Generic loyalty and emotional support",
                        "Full sexual covenant — nakedness, arousal, allure, imagination, desire, seduction",
                        "Giving your spouse money"
                    ],
                    "correct": 2,
                    "explanation": "'Due benevolence' means full sexual covenant — nakedness, arousal, allure, imagination, desire, seduction. Fidelity is complete sexuality, showing up fully in the sexual union."
                },
                {
                    "question": "What does 'Attitude' mean in the A³ practice?",
                    "options": [
                        "Having a positive mindset",
                        "Intentional seduction (not just 'being available')",
                        "Being respectful",
                        "Controlling your emotions"
                    ],
                    "correct": 1,
                    "explanation": "'Attitude' means intentional seduction — deciding to seduce your spouse, initiating desire, communicating clearly, being mentally present, removing distractions."
                },
                {
                    "question": "What does 'Attire' mean in the A³ practice?",
                    "options": [
                        "Wearing modest clothing",
                        "Dressing professionally",
                        "Dressing for your spouse's desire",
                        "Buying expensive clothes"
                    ],
                    "correct": 2,
                    "explanation": "'Attire' means dressing for your spouse's desire — asking what awakens their desire, investing in covenant attire, dressing for arousal (not just function)."
                },
                {
                    "question": "What does 'Allure' mean in the A³ practice?",
                    "options": [
                        "Being mysterious and distant",
                        "Creating an environment that says 'I want you' (scent, lighting, music, touch, atmosphere)",
                        "Wearing makeup",
                        "Playing hard to get"
                    ],
                    "correct": 1,
                    "explanation": "'Allure' means creating an environment — scent, lighting, music, practicing touch throughout the day, making your bedroom a sanctuary of desire."
                },
                {
                    "question": "What are the 9 sexuality components listed in Day 4?",
                    "options": [
                        "Prayer, fasting, worship, Bible study, etc.",
                        "How I dress, smell, present nakedness, steward my body, keep allure alive, maintain seduction, keep imagination faithful, build erotic memory, cultivate desire",
                        "Love, joy, peace, patience, kindness, etc.",
                        "Communication, respect, trust, commitment, etc."
                    ],
                    "correct": 1,
                    "explanation": "The 9 components are: (1) How I dress, (2) How I smell, (3) How I present nakedness, (4) How I steward my body, (5) How I keep allure alive, (6) How I maintain seduction, (7) How I keep sexual imagination faithful, (8) How I build erotic memory, (9) How I cultivate desire."
                },
                {
                    "question": "What is 'A³ Night' and how often should it be practiced?",
                    "options": [
                        "A monthly date night",
                        "60-90 minutes of intentional A³ practice (Attitude, Attire, Allure) — should be weekly",
                        "An annual anniversary celebration",
                        "A one-time exercise"
                    ],
                    "correct": 1,
                    "explanation": "A³ Night is 60-90 minutes of intentional Attitude, Attire, and Allure practice, and should be committed to as a WEEKLY habit."
                },
                {
                    "question": "What is the A³ Night environment checklist?",
                    "options": [
                        "TV on, lights bright, door unlocked, phones available",
                        "Bedroom clean, candles/dim lighting, music (optional), scent, door locked, phone off, kids asleep",
                        "Go out to dinner and a movie",
                        "Just 'let it happen naturally'"
                    ],
                    "correct": 1,
                    "explanation": "A³ Night checklist: Bedroom clean and inviting, candles or dim lighting, music (optional), scent, door locked, phone off, kids asleep."
                },
                {
                    "question": "According to Day 4, what IS marital fidelity?",
                    "options": [
                        "Never looking at anyone else",
                        "Complete sexuality — practicing all 9 sexuality components faithfully",
                        "Having sex once a week",
                        "Not committing adultery"
                    ],
                    "correct": 1,
                    "explanation": "Day 4 teaches: 'This IS marital fidelity' — complete sexuality across all 9 components. Fidelity is not just avoiding adultery; it's showing up fully in the sexual union."
                },
                {
                    "question": "What is the goal of practicing A³ weekly?",
                    "options": [
                        "To check a box on your to-do list",
                        "To build covenant rhythm — a consistent sexual lifestyle",
                        "To impress your spouse",
                        "To avoid conflict"
                    ],
                    "correct": 1,
                    "explanation": "The goal is to build covenant rhythm — a consistent, intentional sexual lifestyle. Weekly A³ Night makes sexuality a practiced habit, not a random occurrence."
                }
            ]
        },
        
        "day5_exam": {
            "title": "Day 5 Final Exam: Building a Marriage Porn Can't Compete With",
            "passing_score": 80,
            "questions": [
                {
                    "question": "What is the ultimate goal of the 5-Day Freedom Lab?",
                    "options": [
                        "To stop looking at porn through willpower",
                        "To feel guilty and ashamed",
                        "Covenant superiority — a marriage so sexually alive that porn has nothing to offer",
                        "To become perfect and sinless"
                    ],
                    "correct": 2,
                    "explanation": "The goal is covenant superiority — a marriage so sexually alive, so erotically devoted, so nakedly practiced, that porn has nothing unique to offer."
                },
                {
                    "question": "What is a 'Teleios Marriage' as defined in Day 5?",
                    "options": [
                        "A perfect, sinless marriage",
                        "Abundant, intelligent, erotic, covenantal joy — marriages that children can safely imitate and nations can safely depend on",
                        "A marriage without any problems",
                        "A marriage where both spouses never disagree"
                    ],
                    "correct": 1,
                    "explanation": "A Teleios Marriage is defined as: Abundant, intelligent, erotic, covenantal joy — marriages that children can safely imitate and nations can safely depend on."
                },
                {
                    "question": "According to Romans 12:21 (the key verse for this course), how do you overcome porn?",
                    "options": [
                        "By installing filters and accountability software",
                        "By feeling ashamed and repenting repeatedly",
                        "'Be not overcome of evil, but overcome evil with good' — by building a covenant so sexually superior that porn has nothing to offer",
                        "By avoiding all sexual thoughts"
                    ],
                    "correct": 2,
                    "explanation": "Romans 12:21: 'Be not overcome of evil, but overcome evil with good.' You overcome porn by building a covenant so sexually superior that porn cannot compete."
                },
                {
                    "question": "What is the weekly practice schedule introduced in Day 5?",
                    "options": [
                        "Song Hour (30 min), A³ Night (60-90 min), Weekly Check-In (15 min)",
                        "Daily prayer, weekly Bible study, monthly fasting",
                        "Date night once per month",
                        "No specific schedule — just 'be spontaneous'"
                    ],
                    "correct": 0,
                    "explanation": "Weekly practices: (1) Song Hour (30 min) — unashamed nakedness, (2) A³ Night (60-90 min) — Attitude, Attire, Allure, (3) Weekly Check-In (15 min) — Green/Yellow/Red."
                },
                {
                    "question": "What is the Green/Yellow/Red system in the Weekly Check-In?",
                    "options": [
                        "A traffic light decoration system",
                        "Green = what's working sexually, Yellow = what needs attention, Red = what's off-limits or causing harm",
                        "A rating system for physical attraction",
                        "A budgeting system for date nights"
                    ],
                    "correct": 1,
                    "explanation": "Green/Yellow/Red system: Green = what's working sexually, Yellow = what needs attention, Red = what's off-limits or causing harm. Honest weekly feedback system."
                },
                {
                    "question": "What are the daily practices from Day 5?",
                    "options": [
                        "Morning devotions and evening prayer",
                        "Tender Pursuit (5 min) — non-sexual touch, verbal affirmation, presence; Pics & Pearls Journaling (ongoing)",
                        "Exercise and healthy eating",
                        "Social media posts about marriage"
                    ],
                    "correct": 1,
                    "explanation": "Daily practices: (1) Tender Pursuit (5 min minimum) — non-sexual touch, Pearls, eye contact, presence, attention. (2) Pics & Pearls Journaling — add new memories, review covenant imagery, keep imagination monogamous."
                },
                {
                    "question": "How often should you do a Monthly Inventory?",
                    "options": [
                        "Never — weekly is enough",
                        "Every month (30 minutes) — review Pics & Pearls catalog, celebrate wins, address gaps, add new memories",
                        "Once per year",
                        "Only when there's a problem"
                    ],
                    "correct": 1,
                    "explanation": "Monthly Inventory (30 min): Review Pics & Pearls catalog, celebrate wins, address gaps, add new memories. Keeps the covenant fresh and intentional."
                },
                {
                    "question": "What is the Quarterly Deep Dive?",
                    "options": [
                        "A vacation or retreat",
                        "2-3 hours to re-read Marriage=Porn & Beyond, revisit all 5-day exercises, recalibrate practices, set new 90-day goals",
                        "A financial planning session",
                        "A counseling appointment"
                    ],
                    "correct": 1,
                    "explanation": "Quarterly Deep Dive (2-3 hours): Re-read the Marriage=Porn & Beyond book, revisit all 5-day exercises, recalibrate covenant practices, set new 90-day goals."
                },
                {
                    "question": "What happens when covenant practices all that porn offers?",
                    "options": [
                        "Nothing changes",
                        "You feel more tempted",
                        "Porn has nothing unique to offer — covenant outperforms the counterfeit",
                        "You become prideful"
                    ],
                    "correct": 2,
                    "explanation": "When covenant practices nakedness, seduction, erotic imagery (Pics & Pearls), imagination, and commitment — porn has nothing unique to offer. Covenant outperforms the counterfeit."
                },
                {
                    "question": "What is the promise if you practice these rhythms for 90 days?",
                    "options": [
                        "You'll never struggle with temptation again",
                        "Your marriage will be more sexually alive, porn will lose appeal, you'll have tools for lifelong fidelity, your children will inherit a safe model",
                        "You'll earn God's favor",
                        "You'll become famous marriage counselors"
                    ],
                    "correct": 1,
                    "explanation": "The 90-day promise: (1) Your marriage will be more sexually alive, (2) Porn will lose its appeal, (3) You'll have tools for lifelong fidelity, (4) Your children will inherit a model they can safely imitate."
                },
                {
                    "question": "According to Day 5, what must formation be built on?",
                    "options": [
                        "Good intentions and feelings",
                        "Systems — weekly, daily, monthly, quarterly practices",
                        "One-time decisions",
                        "Sporadic efforts when motivated"
                    ],
                    "correct": 1,
                    "explanation": "Day 5 teaches: 'Formation requires systems' — weekly, daily, monthly, quarterly practices. Covenant superiority is built through consistent rhythms, not one-time decisions."
                },
                {
                    "question": "What is the comparison table in Day 5 showing?",
                    "options": [
                        "Marriage vs. singleness",
                        "What porn offers vs. what covenant offers (when practiced)",
                        "Christian marriage vs. secular marriage",
                        "Old Testament vs. New Testament marriage"
                    ],
                    "correct": 1,
                    "explanation": "The table compares what porn offers (nakedness, variety, seduction, imagery, no commitment, fantasy) vs. what covenant offers when practiced (devoted nakedness, depth, faithful seduction, Pics & Pearls, deep commitment, monogamous imagination)."
                },
                {
                    "question": "Why is accountability important according to Day 5?",
                    "options": [
                        "To catch you when you fail",
                        "To shame you into obedience",
                        "Formation happens in community — tell someone about your journey",
                        "It's not important — this is private"
                    ],
                    "correct": 2,
                    "explanation": "Day 5 teaches: 'Accountability matters — formation happens in community.' Tell a pastor, mentor couple, trusted friend, or counselor about your journey."
                },
                {
                    "question": "What are the companion books recommended in Day 5?",
                    "options": [
                        "Any Christian marriage books",
                        "The Art of Sexuality, The Art of Nakedness, Muliebrity Baron (for wives), Virility Baron (for husbands)",
                        "The Bible only",
                        "Self-help and psychology books"
                    ],
                    "correct": 1,
                    "explanation": "Recommended companion books: The Art of Sexuality, The Art of Nakedness, Muliebrity Baron (for wives), Virility Baron (for husbands) — all part of the SBD curriculum."
                },
                {
                    "question": "What is the final call to action in Day 5?",
                    "options": [
                        "'Try your best and hope for the best'",
                        "'This is covenant superiority. Now go live it.'",
                        "'Good luck on your journey'",
                        "'You're on your own from here'"
                    ],
                    "correct": 1,
                    "explanation": "Day 5 concludes: 'This is covenant superiority. Now go live it.' The real work begins after the course — implementing weekly habits, accountability, ongoing formation."
                }
            ]
        }
    }
    
    return exams


def main():
    print("📝 Adding comprehensive exams to Marriage=Porn & Beyond course...\n")
    
    # Load current courses catalogue
    with open('courses-catalogue.json', 'r', encoding='utf-8') as f:
        courses = json.load(f)
    
    # Find Marriage=Porn course
    marriage_porn_course = None
    for course in courses:
        if course['courseId'] == 'marriage-porn-beyond':
            marriage_porn_course = course
            break
    
    if not marriage_porn_course:
        print("❌ Marriage=Porn & Beyond course not found!")
        return
    
    print(f"✅ Found course: {marriage_porn_course['title']}\n")
    
    # Create exams
    exams = create_exams()
    
    # Add exams to course
    marriage_porn_course['exams'] = exams
    
    # Save updated catalogue
    with open('courses-catalogue.json', 'w', encoding='utf-8') as f:
        json.dump(courses, f, indent=2, ensure_ascii=False)
    
    print("✅ Exams added successfully!\n")
    print("📊 Exam Summary:")
    print(f"   - Day 1 Exam: {len(exams['day1_exam']['questions'])} questions (passing: {exams['day1_exam']['passing_score']}%)")
    print(f"   - Day 2 Exam: {len(exams['day2_exam']['questions'])} questions (passing: {exams['day2_exam']['passing_score']}%)")
    print(f"   - Day 3 Exam: {len(exams['day3_exam']['questions'])} questions (passing: {exams['day3_exam']['passing_score']}%)")
    print(f"   - Day 4 Exam: {len(exams['day4_exam']['questions'])} questions (passing: {exams['day4_exam']['passing_score']}%)")
    print(f"   - Day 5 Final Exam: {len(exams['day5_exam']['questions'])} questions (passing: {exams['day5_exam']['passing_score']}%)")
    print(f"\n📄 Total: {sum(len(exam['questions']) for exam in exams.values())} questions across 5 exams")
    print("\n✅ All exams saved to courses-catalogue.json")
    print("\n🎓 Students must pass each exam before progressing to the next day!")

if __name__ == '__main__':
    main()
