/**
 * BOARD MAPPING HELPER
 * ==================================
 * 
 * This script helps map existing boards to the new formation system structure.
 * Run this AFTER init-formation-system.js
 * 
 * Run with: node scripts/map-existing-boards.js
 */

const admin = require('firebase-admin');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../../serviceAccountKey.json');

// Initialize (assuming already initialized by previous script)
if (!admin.apps.length) {
  if (!fs.existsSync(SERVICE_ACCOUNT)) {
    console.error('❌  serviceAccountKey.json not found at:', SERVICE_ACCOUNT);
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ==================================================================
// SUGGESTED BOARD MAPPINGS (Edit based on your actual boards)
// ==================================================================

const suggestedMappings = {
  // =================================================================
  // 🔥 ADVANCED MULIEBRITY BOARDS (ALL 20 EXISTING BOARDS → ELITE) 🔥
  // =================================================================
  
  // MULIEBRITY EXPRESSION BOARDS
  'Muliebrity Official': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'Muliebrity Corporate': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'Muliebrity Fitness - Sports': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'Muliebrity Casual - Day': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'Muliebrity Casual - Night': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'Muliebrity Casual@Home': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  
  // SEXUAL MASTERY BOARDS (ADVANCED MULIEBRITY)
  'The Art of Fucking - excerpts from the ebook portfolio': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'The Art of the Pussy': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'The Art of Sexuality': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'The Art of Cock Sucking': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'The Ass that needs a cock': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'Sexual Hygiene et al': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'Sexercise': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'Marriage = Porn & Beyond': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  
  // SKILLS & LIFESTYLE BOARDS (ADVANCED MULIEBRITY)
  'Casual Sling Shot Strings': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'Self Defense for Couples': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'Organizational Skills': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'Business Board': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  
  // GENERAL BOARDS (ADVANCED MULIEBRITY)
  'General Board': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  },
  'General': {
    schoolId: 'muliebrity',
    courseId: 'muliebrity-expression',
    moduleId: null,
    accessLevel: 'elite'
  }
};

// ==================================================================
// FUNCTIONS
// ==================================================================

async function fetchAllBoards() {
  console.log('📋 Fetching all existing boards...\n');
  
  const snapshot = await db.collection('boards').get();
  const boards = [];
  
  snapshot.forEach(doc => {
    boards.push({
      id: doc.id,
      ...doc.data()
    });
  });
  
  return boards;
}

async function displayBoardsForMapping(boards) {
  console.log(`Found ${boards.length} boards:\n`);
  console.log('=' .repeat(80));
  
  boards.forEach((board, index) => {
    console.log(`\n[${index + 1}] Board ID: ${board.id}`);
    console.log(`    Title: ${board.title || 'Untitled'}`);
    console.log(`    Description: ${(board.description || 'No description').substring(0, 100)}`);
    console.log(`    Members: ${board.members?.length || 0}`);
    console.log(`    Current schoolId: ${board.schoolId || 'none'}`);
    console.log(`    Current accessLevel: ${board.accessLevel || 'none'}`);
  });
  
  console.log('\n' + '='.repeat(80) + '\n');
}

async function applyBoardMapping(boardId, mapping) {
  try {
    await db.collection('boards').doc(boardId).update({
      schoolId: mapping.schoolId,
      courseId: mapping.courseId,
      moduleId: mapping.moduleId || null,
      accessLevel: mapping.accessLevel,
      isLinkedToModule: !!mapping.moduleId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Updated board: ${boardId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error updating board ${boardId}:`, error.message);
    return false;
  }
}

async function interactiveMapping() {
  const boards = await fetchAllBoards();
  await displayBoardsForMapping(boards);
  
  console.log('🎯 MAPPING OPTIONS:\n');
  console.log('1. Apply suggested mappings (auto-map known boards)');
  console.log('2. Interactive mapping (manual, board-by-board)');
  console.log('3. Export boards to JSON for manual editing');
  console.log('4. Exit\n');
  
  rl.question('Choose option (1-4): ', async (answer) => {
    switch (answer.trim()) {
      case '1':
        await applySuggestedMappings(boards);
        break;
      case '2':
        await manualMapping(boards);
        break;
      case '3':
        await exportBoardsToJSON(boards);
        break;
      case '4':
        console.log('Exiting...');
        rl.close();
        process.exit(0);
        break;
      default:
        console.log('Invalid option. Exiting...');
        rl.close();
        process.exit(0);
    }
  });
}

async function applySuggestedMappings(boards) {
  console.log('\n📝 Applying suggested mappings...\n');
  
  let updated = 0;
  let skipped = 0;
  
  for (const board of boards) {
    // Check if board title or ID matches suggested mapping
    const mapping = suggestedMappings[board.id] || suggestedMappings[board.title];
    
    if (mapping) {
      const success = await applyBoardMapping(board.id, mapping);
      if (success) updated++;
    } else {
      console.log(`⏭️  Skipped: ${board.title || board.id} (no mapping found)`);
      skipped++;
    }
  }
  
  console.log(`\n✨ Complete! Updated ${updated} boards, skipped ${skipped}`);
  console.log('\n💡 TIP: Review skipped boards and map manually or update suggested mappings.\n');
  
  rl.close();
  process.exit(0);
}

async function manualMapping(boards) {
  console.log('\n🔧 Starting interactive mapping...\n');
  // TODO: Implement interactive CLI mapping
  console.log('⚠️  Interactive mapping not yet implemented.');
  console.log('    Use option 3 to export boards, edit JSON, then import.\n');
  rl.close();
  process.exit(0);
}

async function exportBoardsToJSON(boards) {
  const fs = require('fs');
  const output = boards.map(board => ({
    id: board.id,
    title: board.title,
    currentSchool: board.schoolId || null,
    currentAccessLevel: board.accessLevel || null,
    suggestedMapping: {
      schoolId: '',
      courseId: '',
      moduleId: '',
      accessLevel: 'foundation' // or premium, elite
    }
  }));
  
  const filePath = './board-mappings.json';
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2));
  
  console.log(`\n✅ Exported ${boards.length} boards to: ${filePath}`);
  console.log('\n📝 Next steps:');
  console.log('1. Edit board-mappings.json');
  console.log('2. Fill in suggestedMapping for each board');
  console.log('3. Run: node scripts/import-board-mappings.js\n');
  
  rl.close();
  process.exit(0);
}

async function preserveImportantBoards() {
  console.log('\n🚨 Ensuring critical boards are protected...\n');
  
  // Find "Advanced Muliebrity School" board
  const snapshot = await db.collection('boards')
    .where('title', '==', 'Advanced Muliebrity School')
    .get();
  
  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    console.log(`✅ Found "Advanced Muliebrity School" (ID: ${doc.id})`);
    console.log(`   Current access level: ${doc.data().accessLevel || 'none'}`);
    console.log(`   Will be mapped to: Muliebrity School (Elite tier)\n`);
    
    // Apply elite mapping
    await applyBoardMapping(doc.id, {
      schoolId: 'muliebrity',
      courseId: 'muliebrity-expression',
      moduleId: null,
      accessLevel: 'elite'
    });
  } else {
    console.log(`⚠️  WARNING: "Advanced Muliebrity School" board not found!`);
    console.log(`   Please verify the board exists and map it manually.\n`);
  }
}

// ==================================================================
// MAIN EXECUTION
// ==================================================================

async function main() {
  console.log('🗺️  Board Mapping Helper\n');
  console.log('This script helps map existing boards to the formation system.\n');
  
  try {
    // First, protect important boards
    await preserveImportantBoards();
    
    // Then start interactive mapping
    await interactiveMapping();
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    rl.close();
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { applyBoardMapping, fetchAllBoards };
