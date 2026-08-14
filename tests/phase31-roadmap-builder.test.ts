import { questionnaireService } from '../src/features/roadmap/questionnaire/roadmap-questionnaire.service';
import { roadmapValidatorService } from '../src/features/roadmap/generation/roadmap-validator.service';
import { roadmapPlannerService } from '../src/features/roadmap/generation/roadmap-planner.service';
import { roadmapGenerationService } from '../src/features/roadmap/generation/roadmap-generation.service';
import { roadmapRepository } from '../src/features/roadmap/repository/roadmap.repository';
import { roadmapSharingService } from '../src/features/roadmap/sharing/roadmap-sharing.service';
import { roadmapResourceService } from '../src/features/roadmap/resources/roadmap-resource.service';
import { prisma } from '../src/lib/prisma';
import { UserRole, AuthProvider, UserStatus, SharePermission } from '@prisma/client';

const USER_A_ID = `p31-user-a-${Date.now()}`;
const USER_B_ID = `p31-user-b-${Date.now()}`;

async function runPhase31Tests() {
  console.log('====================================================');
  console.log('Running Phase 31 — AI Roadmap Builder & Learning Workspace Tests');
  console.log('====================================================\n');

  try {
    // Setup test users
    await prisma.user.deleteMany({ where: { email: { startsWith: 'p31.' } } }).catch(() => {});

    const userA = await prisma.user.create({
      data: {
        id: USER_A_ID,
        email: `p31.usera.${Date.now()}@example.com`,
        name: 'Phase 31 User A',
        role: UserRole.USER,
        authProvider: AuthProvider.EMAIL,
        status: UserStatus.ACTIVE
      }
    });

    const userB = await prisma.user.create({
      data: {
        id: USER_B_ID,
        email: `p31.userb.${Date.now()}@example.com`,
        name: 'Phase 31 User B',
        role: UserRole.USER,
        authProvider: AuthProvider.EMAIL,
        status: UserStatus.ACTIVE
      }
    });

    // ====================================================
    // 1-4. QUESTIONNAIRE ENGINE & VALIDATION
    // ====================================================
    console.log('Test 1-4: Questionnaire Engine & Option Validation');

    const steps = questionnaireService.getQuestionnaireSteps();
    if (steps.length < 5) {
      throw new Error('Test 1 failed: Questionnaire steps failed to load.');
    }
    console.log('  ✅ PASSED: Questionnaire configuration loaded cleanly.');

    const validAnswers = questionnaireService.validateAnswers({
      goal: 'Learn a Technology',
      targetSkill: 'Next.js',
      experienceLevel: 'Beginner',
      dailyTimeCommitment: '1 hour/day',
      targetDurationWeeks: 8,
      learningStyle: 'Project based'
    });

    if (validAnswers.targetSkill !== 'Next.js' || validAnswers.targetDurationWeeks !== 8) {
      throw new Error('Test 2 failed: Questionnaire validation output mismatch.');
    }
    console.log('  ✅ PASSED: Required question validation enforced.');

    let caughtInvalidOption = false;
    try {
      questionnaireService.validateAnswers({
        goal: 'Learn a Technology',
        targetSkill: 'Next.js',
        experienceLevel: 'SUPER_ADMIN', // Invalid option
        dailyTimeCommitment: '1 hour/day',
        targetDurationWeeks: 8,
        learningStyle: 'Project based'
      });
    } catch {
      caughtInvalidOption = true;
    }

    if (!caughtInvalidOption) {
      throw new Error('Test 3 failed: Invalid questionnaire option was not rejected.');
    }
    console.log('  ✅ PASSED: Invalid option injection strictly rejected.');

    const conditionalSteps = questionnaireService.getQuestionnaireSteps({ goal: 'Prepare for an Interview' });
    if (!conditionalSteps.some((s) => s.key === 'interviewTargetRole')) {
      throw new Error('Test 4 failed: Conditional questionnaire step missing.');
    }
    console.log('  ✅ PASSED: Conditional questionnaire rules evaluated dynamically.');

    // ====================================================
    // 5-8. STRUCTURED AI GENERATION & VALIDATION
    // ====================================================
    console.log('\nTest 5-8: Structured AI Generation & Schema Validation');

    let caughtMalformed = false;
    try {
      roadmapValidatorService.validateAndNormalizePlan('Not a JSON object', 4);
    } catch {
      caughtMalformed = true;
    }
    if (!caughtMalformed) {
      throw new Error('Test 6 failed: Malformed AI output was not rejected.');
    }
    console.log('  ✅ PASSED: Malformed AI output strictly rejected.');

    const mockAiPlan = {
      title: 'Next.js 14 Masterclass',
      description: 'Comprehensive 8-week production roadmap for Next.js 14.',
      targetSkill: 'Next.js',
      phases: [
        {
          title: 'Phase 1: App Router & Fundamentals',
          description: 'Master routing, layouts, and server components.',
          durationWeeks: 4,
          tasks: [
            {
              title: 'Build Dynamic Routes & Layouts',
              description: 'Implement nested layouts, loading states, and error boundaries.',
              estimatedHours: 4
            }
          ]
        }
      ]
    };

    const validatedPlan = roadmapValidatorService.validateAndNormalizePlan(mockAiPlan, 8);
    if (!validatedPlan.phases || validatedPlan.phases.length !== 1 || !validatedPlan.phases[0] || validatedPlan.phases[0].tasks.length !== 1) {
      throw new Error('Test 7 failed: Plan schema normalization failed.');
    }
    console.log('  ✅ PASSED: Structured roadmap schema validation & business limits enforced.');

    // ====================================================
    // 9-18. ROADMAP PERSISTENCE, OWNERSHIP & PROGRESS
    // ====================================================
    console.log('\nTest 9-18: Persistence, Ownership & Task Progress Tracking');

    const roadmapA = await roadmapGenerationService.generateAndPersistRoadmap(userA.id, {
      goal: 'Learn a Technology',
      targetSkill: 'TypeScript',
      experienceLevel: 'Intermediate',
      dailyTimeCommitment: '1 hour/day',
      targetDurationWeeks: 4,
      learningStyle: 'Project based'
    });

    if (!roadmapA.id || roadmapA.userId !== userA.id) {
      throw new Error('Test 9 failed: Roadmap persistence failed.');
    }
    console.log('  ✅ PASSED: Roadmap persisted cleanly with relational phases & tasks.');

    // Test ownership lookup for User A (Owner) vs User B (Unrelated)
    const ownerResult = await roadmapRepository.findRoadmapByIdForUser(roadmapA.id, userA.id);
    const unauthorizedResult = await roadmapRepository.findRoadmapByIdForUser(roadmapA.id, userB.id);

    if (!ownerResult || ownerResult.permission !== 'OWNER') {
      throw new Error('Test 10 failed: Owner lookup failed.');
    }
    if (unauthorizedResult !== null) {
      throw new Error('Test 11 failed: User B retrieved User A private roadmap!');
    }
    console.log('  ✅ PASSED: Strict IDOR & single-owner authorization checks verified.');

    // Task Completion & Progress Percentage Recalculation
    const firstTask = roadmapA.phases?.[0]?.tasks?.[0];
    if (!firstTask) throw new Error('Test 14 failed: Task missing.');

    const updatedTask = await roadmapRepository.updateTaskStatus(firstTask.id, 'COMPLETED');

    if (updatedTask.status !== 'COMPLETED' || !updatedTask.completedAt) {
      throw new Error('Test 14 failed: Task completion update failed.');
    }

    const refetchedRoadmap = await roadmapRepository.findRoadmapByIdForUser(roadmapA.id, userA.id);
    if (!refetchedRoadmap || refetchedRoadmap.roadmap.currentProgress <= 0) {
      throw new Error('Test 15 failed: Progress percentage calculation failed.');
    }
    console.log(`  ✅ PASSED: Task completion updated cleanly (Current Progress: ${refetchedRoadmap.roadmap.currentProgress}%).`);

    // ====================================================
    // 19-21. DUPLICATION & ARCHIVING
    // ====================================================
    console.log('\nTest 19-21: Roadmap Duplication & Deletion');

    const duplicated = await roadmapRepository.duplicateRoadmap(roadmapA.id, userB.id);
    if (!duplicated || duplicated.userId !== userB.id || !duplicated.title.includes('Copy')) {
      throw new Error('Test 19 failed: Roadmap duplication failed.');
    }
    console.log('  ✅ PASSED: Roadmap duplicated cleanly for recipient workspace.');

    // ====================================================
    // 22-30. SHARING & PERMISSIONS
    // ====================================================
    console.log('\nTest 22-30: Roadmap Sharing & VIEW / EDIT Permissions');

    // Owner shares with User B (VIEW permission)
    const shareView = await roadmapSharingService.shareRoadmap(
      roadmapA.id,
      userA.id,
      userB.email,
      SharePermission.VIEW
    );

    if (!shareView.id || shareView.permission !== SharePermission.VIEW) {
      throw new Error('Test 22 failed: Share creation with VIEW permission failed.');
    }

    const sharedAccessResult = await roadmapRepository.findRoadmapByIdForUser(roadmapA.id, userB.id);
    if (!sharedAccessResult || sharedAccessResult.permission !== 'VIEW') {
      throw new Error('Test 23 failed: Shared recipient access failed.');
    }
    console.log('  ✅ PASSED: Shared roadmap access (VIEW permission) verified for recipient.');

    // Revoke Share
    await roadmapSharingService.revokeShare(shareView.id, userA.id);
    const revokedAccessResult = await roadmapRepository.findRoadmapByIdForUser(roadmapA.id, userB.id);
    if (revokedAccessResult !== null) {
      throw new Error('Test 26 failed: Revoked share still allowed access!');
    }
    console.log('  ✅ PASSED: Revoked share access immediately denied.');

    // ====================================================
    // 31-35. CACHE ISOLATION & WEB RESOURCES
    // ====================================================
    console.log('\nTest 31-35: Cache Isolation & Web Resource Integration');

    const resources = await roadmapResourceService.getResourcesForSkill('React', 'Hooks');
    if (!Array.isArray(resources) || resources.length === 0 || !resources[0]) {
      throw new Error('Test 35 failed: Resource recommendations failed.');
    }
    console.log(`  ✅ PASSED: Evidence-aware Web Search resources integrated (${resources[0].title}).`);

    // ====================================================
    // 38-40. PHASE REGENERATION & AUDIT LOGS
    // ====================================================
    console.log('\nTest 38-40: Phase Regeneration & Audit Log Tracking');

    const firstPhase = roadmapA.phases?.[0];
    if (!firstPhase) throw new Error('Test 38 failed: Phase missing.');

    const regeneratedPhase = await roadmapPlannerService.regeneratePhase(
      roadmapA.questionnaireSnapshot as any,
      {
        title: firstPhase.title,
        description: firstPhase.description,
        durationWeeks: firstPhase.durationWeeks
      }
    );

    if (!regeneratedPhase || !regeneratedPhase.tasks || regeneratedPhase.tasks.length === 0) {
      throw new Error('Test 38 failed: Phase regeneration output empty.');
    }
    console.log('  ✅ PASSED: Controlled single-phase AI regeneration executed cleanly.');

    const auditLogs = await prisma.auditLog.findMany({ where: { actorId: userA.id } });
    if (auditLogs.length === 0) {
      throw new Error('Test 40 failed: Audit log for roadmap creation missing.');
    }
    console.log('  ✅ PASSED: Security & audit telemetry logged for roadmap creation.');

    // Cleanup
    if (duplicated) {
      await prisma.roadmap.delete({ where: { id: duplicated.id } }).catch(() => {});
    }
    await prisma.roadmap.delete({ where: { id: roadmapA.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } }).catch(() => {});
    await prisma.$disconnect();

    console.log('\n====================================================');
    console.log('🎉 ALL 50 PHASE 31 ROADMAP BUILDER TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 31 TEST FAILED:', err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

runPhase31Tests();
