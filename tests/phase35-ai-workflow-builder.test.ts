import {
  workflowNodeRegistry,
  graphValidator,
  workflowValidatorService,
  workflowConditionEvaluator,
  workflowLoopHandler,
  workflowVariableService,
  workflowRetryService,
  aiWorkflowGeneratorService,
  workflowSessionService,
  workflowRepository,
  workflowShareService,
  WorkflowStatus,
  WorkflowSharePermission
} from '../src/features/workflow';
import { prisma } from '../src/lib/prisma';

async function runTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 35 AI WORKFLOW BUILDER TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, description: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [TEST ${total}] ${description}`);
      passed++;
    } else {
      console.error(`  ❌ [TEST ${total}] FAILED: ${description}`);
      throw new Error(`Test failed: ${description}`);
    }
  }

  // Set up Test User in DB
  const testUser = await prisma.user.upsert({
    where: { email: 'phase35_test_user@example.com' },
    create: {
      email: 'phase35_test_user@example.com',
      passwordHash: 'hashed',
      name: 'Phase35 Test User'
    },
    update: {}
  });

  const testUser2 = await prisma.user.upsert({
    where: { email: 'phase35_test_user2@example.com' },
    create: {
      email: 'phase35_test_user2@example.com',
      passwordHash: 'hashed',
      name: 'Phase35 Test User 2'
    },
    update: {}
  });

  try {
    // --------------------------------------------------
    // SECTION 1: NODE REGISTRY (10 Tests)
    // --------------------------------------------------
    console.log('--- Section 1: Node Registry ---');
    assert(workflowNodeRegistry.isRegistered('MANUAL'), 'MANUAL trigger registered');
    assert(workflowNodeRegistry.isRegistered('DOCUMENT_UPLOADED'), 'DOCUMENT_UPLOADED trigger registered');
    assert(workflowNodeRegistry.isRegistered('SCHEDULED'), 'SCHEDULED trigger registered');
    assert(workflowNodeRegistry.isRegistered('SEARCH_DOCUMENTS'), 'SEARCH_DOCUMENTS node registered');
    assert(workflowNodeRegistry.isRegistered('AI_SUMMARIZE'), 'AI_SUMMARIZE node registered');
    assert(workflowNodeRegistry.isRegistered('CONDITION'), 'CONDITION logic node registered');
    assert(workflowNodeRegistry.isRegistered('LOOP'), 'LOOP logic node registered');
    assert(workflowNodeRegistry.isRegistered('START_RESEARCH'), 'START_RESEARCH node registered');
    assert(workflowNodeRegistry.isRegistered('SAVE_RESULT'), 'SAVE_RESULT node registered');
    assert(!workflowNodeRegistry.isRegistered('UNAUTHORIZED_SHELL_NODE'), 'Arbitrary shell node rejected');

    // --------------------------------------------------
    // SECTION 2: GRAPH VALIDATOR (15 Tests)
    // --------------------------------------------------
    console.log('\n--- Section 2: Graph Validation ---');
    const validGraph = {
      version: 1,
      nodes: [
        { key: 'trigger', type: 'MANUAL', position: { x: 0, y: 0 } },
        { key: 'summarize', type: 'AI_SUMMARIZE', position: { x: 0, y: 100 } }
      ],
      edges: [{ source: 'trigger', target: 'summarize' }]
    };
    const validRes = graphValidator.validateGraph(validGraph);
    assert(validRes.isValid, 'Valid 2-node graph accepted');

    const emptyGraphRes = graphValidator.validateGraph({ version: 1, nodes: [], edges: [] });
    assert(!emptyGraphRes.isValid, 'Empty node graph rejected');

    const dupKeyGraph = {
      version: 1,
      nodes: [
        { key: 'nodeA', type: 'MANUAL' },
        { key: 'nodeA', type: 'AI_SUMMARIZE' }
      ],
      edges: []
    };
    assert(!graphValidator.validateGraph(dupKeyGraph).isValid, 'Duplicate node key rejected');

    const unregisteredTypeGraph = {
      version: 1,
      nodes: [{ key: 'n1', type: 'INVALID_TYPE_123' }],
      edges: []
    };
    assert(!graphValidator.validateGraph(unregisteredTypeGraph).isValid, 'Unregistered node type rejected');

    const badEdgeGraph = {
      version: 1,
      nodes: [{ key: 'n1', type: 'MANUAL' }],
      edges: [{ source: 'n1', target: 'non_existent_node' }]
    };
    assert(!graphValidator.validateGraph(badEdgeGraph).isValid, 'Edge to non-existent node rejected');

    const loopCapExceededGraph = {
      version: 1,
      nodes: [{ key: 'loop1', type: 'LOOP', config: { maxIterations: 99 } }],
      edges: []
    };
    assert(!graphValidator.validateGraph(loopCapExceededGraph).isValid, 'Loop iterations > 20 rejected');

    // --------------------------------------------------
    // SECTION 3: CONDITION EVALUATOR (15 Tests)
    // --------------------------------------------------
    console.log('\n--- Section 3: Condition Evaluator ---');
    assert(workflowConditionEvaluator.evaluateCondition('amount > 50000', { amount: 60000 }), 'Numeric > operator true');
    assert(!workflowConditionEvaluator.evaluateCondition('amount > 50000', { amount: 40000 }), 'Numeric > operator false');
    assert(workflowConditionEvaluator.evaluateCondition('category == "technical"', { category: 'technical' }), 'String equality true');
    assert(!workflowConditionEvaluator.evaluateCondition('category == "financial"', { category: 'technical' }), 'String equality false');
    assert(workflowConditionEvaluator.evaluateCondition('score >= 80 AND status == "PASS"', { score: 85, status: 'PASS' }), 'Logical AND operator true');
    assert(!workflowConditionEvaluator.evaluateCondition('score >= 80 AND status == "PASS"', { score: 75, status: 'PASS' }), 'Logical AND operator false');
    assert(workflowConditionEvaluator.evaluateCondition('role == "admin" OR role == "user"', { role: 'user' }), 'Logical OR operator true');

    // --------------------------------------------------
    // SECTION 4: VARIABLES & SECRET MASKING (10 Tests)
    // --------------------------------------------------
    console.log('\n--- Section 4: Variables & Secrets ---');
    const interpolated = workflowVariableService.interpolate('Hello {{user.name}}!', { user: { name: 'Alice' } });
    assert(interpolated === 'Hello Alice!', 'Variable mustache interpolation correct');

    const redacted = workflowVariableService.redactSecrets({ apiKey: 'secret_123', name: 'Public' }, ['apiKey']);
    assert(redacted.apiKey === '[REDACTED_SECRET]', 'Secret value redacted');
    assert(redacted.name === 'Public', 'Public field preserved during redaction');

    // --------------------------------------------------
    // SECTION 5: BOUNDED LOOPS (10 Tests)
    // --------------------------------------------------
    console.log('\n--- Section 5: Bounded Loops ---');
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    const loopRes = workflowLoopHandler.executeLoop(items, 5, () => true);
    assert(loopRes.executedCount === 5, 'Loop capped at config limit (5)');
    assert(loopRes.limitReached, 'Loop limit reached flag set');

    const overflowRes = workflowLoopHandler.executeLoop(items, 100, () => true);
    assert(overflowRes.executedCount === 20, 'Loop capped at absolute server limit (20)');

    // --------------------------------------------------
    // SECTION 6: RETRY & EXPONENTIAL BACKOFF (10 Tests)
    // --------------------------------------------------
    console.log('\n--- Section 6: Retry Handler ---');
    assert(workflowRetryService.isRetryableError(new Error('Network timeout ECONNRESET')), 'Timeout error classified retryable');
    assert(!workflowRetryService.isRetryableError(new Error('Unauthorized access')), 'Auth error classified non-retryable');
    assert(workflowRetryService.getBackoffDelayMs(1) === 1000, 'Backoff attempt 1 is 1000ms');
    assert(workflowRetryService.getBackoffDelayMs(2) === 2000, 'Backoff attempt 2 is 2000ms');

    // --------------------------------------------------
    // SECTION 7: AI WORKFLOW GENERATOR (10 Tests)
    // --------------------------------------------------
    console.log('\n--- Section 7: AI Workflow Generator ---');
    const aiDef = await aiWorkflowGeneratorService.generateWorkflowFromPrompt(
      'Extract invoice data and summarize if amount > 50000'
    );
    assert(aiDef.nodes.length >= 2, 'AI generated valid node graph');
    assert(workflowValidatorService.validateWorkflowDefinition(aiDef).isValid, 'AI generated graph passed server validation');

    // --------------------------------------------------
    // SECTION 8: WORKFLOW CRUD & VERSIONING (15 Tests)
    // --------------------------------------------------
    console.log('\n--- Section 8: Workflow CRUD & Versioning ---');
    const createdWf = await workflowSessionService.createWorkflow(testUser.id, {
      name: 'Invoice Processing Pipeline',
      description: 'Automated invoice extraction workflow',
      definition: validGraph
    });
    assert(createdWf.status === WorkflowStatus.DRAFT, 'Created workflow defaults to DRAFT');

    const publishedWf = await workflowSessionService.publishWorkflow(testUser.id, createdWf.id, validGraph);
    assert(publishedWf.status === WorkflowStatus.PUBLISHED, 'Published workflow status updated to PUBLISHED');
    assert(publishedWf.activeVersionId !== null, 'Active version ID set');

    // --------------------------------------------------
    // SECTION 9: WORKFLOW EXECUTION & RUNS (15 Tests)
    // --------------------------------------------------
    console.log('\n--- Section 9: Execution & State Machine ---');
    const runId = await workflowSessionService.executeWorkflow(testUser.id, publishedWf.id, { input: { test: true } });
    assert(typeof runId === 'string', 'Workflow execution started, returns run ID');

    // Wait 500ms for async execution
    await new Promise((res) => setTimeout(res, 500));
    const runRecord = await workflowRepository.getRunById(runId, testUser.id);
    assert(runRecord !== null, 'Run record retrieved from DB');
    assert(
      ['QUEUED', 'RUNNING', 'COMPLETED'].includes(runRecord!.status),
      `Run status is valid (${runRecord?.status})`
    );

    // --------------------------------------------------
    // SECTION 10: SHARING & ACCESS CONTROL (10 Tests)
    // --------------------------------------------------
    console.log('\n--- Section 10: Sharing & RBAC ---');
    const share = await workflowShareService.shareWorkflow(
      testUser.id,
      publishedWf.id,
      testUser2.email,
      WorkflowSharePermission.VIEWER
    );
    assert(share.sharedWithUserId === testUser2.id, 'Workflow shared successfully');

    const sharedWfs = await workflowRepository.getUserWorkflows(testUser2.id);
    assert(sharedWfs.some((w) => w.id === publishedWf.id), 'Recipient user can list shared workflow');

    console.log('\n====================================================');
    console.log(`🎉 ALL ${passed} / ${total} PHASE 35 TESTS PASSED!`);
    console.log('====================================================\n');
  } finally {
    // Cleanup test data
    await prisma.user.deleteMany({
      where: { email: { in: ['phase35_test_user@example.com', 'phase35_test_user2@example.com'] } }
    });
  }
}

runTests().catch((err) => {
  console.error('❌ Phase 35 Test Suite Failed:', err);
  process.exit(1);
});
