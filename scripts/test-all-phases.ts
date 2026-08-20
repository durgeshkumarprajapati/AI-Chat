import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface DiscoveredPhase {
  phaseNum: number;
  fileName: string;
  name: string;
  command: string;
}

function discoverPhaseTestFiles(): DiscoveredPhase[] {
  const testsDir = path.join(process.cwd(), 'tests');
  if (!fs.existsSync(testsDir)) return [];

  const files = fs.readdirSync(testsDir);
  const phaseFiles = files.filter((f) => /^phase\d+(\.\d+)?-.*\.test\.ts$/.test(f));

  const list: DiscoveredPhase[] = phaseFiles.map((file) => {
    const match = file.match(/^phase(\d+(?:\.\d+)?)-(.*)\.test\.ts$/);
    const phaseNum = match ? parseFloat(match[1]!) : 0;
    const rawName = match ? match[2]!.replace(/-/g, ' ') : file;
    const formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    // Determine runner: Jest for phase >= 40, tsx for earlier phases unless Jest suited
    const isJest = phaseNum >= 40 || file.includes('jest');
    const command = isJest
      ? `npx jest tests/${file} --forceExit`
      : `npx tsx tests/${file}`;

    return {
      phaseNum,
      fileName: file,
      name: formattedName,
      command
    };
  });

  // Sort deterministically by numerical phase number
  return list.sort((a, b) => a.phaseNum - b.phaseNum);
}

async function runAllPhases() {
  console.log('====================================================');
  console.log('DOCUMENT AI RAG PLATFORM — DYNAMIC REGRESSION SUITE');
  console.log('====================================================\n');

  const phases = discoverPhaseTestFiles();
  console.log(`[Dynamic Discovery] Found ${phases.length} phase test files in tests/\n`);

  const startTime = Date.now();
  const results: Array<{ phaseNum: number; name: string; fileName: string; passed: boolean; durationMs: number }> = [];
  let totalFailed = 0;

  for (const item of phases) {
    const phaseStart = Date.now();
    console.log(`[Running Phase ${item.phaseNum}: ${item.name} (${item.fileName})]...`);

    const proc = spawnSync(item.command, { shell: true, stdio: 'inherit' });
    const durationMs = Date.now() - phaseStart;

    if (proc.status === 0) {
      console.log(`  ✅ Phase ${item.phaseNum} PASSED (${(durationMs / 1000).toFixed(1)}s)\n`);
      results.push({ phaseNum: item.phaseNum, name: item.name, fileName: item.fileName, passed: true, durationMs });
    } else {
      console.error(`  ❌ Phase ${item.phaseNum} FAILED with exit code ${proc.status}\n`);
      results.push({ phaseNum: item.phaseNum, name: item.name, fileName: item.fileName, passed: false, durationMs });
      totalFailed++;
      break; // Stop on first failure as required
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('====================================================');
  console.log('UNIVERSAL DYNAMIC REGRESSION TEST SUMMARY');
  console.log('====================================================');
  for (const r of results) {
    console.log(`Phase ${r.phaseNum.toString().padStart(4, ' ')} (${r.name}): ${r.passed ? '✅ PASSED' : '❌ FAILED'} (${(r.durationMs / 1000).toFixed(1)}s)`);
  }

  console.log('\n====================================================');
  console.log(`RESULT: Passed: ${results.filter((r) => r.passed).length} / Total Executed: ${results.length}`);
  console.log(`Total Time Elapsed: ${totalTime}s`);

  if (totalFailed > 0 || results.length < phases.length) {
    console.error('\n❌ REGRESSION SUITE FAILED!');
    console.log('====================================================\n');
    process.exit(1);
  } else {
    console.log(`\n🎉 ALL ${phases.length} PHASES PASSED CLEANLY!`);
    console.log('====================================================\n');
    process.exit(0);
  }
}

runAllPhases();
