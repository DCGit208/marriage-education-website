#!/usr/bin/env node
/**
 * Seed The Woman, The Wife, The Mother → Firestore (courses + modules)
 * Part bodies live in modules/{id}/parts/{partId} — keeps week docs small for fast LMS load.
 */
'use strict';

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const COURSE_ID = 'the-woman-the-wife-the-mother';
const SA = path.resolve(__dirname, '../../serviceAccountKey.json');
const CATALOGUE = path.resolve(__dirname, '../../courses-catalogue.json');

if (!fs.existsSync(SA)) {
  console.error('❌ serviceAccountKey.json not found at', SA);
  console.error('   Dry-run: node scripts/seed-wwm-course.js --dry-run');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
}
const db = admin.firestore();
const TS = admin.firestore.FieldValue.serverTimestamp;
const DELETE = admin.firestore.FieldValue.delete();
const DRY = process.argv.includes('--dry-run');
const { splitWwmModuleIntoParts } = require('./lib/split-wwm-parts');

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
const course = catalogue.find((c) => c.courseId === COURSE_ID);
if (!course) {
  console.error('❌ Course not in courses-catalogue.json — run: node scripts/build-wwm-course.js');
  process.exit(1);
}

async function seed() {
  console.log(`\n📗 Seeding ${COURSE_ID} (${course.modules.length} modules)\n`);

  const courseDoc = {
    id: COURSE_ID,
    courseId: COURSE_ID,
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    instructor: course.instructor,
    duration: course.duration,
    duration_weeks: 13,
    price: course.price,
    level: course.level,
    schoolId: 'standalone',
    school_name: course.school_name,
    accessLevel: 'elite',
    requiredTier: 'elite',
    purchaseOnly: true,
    published: true,
    featured: true,
    moduleCount: course.modules.length,
    tags: course.tags,
    certification: course.certification,
    learningOutcomes: course.learningOutcomes,
    updatedAt: TS(),
  };

  if (DRY) {
    console.log('DRY RUN course:', courseDoc.title);
  } else {
    await db.collection('courses').doc(COURSE_ID).set(courseDoc, { merge: true });
    console.log('✓ courses/' + COURSE_ID);
  }

  for (let i = 0; i < course.modules.length; i++) {
    const mod = course.modules[i];
    const wk = mod.moduleId || i + 1;
    const docId = `wwm-week-${wk}`;
    const splitParts = splitWwmModuleIntoParts(mod.content, { track: 'formation' });

    const data = {
      id: docId,
      courseId: COURSE_ID,
      schoolId: 'standalone',
      week: wk,
      weekNumber: wk,
      totalWeeks: 13,
      title: mod.title,
      duration: mod.duration || '1 week',
      accessLevel: 'elite',
      unlockTier: 'elite',
      requiredTier: 'elite',
      purchaseOnly: true,
      isLocked: false,
      order: wk,
      reflectionQuestions: mod.reflection_questions || [],
      keyTerms: mod.keyTerms || [],
      exercises: mod.exercises || [],
      updatedAt: TS(),
    };

    if (splitParts && splitParts.length) {
      data.parts = splitParts.map((p) => ({
        id: p.id,
        order: p.order,
        track: p.track,
        title: p.title,
        estimatedMinutes: p.estimatedMinutes,
      }));
      data.courseFormat = 'formation';
      data.hasPartSubcollection = true;
      data.content = DELETE;
    } else {
      data.content = mod.content;
      data.parts = DELETE;
      data.hasPartSubcollection = DELETE;
      data.courseFormat = DELETE;
    }

    if (DRY) {
      const kb = splitParts
        ? Math.round(splitParts.reduce((n, p) => n + p.content.length, 0) / 1024)
        : Math.round((mod.content || '').length / 1024);
      console.log(`  DRY ${docId}: ${mod.title.substring(0, 42)}… (${kb}KB parts)`);
      continue;
    }

    const batch = db.batch();
    const modRef = db.collection('modules').doc(docId);
    batch.set(modRef, data, { merge: true });

    if (splitParts) {
      splitParts.forEach((p) => {
        const partRef = modRef.collection('parts').doc(p.id);
        batch.set(partRef, {
          id: p.id,
          order: p.order,
          title: p.title,
          content: p.content,
          updatedAt: TS(),
        }, { merge: true });
      });
    }

    await batch.commit();
    console.log(`  ✓ modules/${docId}${splitParts ? ` (+${splitParts.length} parts)` : ''}`);
  }

  console.log(DRY ? '\n🔍 Dry run complete.' : '\n✅ Seed complete.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
