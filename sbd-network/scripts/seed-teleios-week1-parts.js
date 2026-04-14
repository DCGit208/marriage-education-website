// Seed 8-part structure into teleios-week-1 Firestore module
// Week 1 = free access. All 8 parts free. Weeks 2-6 stay foundation.
// Uses set({merge:true}) — preserves all existing fields (courseId, schoolId, etc.)

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');
if (!fs.existsSync(SERVICE_ACCOUNT)) {
  console.error('❌ serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT)) });
const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────
// 8 PARTS — Week 1: Integrated Training
// Parts 1–4: 📚 Teleios Track     Parts 5–8: 🎯 Advocacy Track
// ─────────────────────────────────────────────────────────────────

const PARTS = [

  // ── PART 1 ────────────────────────────────────────────────────
  {
    id: 'part-1',
    order: 1,
    track: 'teleios',
    title: 'You Were Created Teleios',
    estimatedMinutes: 20,
    content: `# You Were Created Teleios

## The Central Truth

Humanity was not created broken. Humanity was created whole. Humanity was created holy. Humanity was created **teleios**—complete, entire, lacking nothing.

## Week Overview

**Core Question:** What does it mean to be "ready" for marriage? Is maturity a feeling or a capacity?

**Key Insight:** You don't become perfect. You practice FROM perfection—your original design.

## Learning Outcomes

By the end of this week, you will:

- Understand the biblical concept of teleios (wholeness/maturity)
- Assess your current covenant capacities using the 5 Faculties Framework
- Distinguish between formation (structural) and information (cosmetic)
- Execute a daily 25-minute practice for 7 consecutive days
- Identify your 3 strongest and 3 weakest covenant capacities

---

## The Ontology of Perfection

> "And God said, Let us make man in our image, after our likeness... So God created man in His own image... male and female created He them." — Genesis 1:26-28 (KJV)

This is not symbolic language. This is not metaphor. This is **ontology**—the truth of being before the corruption of becoming.

You were created in the image of God. Not as a broken thing needing completion, but as a whole person possessing the capacities of your Creator.

### Key Concept: Created, Justified, Practicing

- **Your original design:** Perfect, whole, complete (teleios) — Genesis 1:26-28
- **Your current standing:** Justified freely by grace, complete in Christ — Romans 3:24; Colossians 2:10
- **Your daily practice:** Live FROM the righteousness already given, not TO earn what you already possess

> "For all have sinned, and come short of the glory of God; Being justified freely by his grace through the redemption that is in Christ Jesus." — Romans 3:23-24 (KJV)

> "And ye are complete in him, which is the head of all principality and power." — Colossians 2:10 (KJV)

The word "justified" (δικαιόω - dikaioō) means to render righteous, to show as innocent, to declare just. You have already been justified. It is finished. Your standing before God is settled.

Therefore: You don't practice holiness TO become righteous. You practice holiness FROM the righteousness Christ has already secured.

---

## The Etymology of "Be Perfect"

> "Be ye therefore perfect, even as your Father which is in heaven is perfect." — Matthew 5:48 (KJV)

Because holiness is not a target—it is your template.

The word "be" does not mean "become." Perfection is not a destination. Perfection is your origin.

### Etymology of "Be"

- **Old English:** beon — to exist, to remain, to abide
- **Proto-Germanic:** beunan — to be in a state
- **Definition:** to stand in what already is; to manifest what is extant

### What "Be Perfect" Means

To "be perfect" means to:

- Exist from perfection
- Operate from completeness
- Express your original state
- Live from the truth of your nature

It does NOT mean "attempt perfection." It means "act according to what you already are."

### Wrong vs. Right Mindset

❌ **Wrong:** "I'm broken and need to become whole" → Result: Shame, paralysis, endless striving

✅ **Right:** "I was created whole; Christ has restored me; I practice FROM that reality" → Result: Hope, formation, steady progress`
  },

  // ── PART 2 ────────────────────────────────────────────────────
  {
    id: 'part-2',
    order: 2,
    track: 'teleios',
    title: 'The Ephesians 4 Framework',
    estimatedMinutes: 20,
    content: `# The Ephesians 4 Framework

> "That ye put off concerning the former conversation the old man, which is corrupt according to the deceitful lusts; And be renewed in the spirit of your mind; And that ye put on the new man, which after God is created in righteousness and true holiness." — Ephesians 4:22-24 (KJV)

## The Critical Distinction

**Righteousness (δικαιοσύνη) = STATE** — Your status before God—declared right, justified, perfect in Christ. This is your ontological reality.

**True Holiness (ὁσιότης) = DUTY** — Your responsibility to live according to that righteousness. This is your practical responsibility.

**Key Understanding:** You don't practice TO righteousness (you already possess it). You practice FROM righteousness (living out what you already are).

> "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new." — 2 Corinthians 5:17 (KJV)

> "Herein is our love made perfect, that we may have boldness in the day of judgment: because as he is, so are we in this world." — 1 John 4:17 (KJV)

As He is, so are we. Not "as He is, so we hope to become." Not "as He is, so we strive toward." As He is, so are we—NOW, in this world, justified and complete.

## The Three-Part Movement

**Put Off (Apotithemi)** — Strip away the "old man"—the corrupted patterns, the deceitful lusts, the broken rhythms that obscure your original design.

**Be Renewed (Ananeousthai)** — Renovate your thinking. Return to the truth of what you are: created in God's image, justified freely, complete in Christ.

**Put On (Enduo)** — Live FROM righteousness. Practice holiness as the duty that flows from your state of perfection in Christ.

---

## The UDHR Connection

> "Men and women of full age, without any limitation due to race, nationality or religion, have the right to marry and to found a family." — Universal Declaration of Human Rights, Article 16.1

The phrase "full age" is not about chronological years. It's about maturity—the capacity to bear the weight of covenant.

The UDHR enshrines a biblical principle: marriage requires wholeness. Not perfection as "sinlessness," but perfection as "fitness for purpose"—the structural integrity to sustain covenant under load.

### The Comparison

❌ **Chronological Age:** 18, 21, 25 years old — measures time, not capacity

✅ **Teleios Maturity:** "Full age" = Covenant capacity — measures structural readiness

You don't "age into" covenant capacity. You build it through formation—practicing FROM the perfection you were created to embody and the righteousness Christ has secured.`
  },

  // ── PART 3 ────────────────────────────────────────────────────
  {
    id: 'part-3',
    order: 3,
    track: 'teleios',
    title: 'The 5 Faculties Framework',
    estimatedMinutes: 30,
    content: `# The 5 Faculties Framework

Teleios maturity expresses through five faculties—capacities every covenant-bearing person must possess.

---

## 1. Behavioral Faculty — Self-Governance

Control your reactions, not just your actions. Keep your word even when it costs you.

> "He that is slow to anger is better than the mighty; and he that ruleth his spirit than he that taketh a city." — Proverbs 16:32

**Diagnostic Questions:**
- Can I keep my word when it costs me?
- Do I maintain discipline when no one is watching?
- Do I govern my behavior or do circumstances govern me?

---

## 2. Appetitive Faculty — Desire Stewardship

Govern your appetites; they don't govern you.

> "Every man that striveth for the mastery is temperate in all things." — 1 Corinthians 9:25

**Diagnostic Questions:**
- Do I control my desires or do they control me?
- Can I fast without collapsing?
- Where am I enslaved to an appetite?

---

## 3. Relational Faculty — Conflict Repair

Disagree without destroying. Repair within 24 hours.

> "Be ye angry, and sin not: let not the sun go down upon your wrath." — Ephesians 4:26

**Diagnostic Questions:**
- Can I apologize cleanly without excuses?
- Do I repair within 24 hours or ghost for days/weeks?
- Do I own my portion or blame-shift?

---

## 4. Temperamental Faculty — Emotional Maturity

Feel deeply without being ruled by feelings.

> "But strong meat belongeth to them that are of full age (teleios)..." — Hebrews 5:14

**Diagnostic Questions:**
- Can I remain steady under pressure?
- Do I use emotions to manipulate or inform?
- Do I react or respond?

---

## 5. Moral Faculty — Responsibility

Own your portion without blame-shifting.

> "So then every one of us shall give account of himself to God." — Romans 14:12

**Diagnostic Questions:**
- Do I own my failures or deflect?
- Can I say "I was wrong" without qualifiers?
- Do I demand from others what I refuse to become?

---

## Self-Assessment Exercise

Rate yourself honestly (1–10) in each faculty. Your lowest score is your starting point.

- **Behavioral Capacity:** Can I keep my word when it costs me? ___/10
- **Appetitive Control:** Do I govern my desires or do they govern me? ___/10
- **Relational Repair:** Can I apologize cleanly and repair within 24 hours? ___/10
- **Emotional Steadiness:** Do I respond thoughtfully or react emotionally? ___/10
- **Moral Ownership:** Can I say "I was wrong" without excuses? ___/10`
  },

  // ── PART 4 ────────────────────────────────────────────────────
  {
    id: 'part-4',
    order: 4,
    track: 'teleios',
    title: 'Formation in Practice',
    estimatedMinutes: 25,
    content: `# Formation in Practice

## Why This Matters for Marriage

### The False Equation vs. The Design Equation

❌ **Cultural Lie: 0.5 + 0.5** — "You complete me" — Two incomplete people hoping the other will fill their void. Results: Crushing expectations, emotional manipulation, relational collapse under stress.

✅ **Biblical Design: 1 + 1 = One Flesh** — "You are my better whole" — Two complete persons entering covenantal union. Results: Realistic expectations, mutual strength, covenant capacity proven.

> "Therefore shall a man leave his father and his mother, and shall cleave unto his wife: and they shall be one flesh." — Genesis 2:24 (KJV)

### Notice the Order

- **Leave** — Separation, independence, self-governance
- **Cleave** — Commitment, fidelity, covenant bond
- **One Flesh** — Union of two complete persons

You cannot "cleave" if you've never "left." You cannot be "one flesh" if you're not first "one whole person."

---

## Daily Practice: The Foundation Stone

Formation happens through practice over time, not information downloaded in a weekend.

### Morning Practice (10 minutes)

**Declare Your Identity** — Write: "I was created teleios—whole, complete, perfect in God's image. I am justified in Christ. I am complete in Him. Today I practice FROM that perfection."

**Identify ONE Weakness** — What's your recurring struggle? Anger? Lust? Fear? Conflict avoidance?

**Set a Replacement Intention** — Instead of [weakness], I will [opposite strength] when [trigger occurs].

### Evening Practice (15 minutes)

**Review Your Day** — Where did I practice FROM perfection? Where did I forget my identity?

**Record One Failure + One Success** — Be honest and specific. No shame, just data.

**Plan Tomorrow's Replacement** — What will I do differently? What's my trigger? My new response?

Commit to 7 consecutive days. Formation requires consistency, not perfection.

---

## Reflection Questions

1. How do I currently define "being ready for marriage"? Is my definition based on feelings or capacities?

2. Which of the 5 faculties is my weakest area? What specific evidence from my life supports this assessment?

3. What ONE practice will I execute daily for 7 consecutive days? Why did I choose this one?

4. React to this statement: "Your spouse is not your better half; they are your better whole." Agree? Disagree? Why?

5. Who will I share my 5 Faculties Assessment with for honest feedback? When?

---

## Week 1 Key Takeaway

> "Marriage doesn't complete you. It reveals whether you're complete."

The question is not: "Will my spouse make me whole?"
The question is: "Am I practicing FROM the wholeness Christ has already secured?"

You were created perfect (Genesis 1:26-28). You have been justified in Christ (Romans 3:24). You are complete in Him (Colossians 2:10). You practice holiness FROM that standing, not TO achieve it.

This is not self-help. This is not positive thinking. This is theology—the truth of who you are in Christ.`
  },

  // ── PART 5 ────────────────────────────────────────────────────
  {
    id: 'part-5',
    order: 5,
    track: 'advocacy',
    title: 'The Marriage Foundation Access Mission',
    estimatedMinutes: 25,
    content: `# The Marriage Foundation Access Mission

## The Central Truth

Marriage literacy is not a luxury — it is a human right. Your role as an advocate is to deploy access to marriage foundation education across Cameroon and beyond.

You are not selling a product. You are facilitating access to foundational knowledge that transforms relationships, families, and communities.

## Week Overview

**Core Question:** What does it mean to be a Marriage Foundation Access Ambassador?

**Key Insight:** Advocacy is not convincing people to buy — it's removing barriers to life-changing education.

## Learning Outcomes

By the end of this week, you will:

- Understand the Marriage Foundation Access mission and vision
- Define your role as an advocate (not a salesperson)
- Learn the three deployment models: Personal, Sponsored, Community
- Identify your first 10 potential beneficiaries
- Practice your first advocacy conversation

---

## What Is Marriage Foundation Access?

Marriage Foundation Access is the democratization of marriage literacy.

For too long, covenant-grade marriage education has been:

- **Expensive** — accessible only to the wealthy
- **Western-centric** — ignoring African contexts
- **Church-exclusive** — missing those outside religious communities
- **Theory-heavy** — disconnected from daily life

Marriage Foundation Access changes this through:

- **Affordability:** Books, courses, and schools priced for African incomes
- **Contextualization:** Content rooted in African realities while maintaining biblical foundations
- **Accessibility:** Multiple pathways — free, sponsored, community-based
- **Practicality:** Tools, not just theory

## The Problem You're Solving

Without marriage literacy, relationships suffer predictable patterns:

- Chronic conflict without repair skills
- Intimacy erosion without sexual literacy
- Financial chaos without covenant economics
- Parenting confusion without design principles
- Divorce as default when difficulty arrives

These are not character failures — they are education gaps. Your role as an advocate is to close those gaps through deployment.

---

## Understanding Your Role as Advocate

### What You Are

An advocate is:

- A **guide** to resources, not a guru with all answers
- A **facilitator** of access, not a salesperson pushing products
- A **connector** between need and solution
- A **witness** to transformation, sharing what you've experienced

### What You Are NOT

An advocate is NOT:

- A marriage counselor (you're not licensed to counsel)
- A profit-maximizer (your motive is access, not just income)
- A manipulator (using people's pain to make sales)
- A lone ranger (you're part of a deployment network)

### The Advocate's Code

I commit to:

- **Truth-telling:** I will never exaggerate or promise what resources cannot deliver
- **Empathy-first:** I will listen before I recommend
- **Access-focus:** I will prioritize getting resources into hands, not just making sales
- **Community-building:** I will connect people to each other, not just to products
- **Continuous learning:** I will study the resources I deploy so I can guide wisely`
  },

  // ── PART 6 ────────────────────────────────────────────────────
  {
    id: 'part-6',
    order: 6,
    track: 'advocacy',
    title: 'The Three Deployment Models',
    estimatedMinutes: 20,
    content: `# The Three Deployment Models

## Model 1: Personal Access (Direct Purchase)

**What it is:** Individuals purchase books, courses, or schools directly using your ambassador link.

**When to use:** When the person has financial capacity and sees the value.

**Your role:**
- Share your testimony
- Explain the resource
- Provide your link
- Follow up after purchase

**Example:** "I read Sex By Design and it transformed how I understand intimacy. Here's my link if you want to grab a copy — I'd love to discuss it with you after you read it."

---

## Model 2: Sponsored Access (Gift Deployment)

**What it is:** Someone with resources sponsors books/courses for those who cannot afford them.

**When to use:** When you identify high-need individuals or couples but they lack funds.

**Your role:**
- Identify beneficiaries
- Connect sponsors with needs
- Facilitate the gift process
- Follow up to ensure completion

**Example:** "I know a couple preparing for marriage but they can't afford the Foundation School. Would you be willing to sponsor their enrollment? It's 120,000 FCFA total."

---

## Model 3: Community Access (Group Deployment)

**What it is:** Churches, NGOs, community centers, or workplaces host group studies using Marriage Education resources.

**When to use:** When you can gather 10+ people for collective learning.

**Your role:**
- Pitch the idea to leaders (pastors, directors, managers)
- Facilitate bulk orders or digital access
- Coordinate group rhythm (weekly meetings, discussions)
- Track completion and impact

**Example:** "Pastor, what if we ran a 6-week marriage preparation series using the Foundation School curriculum? I can facilitate it, and the church just needs to cover the books."

---

## Choosing Your Model

The right model depends on the person and context:

| Situation | Best Model |
|---|---|
| Person has income, sees value | Personal Access |
| High need, no funds | Sponsored Access |
| Group setting (church, NGO) | Community Access |
| Reach is wide (social media) | Personal Access at scale |
| Corporate environment | Community Access |

You don't have to choose just one model. Elite advocates deploy all three simultaneously.`
  },

  // ── PART 7 ────────────────────────────────────────────────────
  {
    id: 'part-7',
    order: 7,
    track: 'advocacy',
    title: 'Deployment Psychology',
    estimatedMinutes: 30,
    content: `# Deployment Psychology

## The Protection, Relief, Hope Model

Every person you meet is in one of three psychological states:

---

## 1. Protection Mode (Fear-Based)

**What it looks like:**
- Defensive posture
- "I don't need help"
- Skepticism about resources
- Past wounds creating barriers

**Your approach:**
- Listen first, don't pitch
- Validate their caution
- Share your own vulnerability
- Offer low-risk entry points (free resources first)

**Example:** "I totally understand being cautious. I was skeptical too. Can I just share one thing that helped me? No pressure to buy anything."

---

## 2. Relief Mode (Problem-Aware)

**What it looks like:**
- "We're struggling and need help"
- Open to solutions
- Actively searching
- Willing to invest (time, money, effort)

**Your approach:**
- Name their pain accurately
- Show how the resource addresses it
- Provide clear next steps
- Offer to journey with them

**Example:** "It sounds like communication is breaking down. That's exactly what Communication Fidelity addresses — here's how it worked for us."

---

## 3. Hope Mode (Vision-Driven)

**What it looks like:**
- "We want to be great, not just survive"
- Proactive, not reactive
- Investing in growth before crisis
- Building for the future

**Your approach:**
- Cast vision
- Show the path from good to great
- Invite them into deeper resources (schools, advanced courses)
- Connect them to community

**Example:** "You're already doing well — imagine what's possible if you complete the Teleios School. Let's build toward mastery, not just survival."

---

## Your First 10 Beneficiaries

Think through your existing networks:

**Personal Relationships:**
- Family members preparing for marriage
- Friends experiencing relationship challenges
- Colleagues navigating marriage

**Community Connections:**
- Church members
- Neighbors
- Social media followers

**High-Impact Targets:**
- Pastors (they can deploy to entire congregations)
- School teachers (they interact with families)
- Community leaders (they have influence)

### Exercise: Map Your First 10

Create a list with these columns:

| Name | Relationship | Need/Stage | Deployment Model | Next Step |
|---|---|---|---|---|
| John & Mary | Church friends | Pre-marriage (Hope) | Personal Access | Share Foundation School link |
| Pastor David | Church leader | Congregation need (Relief) | Community Access | Pitch group study idea |

Fill in 10 names from your real network.`
  },

  // ── PART 8 ────────────────────────────────────────────────────
  {
    id: 'part-8',
    order: 8,
    track: 'advocacy',
    title: 'Your First Advocacy Conversation',
    estimatedMinutes: 30,
    content: `# Your First Advocacy Conversation

## The Conversation Framework

### Step 1: Listen (80% of time)
- Ask open questions
- Let them talk about their journey
- Identify their psychological state (Protection/Relief/Hope)

### Step 2: Validate (Empathy First)
- "That sounds really hard"
- "I hear you"
- "I've been there too"

### Step 3: Witness (Your Story)
- Share what YOU experienced with the resource
- Be specific: "Before I read SBD, I..." "After, I..."
- Stay humble: "I'm still learning, but this helped"

### Step 4: Invite (Clear Next Step)
- "Would you like me to send you the link?"
- "Can I gift you this book?"
- "What if we read it together and discuss?"

### Step 5: Follow Up (Stay Connected)
- "I'll check in next week to see how it's going"
- "Let me know if you have questions"
- "I'm here to walk with you"

---

## Practice Script

**Scenario:** A friend mentions struggling in their marriage.

**YOU:** "Tell me more — what's the hardest part right now?" *(Listen)*

**FRIEND:** "We just can't communicate. Every conversation becomes a fight."

**YOU:** "That sounds exhausting. I've been there. We used to fight over everything. I read this book called Communication Fidelity and it totally changed how we talk. It's practical — not theory. Would you be open to checking it out?" *(Validate + Witness + Invite)*

**FRIEND:** "Maybe. How much is it?"

**YOU:** "1,500 FCFA — less than a meal out. And honestly, if money's tight right now, I'd be happy to gift it to you. This stuff is too important." *(Access-focus)*

**FRIEND:** "Okay, let's try it."

**YOU:** "Great! I'll send you the link. Let's grab coffee in two weeks and you can tell me what stood out. Deal?" *(Follow up)*

---

## Overcoming Common Fears

**Fear #1: "I'm Not Qualified"**
Truth: You're not a counselor. You're a guide. You don't need all the answers — you just need to connect people to resources that do.
Reframe: "I don't have to be perfect to share what helped me."

**Fear #2: "What If They Say No?"**
Truth: Rejection is not failure. Some people aren't ready. Your job is to offer access, not force it.
Reframe: "No today doesn't mean no forever. I plant seeds."

**Fear #3: "I'll Look Like I'm Just Trying to Make Money"**
Truth: If your motive is access (not just income), it will show. Lead with empathy, not sales pressure.
Reframe: "I'm facilitating access to life-changing education. That's noble work."

**Fear #4: "What If the Resource Doesn't Help Them?"**
Truth: No single resource fixes everything. But it's better than nothing. You're giving them tools — they choose how to use them.
Reframe: "I'm offering a tool, not a magic pill. The work is still theirs."

---

## Daily Advocacy Practice

### Morning (10 minutes)
- **Pray for your list** — Pray for your 10 beneficiaries by name
- **Review your role** — Read the Advocate's Code; recommit to empathy-first deployment
- **Plan one conversation** — Who will you reach out to today?

### Evening (15 minutes)
- **Reflect on conversations** — What went well? What would you do differently?
- **Update your list** — Track progress on your 10 beneficiaries
- **Learn from resources** — Read 10 pages from one Marriage Education resource

---

## Reflection Questions

1. How do I currently view my role as advocate — salesperson or guide? What needs to shift?

2. Which deployment model (Personal, Sponsored, Community) feels most natural to me? Why?

3. What fears do I have about advocacy? Which reframe helps most?

4. Of my first 10 beneficiaries, who is most ready (Hope mode)? Who needs the most care (Protection mode)?

5. What one resource will I study deeply this week to better guide others?

---

## Week 1 Key Takeaway

> "Advocacy is not convincing people to buy — it's removing barriers to life-changing education."

The question is not: "How do I sell more?"
The question is: "How do I facilitate access for those who need it most?"

You are a guide, not a guru. A facilitator, not a salesperson. A witness to transformation.`
  }

];

// ─────────────────────────────────────────────────────────────────

async function seedParts() {
  console.log('Seeding 8 parts into teleios-week-1...\n');

  // Verify the document exists
  const ref = db.collection('modules').doc('teleios-week-1');
  const existing = await ref.get();
  if (!existing.exists) {
    console.error('❌ modules/teleios-week-1 not found — run seed-teleios-modules.js first');
    process.exit(1);
  }

  console.log('Existing doc found. Adding parts array (set merge)...\n');

  // Validate parts
  PARTS.forEach((p, i) => {
    console.log(`  Part ${p.order}: ${p.title} [${p.track}] — ${p.estimatedMinutes} min`);
  });

  await ref.set({
    parts:     PARTS,
    hasParts:  true,
    partCount: PARTS.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  console.log(`\n✅ teleios-week-1: ${PARTS.length} parts seeded successfully`);
  console.log('   Teleios track: Parts 1–4');
  console.log('   Advocacy track: Parts 5–8');
  console.log('\n   Week 1 = free access (all 8 parts)');
  console.log('   Weeks 2–6 = foundation (unchanged)');
}

seedParts()
  .then(() => process.exit(0))
  .catch(err => { console.error('❌ ERROR:', err); process.exit(1); });
