# SBD Academy — Learning System Reference
> **Canonical reference for all tier access, course structure, and school architecture.**
> Version: April 2026 | Maintained by: Dr. Coach Achu Gustave

---

## THE SUBSCRIPTION MODEL

- All access above Free requires an **active subscription**
- Weekly content within any unlocked course requires an **active subscription** — if it lapses, the week is inaccessible
- **Grace period:** Courses already started are preserved for **1 month** after a subscription lapses
- **After 1 month:** Progress is lost; user returns to Free access
- Progressive unlock: as long as subscription continues, the **next course in the school sequence** becomes accessible
- Admin role (`role: 'admin'` in Firestore) always grants Elite access regardless of subscription

---

## THE FOUR TIERS

### 🌱 Free — $0
- **Teleios Blueprint** — Week 1 only (live from Firestore: `teleios-week-1`)
- Free resource library (`/resources`)
- Community read access (boards, no posting)

---

### 🏗 Foundation — $9 / month
Courses included (subscription-dependent weekly access):

| Course | Duration | Source |
|--------|----------|--------|
| **The Teleios Blueprint: Full Human Maturity** | 6 weeks | School 1, Course 1 |
| **Sex By Design For Dummies: The Complete Marriage Handbook for Human Flourishing** | 13 weeks | SBD Flagship Ebook (not from a school) |

- **Progressive unlock:** while subscription is active, next course in School 1 sequence unlocks
- **Certificate:** Foundation School Certificate (on completion of Teleios Blueprint)
- **SBD For Dummies Certificate:** Certificate of Completion in Sexual Literacy & Covenant Marriage (85% min average, all modules passed, 104+ hours)
- Community boards: Foundation-tier boards accessible

---

### ⚡ Premium — $20 / month
Full access to **School 1 and School 2** only:

| School | Courses | Focus |
|--------|---------|-------|
| 🟦 School 1 — Teleios School of Personal Development | 13 courses | Identity, maturity, wholeness, anthropology |
| 🟩 School 2 — Sexual Literacy & Conjugal Mastery School | 15 courses | Sexuality as lifestyle, nakedness stewardship, conjugal mastery |

- **Schools 3 and 4 NOT included** — Elite only
- All School 1 + 2 certificates
- Standard community boards (all of them)
- **No MV House access**

---

### 👑 Elite — $50 / month
Full access to **all four schools** — all 44 courses:

| School | Courses |
|--------|---------|
| 🟦 School 1 | 13 |
| 🟩 School 2 | 15 |
| 🟧 School 3 | 8 |
| 🟫 School 4 | 8 |
| **Total** | **44** |

Additional Elite-only features:
- **MV House™ expression system** (full access)
- **Advanced Muliebrity Training School** — all boards
- **Advanced Virility boards** — all boards
- **Mastery Certification**
- Direct access — Dr. Coach Achu

---

## THE FOUR SCHOOLS OF SBD ACADEMY

### 🟦 School 1 — The Teleios School of Personal Development
> The human development arm: identity, maturity, wholeness, anthropology.
> Build the personal foundation required for covenant faithfulness.

- **Firestore ID:** `school-1-teleios`
- **Programs:** 13 | **Portfolio Value:** $2,843
- **Tier unlock:** Foundation (progressive) / Premium (full)
- **Certificate:** Foundational Certificate

| # | Course | Weeks | Price |
|---|--------|-------|-------|
| 1 | The Teleios Blueprint: Full Human Maturity | 6 | $247 |
| 2 | The Anthropology of Wholeness | 4 | $149 |
| 3 | Identity Mastery | 4 | $149 |
| 4 | The Four Faculties Training | 5 | $199 |
| 5 | Anthropocentric Development | 3 | $129 |
| 6 | The Personal Development MasterClass | 12 | $697 |
| 7 | The Science of Self-Command | 5 | $199 |
| 8 | The Heart of Relationship (Level 1) | 4 | $149 |
| 9 | Relationship Relatednesses (Level 2) | 6 | $199 |
| 10 | Relationship Mastery Intensive (Level 3) | 8 | $349 |
| 11 | The Perfect Self Program | 4 | $149 |
| 12 | Emotional Literacy for Couples & Singles | 4 | $129 |
| 13 | Temperament Intelligence for Marriage | 3 | $99 |

---

### 🟩 School 2 — Sexual Literacy & Conjugal Mastery School
> The flagship school. Learn sexuality as lifestyle, not sex acts.
> Master nakedness stewardship, seduction, arousal, and conjugal imagination as covenantal discipline.

- **Firestore ID:** `school-2-sexual-literacy`
- **Programs:** 15 | **Portfolio Value:** $4,306
- **Tier unlock:** Premium (full)
- **Prerequisite:** Must start School 1 first
- **Certificate:** Sexual Literacy Certificate

| # | Course | Weeks | Price | Note |
|---|--------|-------|-------|------|
| 1 | Sexual Literacy 101 | 1.5 hrs | $25 | Best beginner value |
| 2 | Art of Sexuality | 8 | $397 | 🔥 Top Seller |
| 3 | Art of Seduction | 6 | $347 | |
| 4 | Art of Nakedness | 5 | $199 | |
| 5 | Sex = Marriage: The Only Equation That Works | 8 | $350 | |
| 6 | Sexual Imagination Course | 6 | $249 | |
| 7 | Conjugal Intelligence MasterClass | 12 | $897 | 🏆 Flagship |
| 8–15 | *(8 further programs)* | | | |

---

### 🟧 School 3 — The Marriage Systems & Fidelity School
> Master marriage as a system, not a feeling.
> Covenant governance, household management, conflict resolution, and the daily liturgies that sustain one-flesh unity.

- **Firestore ID:** `school-3-marriage-systems`
- **Programs:** 8 | **Portfolio Value:** $1,900
- **Tier unlock:** Elite
- **Prerequisite:** Must complete SBD For Dummies course
- **Certificate:** Marriage Systems Certificate

| # | Course | Weeks | Price |
|---|--------|-------|-------|
| 1 | Marriage System Design | 6 | $297 |
| 2 | Covenant Governance | 6 | $249 |
| 3 | Fidelity Curriculum | 8 | $349 |
| 4 | Communication for Covenant Couples | 5 | $199 |
| 5 | Conflict Mastery | 4 | $179 |
| 6 | Household Management | 5 | $199 |
| 7 | Daily Liturgies of Marriage | 4 | $149 |
| 8 | One-Flesh Intensive | 6 | $279 |

---

### 🟫 School 4 — The Civilization & Family Leadership School
> Understand your marriage as civilizational infrastructure.
> How covenant families create stable nations, raise teleios children, and build generational legacy.

- **Firestore ID:** `school-4-civilization-leadership`
- **Programs:** 8 | **Portfolio Value:** $2,450
- **Tier unlock:** Elite
- **Prerequisite:** Must complete School 3
- **Certificate:** Civilization Leadership Certificate

| # | Course | Weeks | Price |
|---|--------|-------|-------|
| 1 | Marriage Builds Nations | 8 | $299 |
| 2 | Political Theology of Home | 6 | $249 |
| 3 | Family Systems Architecture | 6 | $279 |
| 4 | Parenting Through Teleios Principles | 8 | $299 |
| 5 | Raising Sons & Daughters Through Sexual Literacy | 6 | $249 |
| 6 | Family Culture & Human Flourishing | 5 | $199 |
| 7 | Civilizational Intelligence Masterclass | 10 | $697 |
| 8 | Human Rights & Marriage (UDHR 16) | 4 | $179 |

---

## THE FLAGSHIP STANDALONE COURSE

### Sex By Design For Dummies: The Complete Marriage Handbook for Human Flourishing
> **NOT from a school. Standalone. Derived from the SBD flagship ebook.**
> Included in: **Foundation tier and above.**

- **Firestore ID:** `sex-by-design-for-dummies`
- **Duration:** 13 weeks (1 intro + 12 chapters)
- **Price:** $397 (à la carte)
- **Instructor:** Dr. Coach Achu Gustave
- **Level:** Foundational to Advanced
- **Certificate:** Certificate of Completion in Sexual Literacy & Covenant Marriage
  - Requires: all modules passed, 85% min average, all assignments submitted, 104+ hours

**Week-by-Week Structure:**

| Week | Title |
|------|-------|
| 1 | Modern Societal Eudaemonia — The Marriage Handbook for Human Flourishing |
| 2 | What About Sex? — Why Everyone Must Be Sexually Literate |
| 3 | Birthright and Design — The Anthropogenic Reality |
| 4 | The Sexual One and Only — The Anatomy (Epicure Originativeness) |
| 5 | Sex = Marriage — The Only Equation That Works |
| 6 | The Muliebrity Baron — The Secret Power Every Wife Carries |
| 7 | The Virility Baron — Authority Through Service and Manhood |
| 8 | Pics & Pearls — The Beauty of Nakedness vs. the Lies of Porn |
| 9 | Relationship Relatednesses — The Heart of Relationship |
| 10 | Marriage Builds Nations — UDHR 16 and the Future of Civilization |
| 11 | Practice From Perfection — Living Out Conjugal Fidelity |
| 12 | Pearls & Pathways — Readings, Programs, Next Steps |
| 13 | Epilogue & Civilization Curriculum — Your Covenant Mission |

---

## PORTFOLIO TOTALS

| School | Programs | Total Value |
|--------|----------|-------------|
| School 1 — Teleios | 13 | $2,843 |
| School 2 — Sexual Literacy | 15 | $4,306 |
| School 3 — Marriage Systems | 8 | $1,900 |
| School 4 — Civilization | 8 | $2,450 |
| **Total (44 programs)** | **44** | **$11,499** |

---

## TIER FEATURE MATRIX

| Feature | Free | Foundation | Premium | Elite |
|---------|:----:|:----------:|:-------:|:-----:|
| Price | $0 | $9/mo | $20/mo | $50/mo |
| Teleios Blueprint | Week 1 | ✅ Full | ✅ Full | ✅ Full |
| SBD For Dummies | ❌ | ✅ Full (13 wks) | ✅ Full | ✅ Full |
| School 1 (13 courses) | ❌ | Progressive unlock | ✅ Full | ✅ Full |
| School 2 (15 courses) | ❌ | ❌ | ✅ Full | ✅ Full |
| School 3 (8 courses) | ❌ | ❌ | ❌ | ✅ Full |
| School 4 (8 courses) | ❌ | ❌ | ❌ | ✅ Full |
| MV House | ❌ | ❌ | ❌ | ✅ |
| Elite Boards (AMTS + Virility) | ❌ | ❌ | ❌ | ✅ |
| Mastery Certification | ❌ | ❌ | ❌ | ✅ |
| Community Read | ✅ | ✅ | ✅ | ✅ |
| Certificates | ❌ | Foundation only | Schools 1+2 | All |
| Downloadable Resources | ❌ | ✅ | ✅ | ✅ |
| Grace Period (lapsed sub) | — | 1 month | 1 month | 1 month |

---

## TECH REFERENCE

| Item | Value |
|------|-------|
| Firebase Project | `marriage-education` |
| Hosting URL | `https://sbd-network.web.app` |
| Tier logic file | `/js/tier-access.js` |
| Learn hub file | `/js/learn-v2.js` |
| Course catalogue | `/public/courses-catalogue.json` |
| Firestore: users | `users/{uid}` → `subscription.tier`, `subscription.status`, `subscription.endDate`, `role` |
| Firestore: modules | `modules/teleios-week-1` (Free tier content) |
| Firestore: schools | `schools/{school-id}` |
| Firestore: courses | `courses/{courseId}` |
| Admin role | `role: 'admin'` → always Elite |
| Tier order | `free=0, foundation=1, premium=2, elite=3` |
