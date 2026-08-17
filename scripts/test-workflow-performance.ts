import {
  aiWorkflowGeneratorService,
  graphValidator,
  workflowVariableService,
  workflowConditionEvaluator
} from '../src/features/workflow';

async function benchmark() {
  console.log('====================================================');
  console.log('⚡ PHASE 35 WORKFLOW ENGINE PERFORMANCE BENCHMARK');
  console.log('====================================================\n');

  const testGraph = {
    version: 1,
    nodes: [
      { key: 'trigger', type: 'DOCUMENT_UPLOADED', position: { x: 100, y: 100 }, config: {} },
      { key: 'extract', type: 'AI_EXTRACT', position: { x: 100, y: 220 }, config: { schema: { vendor: 'string', amount: 'number' } } },
      { key: 'condition', type: 'CONDITION', position: { x: 100, y: 340 }, config: { expression: 'amount > 50000' } },
      { key: 'summarize', type: 'AI_SUMMARIZE', position: { x: 50, y: 460 }, config: {} },
      { key: 'save', type: 'SAVE_RESULT', position: { x: 100, y: 580 }, config: {} }
    ],
    edges: [
      { source: 'trigger', target: 'extract' },
      { source: 'extract', target: 'condition' },
      { source: 'condition', target: 'summarize', condition: 'YES' },
      { source: 'condition', target: 'save', condition: 'NO' },
      { source: 'summarize', target: 'save' }
    ]
  };

  // 1. Graph Validation Benchmark
  const valStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    graphValidator.validateGraph(testGraph);
  }
  const valDuration = performance.now() - valStart;
  console.log(`✓ 1,000 Graph Topology Validations: ${valDuration.toFixed(2)} ms (${(valDuration / 1000).toFixed(4)} ms/op)`);

  // 2. Variable Interpolation Benchmark
  const varStart = performance.now();
  for (let i = 0; i < 5000; i++) {
    workflowVariableService.interpolate('Hello {{user.name}}, your invoice amount is {{invoice.amount}}.', {
      user: { name: 'Durgesh' },
      invoice: { amount: 75000 }
    });
  }
  const varDuration = performance.now() - varStart;
  console.log(`✓ 5,000 Variable Interpolations: ${varDuration.toFixed(2)} ms (${(varDuration / 5000).toFixed(4)} ms/op)`);

  // 3. Condition Expression Benchmark
  const condStart = performance.now();
  for (let i = 0; i < 5000; i++) {
    workflowConditionEvaluator.evaluateCondition('amount > 50000 AND category == "invoice"', {
      amount: 75000,
      category: 'invoice'
    });
  }
  const condDuration = performance.now() - condStart;
  console.log(`✓ 5,000 Condition Expression Evaluations: ${condDuration.toFixed(2)} ms (${(condDuration / 5000).toFixed(4)} ms/op)`);

  // 4. AI Generation Benchmark
  const aiStart = performance.now();
  const aiGenerated = await aiWorkflowGeneratorService.generateWorkflowFromPrompt('Extract document text and classify as legal or financial');
  const aiDuration = performance.now() - aiStart;
  console.log(`✓ AI Workflow Generation Latency: ${aiDuration.toFixed(2)} ms (${aiGenerated.nodes.length} nodes generated)`);

  console.log('\n====================================================');
  console.log('🎉 WORKFLOW ENGINE BENCHMARK COMPLETE!');
  console.log('====================================================\n');
}

benchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
