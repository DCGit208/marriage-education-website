#!/usr/bin/env node
/**
 * Read-only comparison of School 1 Firestore courses/modules with the
 * checked-in course catalogue. Authenticate with Google ADC or
 * GOOGLE_APPLICATION_CREDENTIALS; never commit credential files.
 *
 * Run from the repo root:
 *   gcloud auth application-default login
 *   node sbd-network/scripts/verify-school1-live.js
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SCHOOL_ID = 'school-1-teleios';
const CATALOGUE_PATH = path.join(ROOT, 'courses-catalogue.json');
const SCHOOL_COURSES_PATH = path.join(ROOT, 'schoolcourses.json');
const FIREBASE_CONFIG_PATH = path.join(__dirname, '../.firebaserc');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required source file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
  const catalogueData = readJson(CATALOGUE_PATH);
  const catalogue = Array.isArray(catalogueData) ? catalogueData : catalogueData.courses || [];
  const expectedCourses = readJson(SCHOOL_COURSES_PATH).filter(course => course.school === 1);
  const firebaseConfig = readJson(FIREBASE_CONFIG_PATH);
  const projectId = process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || firebaseConfig.projects?.default;

  if (!projectId) {
    throw new Error('No Firebase project ID found in environment or sbd-network/.firebaserc.');
  }

  const credential = process.env.FIREBASE_SERVICE_ACCOUNT
    ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    : admin.credential.applicationDefault();
  admin.initializeApp({ credential, projectId });
  const db = admin.firestore();
  let failures = 0;

  console.log(`Read-only School 1 content verification — project ${projectId}`);
  console.log(`Expected courses from source taxonomy: ${expectedCourses.length}`);

  const liveCoursesSnapshot = await db.collection('courses')
    .where('schoolId', '==', SCHOOL_ID)
    .get();
  console.log(`Live School 1 courses: ${liveCoursesSnapshot.size}`);
  if (liveCoursesSnapshot.size !== expectedCourses.length) {
    console.error(`FAIL: expected ${expectedCourses.length} School 1 courses, found ${liveCoursesSnapshot.size}`);
    failures += 1;
  }

  const liveCoursesByTitle = new Map(
    liveCoursesSnapshot.docs.map(doc => [doc.data().title, { id: doc.id, ...doc.data() }])
  );

  for (const expectedCourse of expectedCourses) {
    const sourceCourse = catalogue.find(course => course.title === expectedCourse.title);
    const liveCourse = liveCoursesByTitle.get(expectedCourse.title);
    const courseIssues = [];

    if (!sourceCourse) {
      courseIssues.push('missing from courses-catalogue.json');
    }
    if (!liveCourse) {
      courseIssues.push('missing from live Firestore');
    }
    if (!sourceCourse || !liveCourse) {
      console.error(`FAIL: ${expectedCourse.title} — ${courseIssues.join('; ')}`);
      failures += 1;
      continue;
    }

    if (!['foundation', 'free'].includes(liveCourse.accessLevel)) {
      courseIssues.push(`course accessLevel is ${liveCourse.accessLevel || 'unset'}`);
    }

    let moduleDocs = [];
    const moduleIds = Array.isArray(liveCourse.moduleIds) ? liveCourse.moduleIds : [];
    if (moduleIds.length) {
      const refs = moduleIds.map(id => db.collection('modules').doc(id));
      moduleDocs = await db.getAll(...refs);
    } else {
      const moduleSnapshot = await db.collection('modules')
        .where('courseId', '==', liveCourse.id)
        .get();
      moduleDocs = moduleSnapshot.docs;
      moduleDocs.sort((a, b) => (a.data().week || 0) - (b.data().week || 0));
      if (!moduleDocs.length) {
        courseIssues.push('no moduleIds on course and no linked module documents found');
      }
    }

    const expectedModules = Array.isArray(sourceCourse.modules) ? sourceCourse.modules : [];
    const existingModules = moduleDocs.filter(doc => doc.exists);
    if (existingModules.length !== expectedModules.length) {
      courseIssues.push(`modules ${existingModules.length}/${expectedModules.length}`);
    }

    for (let index = 0; index < Math.min(existingModules.length, expectedModules.length); index += 1) {
      const liveModule = existingModules[index].data();
      const sourceModule = expectedModules[index];
      const week = index + 1;
      if ((liveModule.content || '').trim() !== (sourceModule.content || '').trim()) {
        courseIssues.push(`week ${week} content differs from catalogue`);
      }
      if (!['foundation', 'free'].includes(liveModule.accessLevel)
          && liveModule.unlockTier !== 'foundation') {
        courseIssues.push(`week ${week} access is ${liveModule.accessLevel || liveModule.unlockTier || 'unset'}`);
      }
      if (liveModule.isLocked === true) {
        courseIssues.push(`week ${week} is marked locked`);
      }
    }

    if (courseIssues.length) {
      console.error(`FAIL: ${expectedCourse.title} — ${[...new Set(courseIssues)].join('; ')}`);
      failures += 1;
    } else {
      console.log(`PASS: ${expectedCourse.title} — ${existingModules.length} modules, content and Foundation access match`);
    }
  }

  await admin.app().delete();
  if (failures) {
    console.error(`\nVerification found ${failures} issue(s).`);
    process.exitCode = 1;
  } else {
    console.log('\nPASS: all School 1 courses and modules match the checked-in source.');
  }
}

main().catch(async error => {
  console.error(`Verification could not complete: ${error.message}`);
  if (admin.apps.length) {
    await admin.app().delete();
  }
  process.exitCode = 1;
});
