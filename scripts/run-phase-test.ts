import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function runPhaseTest() {
  const args = process.argv.slice(2);
  const targetPhaseStr = args[0];

  if (!targetPhaseStr) {
    console.error('Usage: npm run test:phase -- <PHASE_NUMBER_OR_NAME> (e.g. npm run test:phase -- 51)');
    process.exit(1);
  }

  const testsDir = path.join(process.cwd(), 'tests');
  const files = fs.readdirSync(testsDir);

  // Match target phase number e.g. "51", "phase51", "46.1"
  const cleanTarget = targetPhaseStr.replace(/^phase/i, '');
  const matchedFile = files.find((f) => {
    const match = f.match(/^phase(\d+(?:\.\d+)?)-.*\.test\.ts$/);
    return match && match[1] === cleanTarget;
  });

  if (!matchedFile) {
    console.error(`No test file found for phase "${targetPhaseStr}" in tests/`);
    process.exit(1);
  }

  console.log(`[Dynamic Phase Runner] Found test file: tests/${matchedFile}`);
  const isJest = parseFloat(cleanTarget) >= 40 || matchedFile.includes('jest');
  const cmd = isJest ? `npx jest tests/${matchedFile} --forceExit` : `npx tsx tests/${matchedFile}`;

  const proc = spawnSync(cmd, { shell: true, stdio: 'inherit' });
  process.exit(proc.status ?? 0);
}

runPhaseTest();
