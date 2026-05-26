/**
 * Smoke test for manifest-reader.
 * Run: npx tsx scripts/smoke-manifest.ts
 *
 * Checks:
 *   - All program folders are discoverable
 *   - AI_Project_Management manifest loads cleanly
 *   - Avatar profiles resolve (will be 0 until uid mismatch is fixed)
 *   - Delivery script loads from delivery_scripts_root
 *   - Module list matches expected count
 */

import { listPrograms, readProgram, readDeliveryScript } from '../src/lib/manifest-reader';

const BOLD  = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function pass(label: string, detail = '') {
  console.log(`  ${GREEN}✓${RESET} ${label}${detail ? `  ${YELLOW}${detail}${RESET}` : ''}`);
}

function fail(label: string, detail = '') {
  console.log(`  ${RED}✗${RESET} ${label}${detail ? `  — ${detail}` : ''}`);
}

function section(title: string) {
  console.log(`\n${BOLD}${title}${RESET}`);
}

let errors = 0;

// ── 1. List programs ──────────────────────────────────────────────────────────

section('1. Discover programs');
const programs = listPrograms();
if (programs.length > 0) {
  pass(`Found ${programs.length} program(s)`, programs.join(', '));
} else {
  fail('No programs found — check CONTENT_BASE_PATH');
  errors++;
}

// ── 2. Load AI_Project_Management manifest ────────────────────────────────────

section('2. Load AI_Project_Management manifest');

let aipm: ReturnType<typeof readProgram> | null = null;

try {
  aipm = readProgram('AI_Project_Management');
  pass(`program_id: ${aipm.manifest.program_id}`);
  pass(`display_name: ${aipm.manifest.display_name}`);
  pass(`content_version: ${aipm.manifest.content_version}`);
  pass(`total_hours: ${aipm.manifest.total_hours}`);
} catch (e) {
  fail('readProgram() threw', String(e));
  errors++;
}

// ── 3. Module list ────────────────────────────────────────────────────────────

section('3. Module list');

if (aipm) {
  const mods = aipm.manifest.modules;
  if (mods.length === 12) {
    pass(`12 modules found (A–L)`);
  } else {
    fail(`Expected 12 modules, got ${mods.length}`);
    errors++;
  }
  for (const mod of mods) {
    console.log(`     ${mod.id}  ${mod.folder}  (${mod.hours}h, milestone ${mod.milestone})`);
  }
}

// ── 4. Avatar profile resolution ─────────────────────────────────────────────

section('4. Avatar profile resolution');

if (aipm) {
  const count = aipm.avatarProfiles.size;
  const declared = aipm.manifest.avatars.length;
  if (count === declared) {
    pass(`All ${count} avatar profiles resolved`);
  } else if (count === 0) {
    fail(
      `0 of ${declared} avatars resolved`,
      'uid mismatch in manifest — avatars use "id:" but interface expects "uid:"',
    );
    errors++;
  } else {
    fail(`Only ${count} of ${declared} avatars resolved`);
    errors++;
  }

  if (count > 0) {
    for (const [uid, profile] of aipm.avatarProfiles) {
      pass(`  ${uid}`, `role: ${profile.frontmatter.role}`);
    }
  }
}

// ── 5. Delivery script ────────────────────────────────────────────────────────

section('5. Delivery script (lesson A1)');

if (aipm) {
  const script = readDeliveryScript(
    'AI_Project_Management',
    'module-a-ai-foundations',
    'a1',
    aipm.manifest,
  );
  if (script) {
    pass('lesson-a1-delivery-script.yml loaded');
  } else {
    fail('Delivery script not found', 'expected at program-config/delivery-scripts/lesson-a1-delivery-script.yml');
    errors++;
  }
}

// ── 6. delivery_scripts_root field ───────────────────────────────────────────

section('6. Manifest fields');

if (aipm) {
  const { curriculum_root, delivery_scripts_root, config_root } = aipm.manifest;
  pass(`curriculum_root: ${curriculum_root}`);
  if (delivery_scripts_root) {
    pass(`delivery_scripts_root: ${delivery_scripts_root}`);
  } else {
    fail('delivery_scripts_root not set in manifest');
    errors++;
  }
  pass(`config_root: ${config_root}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50));
if (errors === 0) {
  console.log(`${GREEN}${BOLD}All checks passed.${RESET}`);
} else {
  console.log(`${RED}${BOLD}${errors} check(s) failed.${RESET}`);
  process.exit(1);
}
