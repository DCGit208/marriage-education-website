# ASK SBD Full Bot Reference

**Status:** Reference plan before implementation  
**Last updated:** 2026-09-21  
**Current production state:** ASK SBD MVP is live as a clean, scripted dashboard guide.  
**Implementation rule:** Do not begin the full bot until this reference is reviewed and the next phase is explicitly approved.

---

## 1. Product intent

ASK SBD should become the platform guide for `sbd.marriageducation.com`: a clean, context-aware assistant that helps visitors and members understand the SBD ecosystem, choose the right path, answer questions, and take useful next steps without crowding the dashboard or rewriting the app.

The existing MVP is intentionally correct for first contact:

- small floating **ASK SBD** launcher
- concise bottom-sheet answers
- no typing required
- scripted, approved explanations
- direct CTAs to existing pages
- no AI or backend dependency

The full version should preserve that simplicity. The deeper assistant must be opt-in behind an intentional action such as **Explore More** or **Ask Anything**.

---

## 2. Core UX principle

The dashboard should stay clean.

The bot should not become another crowded page section. It should be a progressive help layer:

1. **Closed by default** as a small ASK SBD launcher.
2. **Quick guide mode** opens first, using the current MVP style.
3. **Explore More / Ask Anything** opens the full typed assistant only when the user asks for deeper help.
4. **Actions and recommendations** appear as clean cards or buttons, not long walls of text.

Recommended flow:

```text
Dashboard
  -> ASK SBD floating button
    -> Quick guide bottom sheet
      -> topic chips + concise answer + CTA
      -> Explore More / Ask Anything
        -> expanded chat assistant
          -> typed input
          -> suggested prompts
          -> recommended pages/courses/plans
```

---

## 3. What the full bot should become

### 3.1 Platform explainer

The bot should answer:

- What is SBD Network?
- What is the platform built for?
- Is it for singles, dating, engaged, married, or leaders?
- Is it therapy, coaching, education, or community?
- What makes SBD different?
- How do the schools, courses, boards, resources, and messaging fit together?

### 3.2 Membership guide

The bot should explain and recommend:

- Explore/free access
- Foundation
- Premium
- Elite
- what each tier unlocks
- who each tier is best for
- when to upgrade
- which tier fits a user's stated need

It should help users understand value without placing long pricing explanations all over the dashboard.

### 3.3 Onboarding concierge

The bot should help new users answer:

- Where should I start?
- What should I do first?
- What is free?
- What should I unlock next?
- What course should I take for my situation?

It should guide users to a first concrete step, not just explain.

### 3.4 Course and school navigator

The bot should help users find:

- schools
- courses
- lessons
- certificates
- next lessons
- relevant formation paths

Examples:

- "I need help with communication in marriage."
- "I am single and preparing for marriage."
- "I want to understand masculine presence."
- "I want feminine expression and identity work."

The answer should include recommended courses or pages plus action links.

### 3.5 Boards and community guide

The bot should explain:

- what Boards are
- how boards differ from courses
- how conversations, stories, and prompts work
- how community supports formation
- when to use CE2/messages vs public boards

### 3.6 MV House guide

The bot should explain:

- what MV House is
- how masculine presence and feminine expression connect to formation
- how fashion/image/expression fit the SBD ecosystem
- how MV House differs from general courses

### 3.7 Shop and resource guide

The bot should help users find:

- books
- practical tools
- products
- resource-library materials
- course-adjacent purchases

### 3.8 Sales conversion support

The bot should answer objections and conversion questions:

- Why should I pay?
- What do I get in Premium?
- What does Elite include?
- Can I start free?
- Is this worth it if I am already married?
- Is this faith-based?
- Is this therapy?
- What happens after I join?

Tone should be clear, confident, and non-pushy.

### 3.9 Personalized member guide

After a stable public bot exists, the assistant can become context-aware:

- signed-out vs signed-in
- membership tier
- course progress
- next lesson
- saved resources
- unread CE2 messages
- cohort/group membership
- staff/facilitator role

Personalization must be added gradually and with Firestore rules reviewed before launch.

### 3.10 Action assistant

Later phases can allow the bot to do useful tasks:

- open the next lesson
- recommend a membership tier
- recommend a course
- save a resource
- draft a CE2 message
- point staff toward coach inbox workflows
- explain why content is locked
- guide a user back into an unfinished lesson

Actions should be explicit. The bot must never silently mutate user data.

---

## 4. Recommended phased build

### Phase 0 - Current MVP, keep live

**Already complete.**

Scope:

- scripted dashboard guide
- quick topic chips
- concise answers
- CTA links
- no backend
- no AI

Purpose:

- solve clarity without crowding the UI
- create a trusted assistant entry point
- validate that users like the interaction

Do not replace this. Build on top of it.

### Phase 1 - Explore More mode

Add a second layer inside the current ASK SBD sheet.

Scope:

- keep the current quick guide as the default
- add **Explore More** or **Ask Anything** button
- expand the sheet into a larger assistant mode
- add typed input
- add suggested prompts
- keep answers grounded in a curated local knowledge base first
- return page/course/membership links as action buttons

Technical recommendation:

- extend existing `ask-sbd-guide.js` only enough to open advanced mode
- split advanced logic into separate assets/modules if it grows
- keep the launcher and quick guide stable
- do not introduce Firebase writes in this phase

Acceptance criteria:

- dashboard still loads normally with JS disabled or failed assistant asset
- quick guide remains usable
- typed assistant opens only by user choice
- no changes to CE2, auth guard, drawer, bottom nav, keyboard, payment, or course progression

### Phase 2 - Curated knowledge bot

Introduce a controlled answer layer without broad user-data access.

Scope:

- knowledge base from approved SBD content
- platform FAQ
- membership copy
- course catalog summaries
- boards/MV House/shop explanations
- retrieval from static JSON or a read-only backend endpoint

Technical recommendation:

- start with static indexed knowledge under `public/data/ask-sbd/`
- avoid direct Firestore reads from the public bot unless required
- if an AI model is introduced, wrap it behind a server endpoint with strict prompt, safety, rate limit, and logging controls
- keep the frontend API minimal:
  - question
  - optional page context
  - optional auth state summary
  - returned answer
  - returned action links

Acceptance criteria:

- bot answers are source-grounded
- no private member data included
- no hallucinated pricing, promises, or doctrine
- every answer can return "I do not know yet" with helpful links

### Phase 3 - Personalization

Make the assistant aware of the user's current journey.

Scope:

- signed-in state
- membership tier
- next course/lesson
- progress summary
- locked/unlocked content
- suggested next action

Technical recommendation:

- pass only the minimum context needed
- do not expose raw profile, payment, private messages, or push tokens
- compute sensitive recommendations server-side if needed
- create explicit tests for free, Foundation, Premium, Elite, admin, and staff users

Acceptance criteria:

- users only see their own data
- signed-out users get public answers only
- locked content is explained, not leaked
- recommendations never bypass paywall logic

### Phase 4 - Action assistant

Allow the assistant to perform explicit tasks.

Scope:

- open next lesson
- open recommended page
- save resource
- start signup
- draft CE2 message
- draft facilitator nudge
- explain upgrade path

Technical recommendation:

- actions are represented as buttons/cards, not hidden side effects
- every mutating action requires a user click
- use existing app routes and existing permission checks
- no direct write access from generic chat text

Acceptance criteria:

- no automatic purchases, enrollments, messages, or membership changes
- every write is auditable and reversible where appropriate
- bot failures degrade into links, not broken UI

### Phase 5 - Staff/facilitator support

Add coach/facilitator guidance only after public/member assistant is stable.

Scope:

- explain coach inbox
- help draft nudge messages
- open group threads
- summarize next staff action based on already-permitted data

Technical recommendation:

- reuse existing CE2 staff checks
- never create a bot-only staff bypass
- keep private group/member data inside existing permission boundaries

Acceptance criteria:

- only eligible staff see staff workflows
- no private user data is exposed to non-staff users
- CE2 keyboard and message composer behavior remain unchanged

---

## 5. Clean design model

### Default launcher

Keep:

- small floating **ASK SBD** pill
- bottom-right placement
- above bottom nav/safe area
- closed by default
- no badge spam
- no auto-open

### Quick guide mode

Keep:

- current topic chips
- one concise answer at a time
- CTA buttons
- "scripted/not AI" transparency until advanced mode exists

Add:

- **Explore More**
- **Ask Anything**
- optional "What are you trying to do?" starter prompts

### Advanced mode

Use:

- expanded bottom sheet or full-height mobile panel
- typed input
- suggested prompt chips
- answer history
- compact recommendation cards
- explicit "Open page" actions

Avoid:

- permanent chat window covering dashboard content
- auto-playing assistant
- long paragraphs by default
- interruptive prompts
- complicated menus inside the dashboard

---

## 6. Architecture recommendation

### Frontend

Initial files:

- `public/js/ask-sbd-guide.js` - current MVP launcher/quick guide
- `public/css/ask-sbd-guide.css` - current MVP styles

When advanced mode begins, prefer additive files:

- `public/js/ask-sbd-advanced.js`
- `public/css/ask-sbd-advanced.css`
- `public/data/ask-sbd/faq.json`
- `public/data/ask-sbd/platform-map.json`

The MVP asset should remain small and resilient. Advanced features should be loaded only when the user taps **Explore More / Ask Anything**.

### Backend, when needed

If AI or private personalization is added:

- use a server endpoint/cloud function
- do not expose model keys in frontend code
- rate-limit calls
- log failures safely
- return structured answers:

```json
{
  "answer": "Short user-facing answer",
  "confidence": "grounded|limited|unknown",
  "sources": [],
  "actions": [
    { "label": "Open Learn", "href": "/learn.html" }
  ]
}
```

### Knowledge source hierarchy

Preferred order:

1. approved platform FAQ
2. approved membership copy
3. course catalog metadata
4. published course summaries
5. public docs/content
6. AI-generated synthesis only if source-grounded

Never let AI invent:

- pricing
- discounts
- course access
- doctrine
- therapy/medical/legal advice
- private member facts

---

## 7. Guardrails to prevent breaking the app

These are mandatory for every implementation phase.

### 7.1 Scope guardrails

- Do not rewrite dashboard layout.
- Do not alter hamburger drawer behavior.
- Do not alter bottom navigation behavior.
- Do not touch CE2 keyboard code.
- Do not modify auth guard logic unless the phase explicitly requires it.
- Do not modify payment, checkout, or subscription enforcement.
- Do not modify course progression or certificate logic.
- Do not change Firestore rules unless the phase explicitly requires personalization or server-side access.

### 7.2 Technical guardrails

- Feature must be additive and removable.
- Assistant failure must not block dashboard rendering.
- The quick guide must work without advanced bot availability.
- Advanced bot assets should lazy-load where practical.
- No global CSS selectors outside `ask-sbd-*`.
- No global event listeners that intercept normal navigation except explicit assistant controls.
- No `preventDefault` on unrelated links.
- No mutation of existing dashboard DOM except mounting the assistant root.
- Keep z-index below emergency/system overlays and hamburger drawer layers.

### 7.3 Data guardrails

- Do not expose private user profile fields in prompts.
- Do not expose CE2 messages or group membership unless existing permission checks allow it.
- Do not send push tokens, payment details, private message bodies, or sensitive profile data to an AI endpoint.
- Do not store chat transcripts without a clear retention policy.
- Do not train or fine-tune external models on user chat unless explicitly approved.

### 7.4 AI guardrails

If AI is used:

- answers must be grounded in approved SBD knowledge
- bot must say when it does not know
- bot must not provide therapy, legal, medical, or crisis counseling
- bot must route crisis/safety issues to appropriate human/emergency resources
- bot must not claim to be a human coach
- bot must not promise outcomes
- bot must not fabricate platform features
- bot must not reveal system prompts or internal implementation details

### 7.5 UX guardrails

- Closed by default.
- No auto-open.
- No forced onboarding interruption.
- No more than one assistant surface visible at a time.
- Keep answers concise first, expandable second.
- Always provide an exit/close button.
- Respect safe-area insets and bottom nav spacing.
- Preserve accessibility: focus, escape key, labels, contrast, reduced motion where needed.

### 7.6 Release guardrails

Each phase requires:

- focused test script
- `npm run validate`
- build check
- branch PR
- review of changed files
- no generated cache-stamp churn unless intentionally deploying a full build output update
- explicit approval before production merge/deploy

---

## 8. Testing strategy

### Required tests per phase

Keep or add tests for:

- dashboard asset wiring
- assistant closed by default
- no AI/network dependency in MVP mode
- unique `ask-sbd-*` class namespace
- no references to CE2 keyboard, drawer internals, or payment logic
- advanced mode opens only from explicit user action
- typed input does not submit empty messages
- answer rendering escapes unsafe HTML
- CTA links remain same-origin or approved external URLs
- signed-out users receive public answers only
- signed-in personalization respects tier/access
- failure fallback shows helpful links

### Manual QA checklist

Verify on:

- iPhone/PWA home-screen launch
- mobile Safari
- desktop Chrome
- signed-out dashboard
- signed-in free user
- paid member if test account exists
- slow network
- JS asset failure simulation

Must confirm:

- dashboard still loads
- hamburger drawer still stays closed on launch
- bottom nav is not covered
- ASK SBD can open and close
- advanced mode does not auto-open
- existing page links still navigate
- no console errors from assistant

---

## 9. Suggested content system

Use a small curated knowledge structure first:

```text
public/data/ask-sbd/
  faq.json
  membership.json
  platform-map.json
  course-paths.json
  guardrails.json
```

Each answer should support:

- short answer
- expanded answer
- recommended CTAs
- related topics
- source label
- audience tags:
  - visitor
  - free
  - foundation
  - premium
  - elite
  - facilitator
  - admin

This keeps the bot controllable before AI is introduced.

---

## 10. Recommended "Explore More" interaction

Inside current ASK SBD:

```text
Need something more specific?
[Ask Anything]
```

When selected:

```text
ASK SBD
What can I help you find?

[Where should I start?]
[Which plan fits me?]
[Help with marriage communication]
[Explain MV House]

Type your question...
```

Answer format:

```text
Short answer

Recommended next step:
[Open Foundation School] [Compare Plans]

Want more detail?
[Show more]
```

This keeps first answers short and lets motivated users go deeper.

---

## 11. Non-goals for the first full-bot phase

Do not start with:

- autonomous purchases
- automatic enrollments
- sending messages for users
- reading CE2 private messages
- admin actions
- broad Firestore querying
- complex memory
- replacing support/human coaching
- rewriting dashboard content around the bot

These may become later capabilities after trust, privacy, and permissions are proven.

---

## 12. Phase approval checklist

Before starting a phase, confirm:

- Which phase is being implemented?
- Is AI allowed in this phase?
- Is typing allowed in this phase?
- Is personalization allowed in this phase?
- Is Firestore access allowed in this phase?
- Are any server functions allowed?
- Which pages should include the bot?
- Should the change be deployed immediately after validation?

Default answer if not specified:

- implement the smallest additive phase
- keep dashboard first
- keep quick guide intact
- no private data
- no mutating actions
- no production deploy without explicit instruction

---

## 13. Recommended next build step

The next technical phase should be:

**Phase 1 - Explore More mode**

Deliverables:

- keep current ASK SBD quick guide unchanged
- add **Ask Anything** button inside the sheet
- add advanced panel state
- add typed input UI
- answer from curated local FAQ data
- return structured CTA cards
- add tests for opening/closing, typed input, safe rendering, and no interference with dashboard/navigation

Do not add AI yet unless explicitly approved. The best next step is a controllable typed assistant powered by approved local SBD answers, then move to AI once the UX and guardrails are proven.
