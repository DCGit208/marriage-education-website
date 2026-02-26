#!/usr/bin/env python3
"""
Create Module 2 downloadable PDFs
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT

def create_study_guide():
    """Chapter 2 Study Guide: Sexual Literacy Foundations"""
    doc = SimpleDocTemplate("downloads/chapter-2-study-guide.pdf", pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=20, textColor=colors.HexColor('#1a1a1a'), spaceAfter=30, alignment=TA_CENTER)
    story.append(Paragraph("Chapter 2 Study Guide", title_style))
    story.append(Paragraph("Sexual Literacy Foundations", styles['Heading2']))
    story.append(Spacer(1, 0.3*inch))
    
    # Content sections
    sections = [
        ("Key Concepts", [
            "Sexual literacy is foundational knowledge required BEFORE pursuing sexual expression",
            "Nakedness without shame requires proper context (marital covenant)",
            "Sexual hedonism = pleasure-seeking divorced from design, purpose, and consequence",
            "Sex = Marriage: Sexual union creates marriage covenant before God",
            "Wholeness Math: 1 (whole person) + 1 (whole person) = 1 (unified marriage)",
            "Literacy before passion: Knowledge must precede practice"
        ]),
        ("Study Questions", [
            "1. What is the 'sexual literacy crisis' described in Chapter 2?",
            "2. How does Genesis 2:25 ('naked and unashamed') relate to modern sexual ethics?",
            "3. Define 'sexual hedonism' in your own words.",
            "4. Explain the equation: Sex = Marriage. What are the implications?",
            "5. What does 'wholeness math' teach about readiness for marriage?",
            "6. Why must sexual literacy come BEFORE sexual passion?"
        ]),
        ("Reflection Prompts", [
            "How has cultural messaging shaped your understanding of sexuality?",
            "What 'literacy gaps' do you personally need to address?",
            "How can you pursue wholeness in your current relational season?"
        ]),
        ("Scripture Memory", [
            "Genesis 2:24-25 - 'Therefore a man shall leave his father and mother...'",
            "1 Corinthians 6:18-20 - 'Flee sexual immorality...'",
            "Ephesians 5:3 - 'But sexual immorality... must not even be named among you...'"
        ])
    ]
    
    for section_title, items in sections:
        story.append(Paragraph(section_title, styles['Heading3']))
        story.append(Spacer(1, 0.1*inch))
        for item in items:
            story.append(Paragraph(f"• {item}", styles['Normal']))
            story.append(Spacer(1, 0.05*inch))
        story.append(Spacer(1, 0.2*inch))
    
    doc.build(story)
    print("✅ Created: chapter-2-study-guide.pdf")

def create_wholeness_worksheet():
    """Wholeness Math Self-Assessment Worksheet"""
    doc = SimpleDocTemplate("downloads/wholeness-math-worksheet.pdf", pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=18, textColor=colors.HexColor('#1a1a1a'), spaceAfter=20, alignment=TA_CENTER)
    story.append(Paragraph("Wholeness Math Self-Assessment", title_style))
    story.append(Paragraph("Am I a '1' ready to unite with another '1'?", styles['Heading3']))
    story.append(Spacer(1, 0.3*inch))
    
    story.append(Paragraph("<b>Instructions:</b> Rate yourself honestly in each area (1-10 scale, where 10 = fully developed)", styles['Normal']))
    story.append(Spacer(1, 0.2*inch))
    
    # Assessment categories
    categories = [
        ("Spiritual Wholeness", [
            "___ I have a vibrant personal relationship with God",
            "___ I understand my identity in Christ",
            "___ I practice consistent spiritual disciplines (prayer, Bible study)",
            "___ I'm actively involved in Christian community",
            "___ I can articulate my core spiritual convictions"
        ]),
        ("Emotional Wholeness", [
            "___ I can identify and express my emotions healthily",
            "___ I've addressed past relational wounds/trauma",
            "___ I don't need a relationship to feel complete",
            "___ I practice healthy emotional boundaries",
            "___ I can self-soothe without external validation"
        ]),
        ("Sexual Wholeness", [
            "___ I have proper sexual literacy (understand design/purpose)",
            "___ I've surrendered sexual expression to God's timing",
            "___ I've addressed pornography or sexual sin patterns",
            "___ I understand covenant vs. casual sexuality",
            "___ I can articulate God's design for sex"
        ]),
        ("Financial Wholeness", [
            "___ I live within my means (no consumer debt)",
            "___ I practice biblical stewardship/tithing",
            "___ I have emergency savings",
            "___ I can provide for myself independently",
            "___ I understand financial partnership in marriage"
        ]),
        ("Relational Wholeness", [
            "___ I have healthy friendships",
            "___ I honor my parents (or have resolved family issues)",
            "___ I can resolve conflict maturely",
            "___ I don't have unresolved codependent patterns",
            "___ I can give and receive love freely"
        ])
    ]
    
    for category, items in categories:
        story.append(Paragraph(f"<b>{category}</b>", styles['Heading4']))
        story.append(Spacer(1, 0.1*inch))
        for item in items:
            story.append(Paragraph(item, styles['Normal']))
            story.append(Spacer(1, 0.05*inch))
        story.append(Spacer(1, 0.15*inch))
    
    story.append(Spacer(1, 0.2*inch))
    story.append(Paragraph("<b>Scoring:</b>", styles['Heading4']))
    story.append(Paragraph("• 225-250: You're likely ready for marital partnership (a solid '1')", styles['Normal']))
    story.append(Paragraph("• 175-224: Good foundation, but address gaps before marriage", styles['Normal']))
    story.append(Paragraph("• Below 175: Focus on personal wholeness development first", styles['Normal']))
    
    doc.build(story)
    print("✅ Created: wholeness-math-worksheet.pdf")

def create_green_yellow_red_lists():
    """Green/Yellow/Red Lists Builder"""
    doc = SimpleDocTemplate("downloads/green-yellow-red-lists.pdf", pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=18, textColor=colors.HexColor('#1a1a1a'), spaceAfter=20, alignment=TA_CENTER)
    story.append(Paragraph("Green, Yellow, Red Lists Builder", title_style))
    story.append(Paragraph("Sexual Boundaries & Convictions Worksheet", styles['Heading3']))
    story.append(Spacer(1, 0.3*inch))
    
    story.append(Paragraph("<b>Purpose:</b> Define your personal sexual boundaries BEFORE you're in tempting situations. These lists help you live with integrity according to biblical convictions.", styles['Normal']))
    story.append(Spacer(1, 0.2*inch))
    
    lists = [
        ("🟢 GREEN LIST: ALWAYS ACCEPTABLE", "Biblical behaviors that honor God and build healthy relationships", [
            "Example: Prayer together, holding hands, encouraging words",
            "1. _________________________________________________",
            "2. _________________________________________________",
            "3. _________________________________________________",
            "4. _________________________________________________",
            "5. _________________________________________________"
        ]),
        ("🟡 YELLOW LIST: PROCEED WITH CAUTION", "Behaviors that aren't sinful but could lead to temptation (require accountability)", [
            "Example: Extended time alone, intimate conversation topics",
            "1. _________________________________________________",
            "2. _________________________________________________",
            "3. _________________________________________________",
            "4. _________________________________________________",
            "5. _________________________________________________"
        ]),
        ("🔴 RED LIST: ABSOLUTE BOUNDARIES", "Non-negotiable biblical boundaries (sexual sin to avoid at all costs)", [
            "Example: Sexual intercourse outside marriage, pornography, sexual touching",
            "1. _________________________________________________",
            "2. _________________________________________________",
            "3. _________________________________________________",
            "4. _________________________________________________",
            "5. _________________________________________________"
        ])
    ]
    
    for title, description, items in lists:
        story.append(Paragraph(f"<b>{title}</b>", styles['Heading4']))
        story.append(Paragraph(description, styles['Normal']))
        story.append(Spacer(1, 0.1*inch))
        for item in items:
            story.append(Paragraph(item, styles['Normal']))
            story.append(Spacer(1, 0.05*inch))
        story.append(Spacer(1, 0.2*inch))
    
    story.append(PageBreak())
    story.append(Paragraph("<b>Accountability Questions:</b>", styles['Heading4']))
    questions = [
        "1. Who will hold me accountable to these boundaries?",
        "2. What situations should I avoid to honor my Red List?",
        "3. How will I communicate these boundaries to a dating partner?",
        "4. What is my action plan if I violate a boundary?",
        "5. How do my lists reflect biblical convictions vs. cultural norms?"
    ]
    for q in questions:
        story.append(Paragraph(q, styles['Normal']))
        story.append(Spacer(1, 0.3*inch))
    
    doc.build(story)
    print("✅ Created: green-yellow-red-lists.pdf")

def create_complete_assessment():
    """Complete Sexual Literacy Assessment (40 questions)"""
    doc = SimpleDocTemplate("downloads/complete-sexual-literacy-assessment.pdf", pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=18, textColor=colors.HexColor('#1a1a1a'), spaceAfter=20, alignment=TA_CENTER)
    story.append(Paragraph("Complete Sexual Literacy Assessment", title_style))
    story.append(Paragraph("40-Question Comprehensive Exam", styles['Heading3']))
    story.append(Spacer(1, 0.3*inch))
    
    story.append(Paragraph("<b>Instructions:</b> Answer all 40 questions to assess your sexual literacy. Passing score: 85% (34/40 correct)", styles['Normal']))
    story.append(Spacer(1, 0.3*inch))
    
    questions = [
        ("True/False (1-10)", [
            "1. Sexual intercourse creates a marriage covenant before God. T/F",
            "2. Sexual hedonism prioritizes pleasure without considering design or consequences. T/F",
            "3. The 'wholeness math' concept suggests broken people can complete each other. T/F",
            "4. Genesis 2:25 teaches that nakedness requires marital context to be shame-free. T/F",
            "5. Sexual literacy can be developed after marriage without consequence. T/F",
            "6. Cultural messaging has no impact on personal sexual ethics. T/F",
            "7. The Bible teaches sex is primarily for procreation, not intimacy. T/F",
            "8. Two incomplete halves can form a healthy whole in marriage. T/F",
            "9. Sexual boundaries should be established BEFORE entering relationships. T/F",
            "10. Emotional readiness is unnecessary if you're physically attracted. T/F"
        ]),
        ("Multiple Choice (11-25)", [
            "11. What does 'sexual literacy' mean?\n   a) Knowing anatomy  b) Understanding God's design/purpose  c) Reading books about sex  d) Having experience",
            "12. 'Naked and unashamed' (Genesis 2:25) requires:\n   a) Physical fitness  b) Self-confidence  c) Marital covenant  d) Cultural acceptance",
            "13. Sexual hedonism is characterized by:\n   a) Pleasure-seeking divorced from purpose  b) Healthy marital intimacy  c) Delayed gratification  d) Biblical sexuality",
            "14. The 'Sex = Marriage' equation means:\n   a) Marriage requires sex  b) Sexual union creates covenant  c) Legal marriage comes first  d) Sex is recreational",
            "15. Wholeness math teaches:\n   a) 0.5 + 0.5 = 1  b) 1 + 1 = 1  c) 2 + 2 = 1  d) Marriage completes you",
            "16-25. [Additional multiple choice questions covering Chapter 2 concepts]"
        ]),
        ("Short Answer (26-35)", [
            "26. Define sexual literacy in your own words (2-3 sentences).",
            "27. Explain why sexual hedonism is problematic from a Teleios perspective.",
            "28. What are the spiritual consequences of sex outside marriage?",
            "29. How does Genesis 2:24-25 establish God's design for sexuality?",
            "30. Why must personal wholeness precede marital partnership?",
            "31-35. [Additional short answer questions]"
        ]),
        ("Scenario Application (36-40)", [
            "36. A friend says, 'Sex is just physical—it doesn't affect my spiritual life.' How would you respond using Chapter 2 concepts?",
            "37. You're dating someone who pressures you physically. Using the Green/Yellow/Red framework, what should you do?",
            "38. A engaged couple asks, 'We're getting married soon—does it really matter if we have sex now?' Apply the 'Sex = Marriage' principle.",
            "39. Someone says, 'I'll become complete when I find my soulmate.' Correct this using wholeness math.",
            "40. How would you counsel someone addicted to pornography using sexual literacy principles?"
        ])
    ]
    
    for section, items in questions:
        story.append(Paragraph(f"<b>{section}</b>", styles['Heading4']))
        story.append(Spacer(1, 0.1*inch))
        for q in items:
            story.append(Paragraph(q, styles['Normal']))
            story.append(Spacer(1, 0.15*inch))
        story.append(Spacer(1, 0.2*inch))
    
    doc.build(story)
    print("✅ Created: complete-sexual-literacy-assessment.pdf")

def create_scripture_memory_cards():
    """Module 2 Scripture Memory Cards"""
    doc = SimpleDocTemplate("downloads/module-2-scripture-cards.pdf", pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=18, textColor=colors.HexColor('#1a1a1a'), spaceAfter=20, alignment=TA_CENTER)
    story.append(Paragraph("Module 2 Scripture Memory Cards", title_style))
    story.append(Paragraph("Cut out and memorize these key passages", styles['Heading3']))
    story.append(Spacer(1, 0.3*inch))
    
    scriptures = [
        ("Genesis 2:24-25", "Therefore a man shall leave his father and mother and hold fast to his wife, and they shall become one flesh. And the man and his wife were both naked and were not ashamed.", "Foundation of marital intimacy"),
        ("1 Corinthians 6:18-20", "Flee from sexual immorality. Every other sin a person commits is outside the body, but the sexually immoral person sins against his own body. Or do you not know that your body is a temple of the Holy Spirit within you?", "Consequences of sexual sin"),
        ("Ephesians 5:3", "But sexual immorality and all impurity or covetousness must not even be named among you, as is proper among saints.", "Standard of purity"),
        ("Proverbs 5:18-19", "Let your fountain be blessed, and rejoice in the wife of your youth, a lovely deer, a graceful doe. Let her breasts fill you at all times with delight; be intoxicated always in her love.", "Celebration of marital sexuality"),
        ("Hebrews 13:4", "Let marriage be held in honor among all, and let the marriage bed be undefiled, for God will judge the sexually immoral and adulterous.", "Honor the marriage covenant"),
        ("1 Thessalonians 4:3-5", "For this is the will of God, your sanctification: that you abstain from sexual immorality; that each one of you know how to control his own body in holiness and honor, not in the passion of lust like the Gentiles who do not know God.", "Self-control and sanctification")
    ]
    
    for ref, text, application in scriptures:
        # Create bordered box for each card
        story.append(Paragraph(f"<b>{ref}</b>", styles['Heading4']))
        story.append(Spacer(1, 0.05*inch))
        story.append(Paragraph(f'"{text}"', styles['Normal']))
        story.append(Spacer(1, 0.05*inch))
        story.append(Paragraph(f"<i>Application: {application}</i>", styles['Normal']))
        story.append(Spacer(1, 0.3*inch))
        story.append(Paragraph("_" * 80, styles['Normal']))
        story.append(Spacer(1, 0.2*inch))
    
    doc.build(story)
    print("✅ Created: module-2-scripture-cards.pdf")

def create_cultural_lies_inventory():
    """Cultural Lies Inventory Template"""
    doc = SimpleDocTemplate("downloads/cultural-lies-inventory.pdf", pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], fontSize=18, textColor=colors.HexColor('#1a1a1a'), spaceAfter=20, alignment=TA_CENTER)
    story.append(Paragraph("Cultural Lies Inventory", title_style))
    story.append(Paragraph("Identifying False Beliefs About Sexuality", styles['Heading3']))
    story.append(Spacer(1, 0.3*inch))
    
    story.append(Paragraph("<b>Instructions:</b> For each cultural lie, rate how much you've believed it (1-5), then write the biblical truth that counters it.", styles['Normal']))
    story.append(Spacer(1, 0.2*inch))
    
    lies = [
        ("Sex is just physical—it has no spiritual consequences", "Biblical Truth: 1 Cor 6:18 - Sex affects body, soul, spirit"),
        ("You need to 'test drive' sexual compatibility before marriage", "Biblical Truth: Wholeness + Commitment = Sexual flourishing"),
        ("As long as you love each other, sex is okay", "Biblical Truth: Love without covenant is not biblical love"),
        ("Everyone is doing it—purity is unrealistic", "Biblical Truth: Narrow is the way (Matt 7:14)"),
        ("Your sexual past doesn't matter", "Biblical Truth: Sin has consequences, but God offers redemption"),
        ("Marriage will complete you and make you happy", "Biblical Truth: Only Christ completes; marriage unites two whole people"),
        ("Sex is primarily for pleasure/recreation", "Biblical Truth: Sex = covenant-making, procreation, intimacy"),
        ("You can separate emotional/spiritual from physical intimacy", "Biblical Truth: Sexual union creates one-flesh bond (Gen 2:24)"),
        ("Pornography is harmless if you're not physically cheating", "Biblical Truth: Lust = adultery of the heart (Matt 5:28)"),
        ("Living together before marriage prevents divorce", "Biblical Truth: Statistics show opposite; covenant precedes cohabitation")
    ]
    
    for i, (lie, truth) in enumerate(lies, 1):
        story.append(Paragraph(f"<b>{i}. CULTURAL LIE:</b> {lie}", styles['Normal']))
        story.append(Spacer(1, 0.05*inch))
        story.append(Paragraph(f"How much have I believed this? (1=not at all, 5=fully) _____", styles['Normal']))
        story.append(Spacer(1, 0.05*inch))
        story.append(Paragraph(f"<b>BIBLICAL TRUTH:</b> {truth}", styles['Normal']))
        story.append(Spacer(1, 0.05*inch))
        story.append(Paragraph("My reflection: __________________________________________________________", styles['Normal']))
        story.append(Spacer(1, 0.05*inch))
        story.append(Paragraph("________________________________________________________________", styles['Normal']))
        story.append(Spacer(1, 0.2*inch))
    
    doc.build(story)
    print("✅ Created: cultural-lies-inventory.pdf")

if __name__ == "__main__":
    print("Creating Module 2 downloadable PDFs...")
    print("=" * 60)
    
    create_study_guide()
    create_wholeness_worksheet()
    create_green_yellow_red_lists()
    create_complete_assessment()
    create_scripture_memory_cards()
    create_cultural_lies_inventory()
    
    print("=" * 60)
    print("✅ All 6 PDFs created successfully in downloads/ directory")
