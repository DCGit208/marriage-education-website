/**
 * CE2 Cohort OS — link fields, open-or-create, join gates, deep-link.
 * Usage: node scripts/test-ce2-cohort-os.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadIife(relPath, extras) {
  const code = read(relPath);
  const sandbox = Object.assign(
    {
      console: console,
      Date: Date,
      Number: Number,
      String: String,
      Math: Math,
      Array: Array,
      Object: Object,
      Error: Error,
      URL: URL,
      URLSearchParams: URLSearchParams,
      encodeURIComponent: encodeURIComponent,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
    },
    extras || {}
  );
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox;
}

function memoryDb(initial) {
  const docs = Object.assign({}, initial || {});
  function makeRef(docPath) {
    return {
      path: docPath,
      id: docPath.split('/').pop(),
      collection: function (name) {
        return makeCol(docPath + '/' + name);
      },
      get: async function () {
        return {
          exists: Object.prototype.hasOwnProperty.call(docs, docPath),
          data: function () {
            return docs[docPath];
          },
        };
      },
      set: async function (data) {
        docs[docPath] = Object.assign({}, docs[docPath] || {}, data);
      },
    };
  }
  function makeCol(colPath) {
    return {
      doc: function (id) {
        return makeRef(colPath + '/' + id);
      },
    };
  }
  return {
    _docs: docs,
    collection: function (name) {
      return makeCol(name);
    },
    runTransaction: async function (fn) {
      const tx = {
        get: function (ref) {
          return ref.get();
        },
        set: function (ref, data) {
          docs[ref.path] = Object.assign({}, docs[ref.path] || {}, data);
        },
      };
      return fn(tx);
    },
  };
}

let failed = 0;
function test(name, fn) {
  try {
    const ret = fn();
    if (ret && typeof ret.then === 'function') {
      return ret.then(
        function () {
          console.log('  ok  ' + name);
        },
        function (err) {
          failed += 1;
          console.error('  FAIL  ' + name);
          console.error('       ' + (err && err.stack ? err.stack.split('\n')[0] : err));
        }
      );
    }
    console.log('  ok  ' + name);
    return Promise.resolve();
  } catch (err) {
    failed += 1;
    console.error('  FAIL  ' + name);
    console.error('       ' + (err && err.stack ? err.stack.split('\n')[0] : err));
    return Promise.resolve();
  }
}

const rules = read('firestore.rules');
const html = read('public/communication-v2/index.html');
const v2 = read('public/communication-v2/communication-v2.js');
const css = read('public/communication-v2/communication-v2.css');
const pkg = JSON.parse(read('package.json'));
const sandbox = loadIife('public/communication-v2/ce2-cohort.js');
const api = sandbox.Ce2Cohort;

async function run() {
  console.log('\nCE2 Cohort OS — link fields\n');

  await test('VERSION is 1 and exposes cohort helpers', function () {
    assert.strictEqual(api.VERSION, 1);
    assert.ok(api.cohortGroupId);
    assert.ok(api.openOrCreateCohortGroup);
    assert.ok(api.canJoinCohort);
    assert.ok(api.parseEntryParams);
    assert.ok(api.entryHref);
    assert.ok(api.contextHeader);
    assert.strictEqual(api.TYPES.COURSE, 'course');
  });

  await test('deterministic group id from course/board + cohort key', function () {
    assert.strictEqual(
      api.cohortGroupId({ cohortType: 'course', courseId: 'school-1-teleios' }),
      'cohort_course_school-1-teleios_default'
    );
    assert.strictEqual(
      api.cohortGroupId({
        cohortType: 'board',
        boardId: 'board-cohort-accountability',
        cohortKey: 'spring-26',
      }),
      'cohort_board_board-cohort-accountability_spring-26'
    );
    assert.ok(api.isCohortGroupId('cohort_course_school-1-teleios_default'));
    assert.strictEqual(api.isCohortGroupId('random-group'), false);
    assert.strictEqual(api.cohortGroupId({ cohortType: 'course' }), '');
  });

  await test('buildGroupFields writes cohortType, resource id, title, and safe context URL', function () {
    const fields = api.buildGroupFields(
      { cohortType: 'course', courseId: 'school-1-teleios' },
      { uid: 'ada' },
      { course: { id: 'school-1-teleios', title: 'Teleios Identity', accessLevel: 'foundation' } }
    );
    assert.strictEqual(fields.cohortType, 'course');
    assert.strictEqual(fields.courseId, 'school-1-teleios');
    assert.strictEqual(fields.cohortKey, 'default');
    assert.strictEqual(fields.cohortId, 'cohort_course_school-1-teleios_default');
    assert.strictEqual(fields.createdBy, 'ada');
    assert.strictEqual(fields.contextTitle, 'Teleios Identity');
    assert.strictEqual(fields.requiredTier, 'foundation');
    assert.strictEqual(fields.allowCrossTier, false);
    assert.strictEqual(fields.contextUrl, '/courses.html?course=school-1-teleios');
    assert.ok(api.isSafeContextUrl(fields.contextUrl));
    assert.strictEqual(api.isSafeContextUrl('https://evil.example/phish'), false);
  });

  await test('board fields point back to the board, not a blank chat', function () {
    const fields = api.buildGroupFields(
      { cohortType: 'board', boardId: 'b1' },
      { uid: 'host1' },
      { board: { id: 'b1', title: 'Accountability', requiredTier: 'premium' } }
    );
    assert.strictEqual(fields.boardId, 'b1');
    assert.strictEqual(fields.requiredTier, 'premium');
    assert.strictEqual(fields.contextUrl, '/board.html?boardId=b1');
    const header = api.contextHeader(fields);
    assert.strictEqual(header.kicker, 'Board cohort');
    assert.strictEqual(header.cta, 'Back to board');
    assert.strictEqual(header.url, '/board.html?boardId=b1');
  });

  console.log('\nCE2 Cohort OS — open-or-create idempotency\n');

  await test('first opener creates the group as host; second join is member and reuses the id', async function () {
    const db = memoryDb();
    const spec = { cohortType: 'course', courseId: 'teleios' };
    const first = await api.openOrCreateCohortGroup(
      db,
      { uid: 'ada', ownedCourses: ['teleios'], tier: 'foundation' },
      spec,
      { course: { id: 'teleios', title: 'Teleios', accessLevel: 'foundation' } }
    );
    const second = await api.openOrCreateCohortGroup(
      db,
      { uid: 'bob', ownedCourses: ['teleios'], tier: 'foundation' },
      spec,
      { course: { id: 'teleios', title: 'Teleios', accessLevel: 'foundation' } }
    );
    assert.strictEqual(first.created, true);
    assert.strictEqual(first.role, 'host');
    assert.strictEqual(first.groupId, 'cohort_course_teleios_default');
    assert.strictEqual(second.created, false);
    assert.strictEqual(second.role, 'member');
    assert.strictEqual(second.groupId, first.groupId);
    assert.strictEqual(db._docs['communicationGroups/' + first.groupId].createdBy, 'ada');
    assert.strictEqual(db._docs['communicationGroups/' + first.groupId + '/members/ada'].role, 'host');
    assert.strictEqual(db._docs['communicationGroups/' + first.groupId + '/members/bob'].role, 'member');
  });

  await test('opening the same cohort twice does not duplicate the group or escalate the member', async function () {
    const db = memoryDb();
    const spec = { cohortType: 'board', boardId: 'circle-1' };
    const board = { id: 'circle-1', title: 'Circle', requiredTier: 'foundation' };
    const user = { uid: 'ada', tier: 'foundation' };
    const a = await api.openOrCreateCohortGroup(db, user, spec, { board: board });
    const b = await api.openOrCreateCohortGroup(db, user, spec, { board: board });
    assert.strictEqual(a.groupId, b.groupId);
    assert.strictEqual(a.created, true);
    assert.strictEqual(b.created, false);
    assert.strictEqual(b.role, 'host');
    const memberKeys = Object.keys(db._docs).filter(function (k) {
      return k.indexOf('/members/') >= 0;
    });
    assert.strictEqual(memberKeys.length, 1);
  });

  await test('joinRoleForOpener: first writer host; later members stay members', function () {
    assert.strictEqual(api.joinRoleForOpener({ existingGroup: null, uid: 'ada' }), 'host');
    assert.strictEqual(
      api.joinRoleForOpener({ existingGroup: { createdBy: 'ada' }, uid: 'ada' }),
      'host'
    );
    assert.strictEqual(
      api.joinRoleForOpener({ existingGroup: { createdBy: 'ada' }, uid: 'bob' }),
      'member'
    );
    assert.strictEqual(
      api.joinRoleForOpener({
        existingGroup: { createdBy: 'ada' },
        uid: 'ada',
        alreadyMember: true,
        existingRole: 'host',
      }),
      'host'
    );
  });

  console.log('\nCE2 Cohort OS — join gates\n');

  await test('purchase-only course denies non-owners even at Elite', function () {
    const group = {
      cohortType: 'course',
      courseId: 'the-woman-the-wife-the-mother',
      requiredTier: 'elite',
    };
    const course = { id: 'the-woman-the-wife-the-mother', purchaseOnly: true, accessLevel: 'elite' };
    assert.strictEqual(
      api.canJoinCohort({ uid: 'eve', tier: 'elite', ownedCourses: [] }, group, { course: course }),
      false
    );
    assert.strictEqual(
      api.canJoinCohort(
        { uid: 'ada', tier: 'foundation', ownedCourses: ['the-woman-the-wife-the-mother'] },
        group,
        { course: course }
      ),
      true
    );
  });

  await test('subscription course allows tier-qualified members without ownedCourses', function () {
    const group = { cohortType: 'course', courseId: 'teleios', requiredTier: 'foundation' };
    const course = { id: 'teleios', accessLevel: 'foundation' };
    assert.strictEqual(
      api.canJoinCohort({ uid: 'ada', tier: 'foundation' }, group, { course: course }),
      true
    );
    assert.strictEqual(
      api.canJoinCohort({ uid: 'kid', tier: 'free', subscription: { status: 'expired' } }, group, {
        course: course,
      }),
      true
    );
  });

  await test('board with groupId requires assignment; open boards use tier', function () {
    const group = { cohortType: 'board', boardId: 'b1', requiredTier: 'foundation' };
    assert.strictEqual(
      api.canJoinCohort(
        { uid: 'ada', tier: 'elite', groups: [] },
        group,
        { board: { id: 'b1', groupId: 'g-private', requiredTier: 'foundation' } }
      ),
      false
    );
    assert.strictEqual(
      api.canJoinCohort(
        { uid: 'ada', tier: 'foundation', groups: ['g-private'] },
        group,
        { board: { id: 'b1', groupId: 'g-private' } }
      ),
      true
    );
    assert.strictEqual(
      api.canJoinCohort(
        { uid: 'ada', tier: 'premium' },
        group,
        { board: { id: 'b1', requiredTier: 'foundation' } }
      ),
      true
    );
  });

  await test('staff/admin bypass; strangers cannot open a missing spec', async function () {
    assert.strictEqual(
      api.canJoinCohort(
        { uid: 'boss', role: 'admin', tier: 'free' },
        { cohortType: 'course', courseId: 'secret', requiredTier: 'elite' },
        { course: { id: 'secret', purchaseOnly: true } }
      ),
      true
    );
    const db = memoryDb();
    let denied = false;
    try {
      await api.openOrCreateCohortGroup(
        db,
        { uid: 'eve', tier: 'elite', ownedCourses: [] },
        { cohortType: 'course', courseId: 'the-woman-the-wife-the-mother' },
        { course: { id: 'the-woman-the-wife-the-mother', purchaseOnly: true } }
      );
    } catch (err) {
      denied = err.code === 'cohort-denied';
    }
    assert.ok(denied, 'ineligible opener must be denied');
    assert.strictEqual(Object.keys(db._docs).length, 0);
  });

  console.log('\nCE2 Cohort OS — deep-link\n');

  await test('entryHref and parseEntryParams round-trip course and board', function () {
    const courseHref = api.entryHref({ cohortType: 'course', courseId: 'teleios' });
    assert.strictEqual(courseHref, '/communication-v2/?cohort=course&course=teleios');
    const parsed = api.parseEntryParams(courseHref.split('?')[1]);
    assert.strictEqual(parsed.kind, 'cohort');
    assert.strictEqual(parsed.spec.courseId, 'teleios');
    const boardHref = api.entryHref({ cohortType: 'board', boardId: 'b1', cohortKey: 'spring' });
    assert.ok(boardHref.indexOf('cohort=board') >= 0);
    assert.ok(boardHref.indexOf('board=b1') >= 0);
    const groupHref = api.groupHref('cohort_course_teleios_default');
    assert.strictEqual(groupHref, '/communication-v2/?group=cohort_course_teleios_default');
    assert.strictEqual(api.parseEntryParams('group=abc.def-1').kind, 'group');
    assert.strictEqual(api.parseEntryParams('group=https://evil.example'), null);
  });

  await test('CE2 shell parses cohort params, paints context chrome, and cache-busts', function () {
    assert.ok(html.indexOf('ce2-cohort.js?v=1') >= 0);
    assert.ok(html.indexOf('id="ce2CohortContext"') >= 0);
    assert.ok(html.indexOf('id="ce2CohortContextLink"') >= 0);
    assert.ok(html.indexOf('Back to course') >= 0);
    assert.ok(v2.indexOf('openCohortFromSpec') >= 0);
    assert.ok(v2.indexOf('parseEntryParams') >= 0);
    assert.ok(v2.indexOf('applyCohortContextFromGroup') >= 0);
    assert.ok(v2.indexOf("role: 'member'") >= 0);
    assert.ok(v2.indexOf("role: 'host'") >= 0);
    assert.ok(/\.ce2-cohort-context/.test(css));
    assert.ok(/\.ce2-cohort-kicker/.test(css));
    const jsVer = html.match(/communication-v2\.js\?v=(\d+)/);
    const cssVer = html.match(/communication-v2\.css\?v=(\d+)/);
    assert.ok(jsVer && Number(jsVer[1]) > 126);
    assert.ok(cssVer && Number(cssVer[1]) > 92);
  });

  await test('course, lesson, and board surfaces expose Open cohort chat', function () {
    const courses = read('src/pages/courses.html');
    const lesson = read('src/pages/lesson.html');
    const board = read('src/pages/board.html');
    const coursesJs = read('public/js/courses.js');
    const boardJs = read('public/js/board.js');
    assert.ok(courses.indexOf('Open cohort chat') >= 0);
    assert.ok(courses.indexOf('id="sheetCohortChatBtn"') >= 0);
    assert.ok(courses.indexOf('ce2-cohort.js') >= 0);
    assert.ok(lesson.indexOf('Open cohort chat') >= 0);
    assert.ok(lesson.indexOf('id="lessonCohortChat"') >= 0);
    assert.ok(board.indexOf('Open cohort chat') >= 0);
    assert.ok(board.indexOf('id="boardCohortChat"') >= 0);
    assert.ok(coursesJs.indexOf("cohortType: 'course'") >= 0);
    assert.ok(boardJs.indexOf("cohortType: 'board'") >= 0);
    assert.ok(/board-media\.css\?v=66/.test(board));
  });

  console.log('\nCE2 Cohort OS — Firestore rules\n');

  await test('cohort create and join gates are in rules; world-open list is unchanged', function () {
    assert.ok(/function ce2CanJoinCohortGroup\(ud, gdata\)/.test(rules));
    assert.ok(/function ce2CohortGroupCreateValid\(\)/.test(rules));
    assert.ok(/function ce2CanSelfJoinGroup\(groupId\)/.test(rules));
    assert.ok(/function ce2CohortCreatorHostJoinValid\(groupId\)/.test(rules));
    assert.ok(/ce2CohortGroupCreateValid\(\)/.test(rules));
    assert.ok(/ce2CanSelfJoinGroup\(groupId\)/.test(rules));
    assert.ok(/ce2CohortCreatorHostJoinValid\(groupId\)/.test(rules));
    assert.ok(/ce2UserOwnsOrEnrolledCourse/.test(rules));
    assert.ok(rules.indexOf("gdata.cohortType == 'course'") >= 0);
    assert.ok(rules.indexOf("request.resource.data.role == 'host'") >= 0);
    assert.ok(/allowCrossTier == false/.test(rules));
    const groupCreate = rules.match(
      /match \/communicationGroups\/\{groupId\} \{[\s\S]*?allow create: if[\s\S]*?;/
    );
    assert.ok(groupCreate, 'missing group create rule');
    assert.ok(groupCreate[0].indexOf('ce2IsAdmin') >= 0, 'admin create path must remain');
  });

  await test('does not rewrite the frozen keyboard block', function () {
    assert.ok(html.indexOf('ce2-keyboard-stable-v60') >= 0);
    assert.ok(v2.indexOf('function applyViewportPanCounter') >= 0);
    assert.ok(v2.indexOf('function applyComposerKeyboardLift') >= 0);
  });

  await test('validate script includes this test', function () {
    assert.ok(pkg.scripts.validate.indexOf('test-ce2-cohort-os.js') >= 0);
    assert.ok(pkg.scripts['test:ce2-cohort-os']);
  });

  if (failed) {
    console.error('\n' + failed + ' test(s) failed\n');
    process.exit(1);
  }
  console.log('\n✅ CE2 cohort OS tests passed\n');
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
