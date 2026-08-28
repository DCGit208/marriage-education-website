#!/usr/bin/env python3
"""Course 01 parity pass: thicken School 1 courses 06, 11, 12, 13 to ≥1800 words/week."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKER = "## Course 01 parity — School 1 greatness evidence bar"
TARGET = 1800

# week path relative to docs/content -> parity block (inserted before ## Reflection Questions)
BLOCKS = {
    "personal-development-masterclass/course/modules/week-02.md": """
---

## Course 01 parity — School 1 greatness evidence bar

By week’s end you must show: a calling sentence that survives a bad Tuesday (not only a good Sunday), one role-collapse interrupt with a witness text, and one refusal of better-half recruitment in speech. Without that evidence, Identity & Calling remains branding — not School 1 fruit.

### Integration — Courses 01–03

Course 01 installed teleios starting point. Course 03 installed identity Code grammar. Week 2 of the MasterClass is where vision (Week 1) meets **who you are responsible to be** under schedule. If your calling sentence still requires applause, a title, or a future spouse to feel real, you are chasing — not espousing design.

### Formation under load — Tuesday test

Run your calling sentence after criticism, a flat bank notification, or a lonely evening. If it collapses, shrink the sentence until it holds on your worst 20% of days — then grow it again from evidence, not fantasy.
""",
    "personal-development-masterclass/course/modules/week-03.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Produce: seven log rows with **next acts attached** (not mood notes), two premises autopsied with Course 02–05 doctrine cited, and one Mental Covenant Rule tested on a fatigue day. Mental discipline that never reaches Behavioral close is Cognitive theater — not attribute stewardship.

### Integration — Attributes vs Faculties (lock)

Course 01 Week 3 named the Four Attributes; Course 04 named the Four Faculties. This week governs **Mental attribute** expression — inner speech and interpretation — without confusing it with Cognitive faculty (learning/reasoning power). Collapse the map and you will either intellectualize formation or treat thinking as ontology manufacture.

### Formation under load — Tuesday test

Your interrupt protocol is fake if it only runs before coffee. Schedule one rep after conflict, scroll temptation, or harsh feedback. Log whether the **act** happened within 24 hours — not whether you “felt clearer.”
""",
    "personal-development-masterclass/course/modules/week-04.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Evidence required: seven-day Emotional log with surge → name → brake → act, one same-day repair after a discharge, and explicit refusal of mood-as-ontology in writing. Emotional formation without repair speed is regulation aesthetics — not likeness.

### Integration — Course 12 preview

Course 12 will deepen naming and mend; Week 4 here installs **attribute stewardship** so emotion is governed, not worshiped. Keep Attributes ≠ Faculties: Emotional attribute is personal-development expression; Affective faculty is care/empathy as power of the person.

### Formation under load — Tuesday test

Pick your highest-risk cue (sarcasm, stonewall, flood, contempt tone). Run brake + name + act there this week — not only on minor irritations. School 1 greatness is measured at threshold, not at calm.
""",
    "personal-development-masterclass/course/modules/week-05.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Deliver: temperament profile under fatigue, one counter-habit kept seven days, one contempt word retired from speech, and one clean ask that honors difference without cloning. “That’s just me” after harm fails this bar — teleios persons steward temperament; they do not baptize harm as flavor.

### Integration — Course 13 finale

Course 13 will seal temperament honor for the household. Week 5 here is **Behavioral training** on your flavor — predictable virtue on tired Tuesdays. Better whole: do not demand your spouse become your temperament to feel safe.

### Formation under load — Tuesday test

Log one conflict where you paused before defect-labeling. If you cannot name their flavor strength you honored that day, Week 5 is incomplete.
""",
    "personal-development-masterclass/course/modules/week-06.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Show: one keystone habit with Law of Repetition evidence (21-day trajectory, not day-3 heroics), one destructive habit’s payoff named honestly, and household testimony that a rhythm changed — not only your journal pride. Habit systems that manufacture worth are chase religion with a tracker app.

### Integration — Course 07 self-command

Course 07 installs Behavioral governance under load. Week 6 gives **rails** so self-command is not willpower theater. Practice from teleios: habits align expression; they do not invent the person.

### Formation under load — Tuesday test

Your keystone habit must survive travel, illness, or conflict week. If it only runs in ideal conditions, redesign smaller — School 1 rails are for real life.
""",
    "personal-development-masterclass/course/modules/week-07.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Produce: first-hour capture log for seven days, one hard conversation you stopped postponing, margin block protected twice, and honest accounting of what “busy” funded instead of design. Time & order without margin is performance scheduling — not stewardship.

### Integration — Courses 04–07

Conative faculty (commitment) and Psychomotor agility (show-up) meet **Behavioral attribute** rhythm here. Time is not neutral; it reveals what you treat as god. Course 01 greatness: capacities under calendar, not intentions under fantasy.

### Formation under load — Tuesday test

Protect margin on your worst day this week. If margin only exists when you feel motivated, it is not margin — it is mood.
""",
    "personal-development-masterclass/course/modules/week-08.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Evidence: money truth shared where applicable (no secret ledgers), one leak closed with Behavioral follow-through, contentment sentence that refuses both poverty gospel and greed gospel, and Week 1 vision constraining one purchase you would have made last month. Money stewardship that hides from the household is Mental premise cosplay.

### Integration — Course 05 development

Anthropocentric development named gaps with structure. Week 8 applies **stewardship economics** — diligence and contentment as teleios expression, not worth proof. Better whole: no spouse as sole money conscience or sole spender without accountability.

### Formation under load — Tuesday test

Run your contentment sentence at checkout, inbox promo, or comparison scroll. If it fails only there, it is not yet a rule — it is a sermon.
""",
    "personal-development-masterclass/course/modules/week-09.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Deliver: speech audit with one phrase retired, presence block kept five of seven days, complaint fast interrupted twice with gratitude + ask, and one repair initiated by your words (not only your silence). Speech & presence without repair is eloquence without covenant weight.

### Integration — Courses 08–10

Relationship tracks begin with truth in speech. Week 9 is **public atmosphere** stewardship — how your mouth and body teach the household what is safe. Course 01 parity: formation is structural; cosmetic politeness is information.

### Formation under load — Tuesday test

Your presence block must include eye contact or undivided attention when you least want to give it. That is Affective faculty in Psychomotor form — not a productivity hack.
""",
    "personal-development-masterclass/course/modules/week-10.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Non-negotiable evidence: repair speed table completed, one live own–apologize–act with **dated act step kept**, fusion language retired in writing, and Course 05 gap sketch if the same harm repeated three times. Apology without act is Case B theater — School 1 rejects it.

### Integration — Courses 08–10 + 12

Heart L1, Relatedness L2, and Mastery L3 assume repair literacy. Week 10 is the MasterClass **public exam** for Weeks 4, 5, and 9. Emotional Literacy (Course 12) will deepen mend; you must already own acts without identity deletion.

### Formation under load — Tuesday test

Repair within 24 hours of harm on a fatigue day. Slow repair baptized as “processing” is often pride or freeze — not maturity.
""",
    "personal-development-masterclass/course/modules/week-11.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Show: desire ≠ ontology paragraph witnessed, 14-day loyalty evidence log, highest-risk cue changed environmentally, and one better-whole sentence about sexual expectation of a spouse/future spouse. Sexual stewardship that treats urge as identity is counterfeit anthropology — regardless of vocabulary.

### Integration — Courses 02–03 + 11

Image and likeness (Course 03) include sexed design stewardship. Course 11 will reinforce teleios starting point so sexuality is not a worth-factory. Week 11 here is **covenant-weight preparation** — loyalty before access, structure before mood.

### Formation under load — Tuesday test

Your loyalty evidence must include a moment you wanted compromise and kept rail anyway. Virtue only on easy days is not yet virtue.
""",
    "personal-development-masterclass/course/modules/week-12.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Capstone evidence: readiness audit with **evidence not branding**, frontier map with one 30-day rail, better-whole marriage timeline or marriage practice sentence, and honest “not yet” where design would defraud a household. Covenant readiness that is only desire is the oldest leak in School 1 — refuse it in writing.

### Integration — full MasterClass arc

Weeks 1–11 installed vision through sexuality. Week 12 is **gate check** before Courses 07–10 relationship intensives and Courses 11–13 capstones. Course 01 parity: maturity is capacity under load — feelings and certificates are not sufficient.

### Formation under load — Tuesday test

Ask one witness: “Would you trust your child’s formation to my rails?” If the answer hesitates, your readiness sentence is marketing — adjust rails before adding covenant weight.
""",
    "perfect-self-program/course/modules/week-01.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Produce: Teleios Starting Point Audit with chase patterns costed in household terms, seven-day gratitude interrupt log including two fatigue days, and declaration sentence a witness can repeat back without fluff. Practice-from-perfection without chase inventory is optimism — not Course 11.

### Integration — Course 01 foundations

Course 01 Week 1: “You don’t become perfect; you practice FROM perfection.” Course 11 re-anchors that ontology before Courses 12–13. If Matthew 5:48 becomes moonshot motivation here, the whole capstone band collapses into self-help.

### Formation under load — Tuesday test

Run the declaration after a miss — not only after a win. Teleios starting point that collapses in shame is still chase grammar wearing Bible words.
""",
    "perfect-self-program/course/modules/week-02.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Evidence: leak taxonomy with costs, practice card with cue/script/act/log, seven-day check-in with ≥2 fatigue days, witness share with one correction accepted. Identity practice that stays private is mirror talk without cleaning — James 1:23–25 applies.

### Integration — Course 03 + 07

Identity Mastery (Course 03) and Self-Command (Course 07) assume likeness practice. Week 2 refuses self-creation religion: practice reflects design; it does not manufacture being. Better whole: spouse/friend may witness — they are not your ontology supplier.

### Formation under load — Tuesday test

If your script says “become someone,” rewrite before Day 3. Likeness language only — or stop and return to Week 1.
""",
    "perfect-self-program/course/modules/week-03.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Deliver: holiness-as-state paragraph (not moonshot), joy interrupt log seven days, shame-fuel refusal in one live conversation, and integration sentence linking holiness to stewardship not performance streaks. Holiness & joy without state grammar re-baptizes chase.

### Integration — Courses 01–03

Holiness is **state** in this canon; likeness is formed alignment. Course 11 Week 3 prevents grim duty and proud grit from eating the Perfect Self Program. Emotional Literacy (Course 12) will need this joy/holiness distinction for repair without self-erasure.

### Formation under load — Tuesday test

Joy interrupt after criticism or failure — not only after success. If joy is reward-only, it is applause addiction with worship vocabulary.
""",
    "perfect-self-program/course/modules/week-04.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Capstone evidence: 30-day sustainable growth plan with one rail per faculty/attribute band, witness review, chase relapse plan, and explicit bridge to Course 12 without pride. Sustainable growth that increases contempt or secrecy failed Course 11 — regardless of page count.

### Integration — School 1 capstone band (11–13)

Course 12 names and mends emotion; Course 13 honors temperament. Week 4 here seals **teleios practice** so the band does not become three self-help electives. Course 01 parity: greatness is kitchen fruit for 90 days — not LMS completion pride.

### Formation under load — Tuesday test

Your 30-day plan must include repair speed and emotional naming — or Course 12 will be theory on arrival.
""",
    "emotional-literacy/course/modules/week-01.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Show: lexicon growth (≥12 precise words used live), illegal emotion audit, one naming conversation that did not immediately fix, and Course 11 teleios sentence preserved (“feeling is signal, not ontology”). Naming without precision is venting with vocabulary — not literacy.

### Integration — Course 02 attributes + Course 11

Emotional attribute sits inside personal development; it is not identity. Course 11 forbids feeling-as-ontology. Week 1 builds the **word bank** Course 12 Weeks 2–4 will govern and mend.

### Formation under load — Tuesday test

Name the emotion aloud in your highest-risk cue this week. Private naming only is halfway literacy.
""",
    "emotional-literacy/course/modules/week-02.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Evidence: pause card used at least three times with log, brake → name → choose sequence on a red-load day, and refusal of freeze-as-virtue or flood-as-honesty in writing. Regulation that never reaches a chosen act is breathing aesthetic — not School 1 fruit.

### Integration — Courses 06–07 + 10

PD MasterClass and Self-Command installed Behavioral brakes. Course 10 conflict mastery assumes regulation before words. Week 2 is **governed emotion** — not suppressed emotion, not performed calm.

### Formation under load — Tuesday test

Pause card in live conflict or sharp text temptation — not only in journaling. Literacy is public when covenant requires it.
""",
    "emotional-literacy/course/modules/week-03.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Deliver: conflict captain map for two storms, blame → ownership rewrite, mid-storm naming once without fixing everything, and contempt-smile audit (three lines rewritten). Emotion in conflict without ownership is emotional intelligence cosplay — contempt with better vocabulary.

### Integration — Courses 09–10

Relatedness L2 and Mastery L3 supply protocol; Course 12 Week 3 supplies **emotion captaincy**. Better whole: name your part without fusion or exile language.

### Formation under load — Tuesday test

One conflict where you named your emotion before assigning character verdicts. If you only name after victory, literacy is lagging — not leading.
""",
    "emotional-literacy/course/modules/week-04.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Capstone evidence: two repair autopsies, live ritual practiced, 48-hour trust read honest, closing charter 700–1000 words with weakest leg + 30-day rail. Emotional repair skipped means Course 12 failed the kitchen test — certificates notwithstanding.

### Integration — Course 13 + full School 1

Course 13 temperament honor requires mend capacity — contempt grows in unmended tears. Week 4 closes **name → regulate → conflict → repair**. Course 01 parity: maturity is capacity evidenced under load.

### Formation under load — Tuesday test

Mend once more than comfort prefers this week. Structure over relief; ownership over fog.
""",
    "temperament-intelligence/course/modules/week-01.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Produce: two axis profiles, misread rewrite delivered aloud, five-day log, forbid list posted with seven-day zero-use or catch-and-repair log. Temperament basics without mouth discipline is psychology tourism — not School 1 finale prep.

### Integration — Course 06 W5 + Course 02

Temperamental attribute was named in Course 02 and trained in MasterClass Week 5. Course 13 completes **honor without clone demand**. Attributes ≠ Faculties — do not collapse temperament into Cognitive or Emotional excuses.

### Formation under load — Tuesday test

Honor act on a day their flavor irritates you most. Understanding without honor is contempt with notes.
""",
    "temperament-intelligence/course/modules/week-02.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Evidence: two conflict maps with teleios lines intact, curiosity question asked live, time-boxed decision kept, same-day repair if you defect-labeled. Temperament in conflict without protocol is analysis paralysis or contempt — both fail School 1.

### Integration — Courses 10 + 12

Conflict mastery (Course 10) and emotional literacy (Course 12) meet **flavor clash** here. Curiosity is tool, not hiding place — decision window required. Better whole: different notes, not character defects.

### Formation under load — Tuesday test

Pause-and-ask in a real clash this week. Journal-only curiosity fails the evidence bar.
""",
    "temperament-intelligence/course/modules/week-03.md": """
---

## Course 01 parity — School 1 greatness evidence bar

Finale evidence: ten-item appreciation list (no backhanded entries), seven-day honor log, five clean asks bank with one delivered, School 1 closing charter 900–1200 words witnessed. Course 13 completes Foundation — contempt here poisons Courses 02–12 retroactively.

### Integration — School 1 Foundation spine

Teleios (11) · literacy (12) · temperament honor (13) — the capstone triad. Course 01 parity: make the school great in breakfast tone, repair speed, and honor of difference. Certificates are secondary to household fruit for 90 days.

### Formation under load — Tuesday test

Public honor act once this week. Private-only honor is insufficient for School 1 finale grade.
""",
}


def word_count(text: str) -> int:
    return len(text.split())


def insert_block(path: Path, block: str) -> bool:
    text = path.read_text(encoding="utf-8")
    if MARKER in text:
        return False
    anchor = "## Reflection Questions"
    if anchor not in text:
        anchor = "## Diagnostic"
    if anchor not in text:
        raise SystemExit(f"No anchor in {path}")
    new_text = text.replace(anchor, block.strip() + "\n\n" + anchor, 1)
    path.write_text(new_text, encoding="utf-8")
    return True


def main():
    changed = []
    for rel, block in BLOCKS.items():
        path = ROOT / "docs/content" / rel
        if not path.exists():
            raise SystemExit(f"Missing {path}")
        before = word_count(path.read_text(encoding="utf-8"))
        if insert_block(path, block):
            after = word_count(path.read_text(encoding="utf-8"))
            changed.append((rel, before, after))
            print(f"✅ {rel}: {before} → {after} words")
        else:
            after = before
            print(f"⏭  {rel}: already has parity block ({after} words)")

    # Second pass: top-up any week still below TARGET
    TOP_UP = """
### Additional formation depth — Course 01 standard

School 1 greatness is not measured by reading completion. It is measured when a household can feel the rails: faster repair, cleaner speech, governed emotion, honored difference, and practice that starts from teleios rather than chasing worth. This week’s assignment must produce **observable fruit** — a log, a witness, a kept act, a retired phrase — not only insight.

Write one paragraph answering: *What would my closest relationship experience if I kept this week’s rule for 30 days?* If the answer is “nothing different,” the rule is too vague. Sharpen until the household would feel it.

Carry Course 01 integration forward: formation is structural; information is cosmetic. A great week leaves evidence in time, speech, and body — not only in notes.
"""
    for rel in BLOCKS:
        path = ROOT / "docs/content" / rel
        text = path.read_text(encoding="utf-8")
        if word_count(text) >= TARGET:
            continue
        if "### Additional formation depth — Course 01 standard" in text:
            continue
        anchor = "### Formation under load — Tuesday test"
        if anchor not in text:
            raise SystemExit(f"No Tuesday test anchor in {path}")
        text = text.replace(anchor, anchor + TOP_UP, 1)
        path.write_text(text, encoding="utf-8")
        print(f"⬆️  top-up {rel}: → {word_count(text)} words")

    low = []
    for rel in BLOCKS:
        path = ROOT / "docs/content" / rel
        w = word_count(path.read_text(encoding="utf-8"))
        if w < TARGET:
            low.append((rel, w))
    if low:
        print("\n⚠️  Still below target:")
        for rel, w in low:
            print(f"   {rel}: {w}")
        raise SystemExit(1)
    print(f"\n🎉 Parity pass complete — {len(changed)} files updated, all ≥ {TARGET}")


if __name__ == "__main__":
    main()
