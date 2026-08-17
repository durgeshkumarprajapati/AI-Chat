import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const templates = [
    {
      id: 'invoice-analyzer',
      name: 'Invoice Analyzer',
      category: 'Financial',
      description: 'Extracts vendor, amount, date from invoices, flags invoices > ₹50,000, and generates summary.',
      definition: {
        version: 1,
        nodes: [
          { key: 'trigger', type: 'DOCUMENT_UPLOADED', position: { x: 100, y: 100 }, config: {} },
          { key: 'extract', type: 'AI_EXTRACT', position: { x: 100, y: 220 }, config: { schema: { vendor: 'string', amount: 'number', date: 'string' } } },
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
      }
    },
    {
      id: 'pdf-summarizer',
      name: 'PDF Summarizer',
      category: 'Document AI',
      description: 'Parses text from uploaded PDF documents and generates structured executive summaries.',
      definition: {
        version: 1,
        nodes: [
          { key: 'trigger', type: 'DOCUMENT_UPLOADED', position: { x: 100, y: 100 }, config: {} },
          { key: 'extract', type: 'EXTRACT_TEXT', position: { x: 100, y: 220 }, config: {} },
          { key: 'summarize', type: 'AI_SUMMARIZE', position: { x: 100, y: 340 }, config: {} },
          { key: 'save', type: 'CREATE_DOCUMENT', position: { x: 100, y: 460 }, config: { filename: 'Executive_Summary.md' } }
        ],
        edges: [
          { source: 'trigger', target: 'extract' },
          { source: 'extract', target: 'summarize' },
          { source: 'summarize', target: 'save' }
        ]
      }
    },
    {
      id: 'document-classifier',
      name: 'Document Classifier',
      category: 'Classification',
      description: 'Classifies uploaded documents into Technical, Financial, or Legal categories.',
      definition: {
        version: 1,
        nodes: [
          { key: 'trigger', type: 'DOCUMENT_UPLOADED', position: { x: 100, y: 100 }, config: {} },
          { key: 'classify', type: 'AI_CLASSIFY', position: { x: 100, y: 220 }, config: { categories: ['technical', 'financial', 'legal'] } },
          { key: 'save', type: 'SAVE_RESULT', position: { x: 100, y: 340 }, config: {} }
        ],
        edges: [
          { source: 'trigger', target: 'classify' },
          { source: 'classify', target: 'save' }
        ]
      }
    },
    {
      id: 'research-assistant',
      name: 'Research Assistant',
      category: 'Autonomous Research',
      description: 'Runs Phase 34 Agentic Research on a topic and saves cited findings.',
      definition: {
        version: 1,
        nodes: [
          { key: 'trigger', type: 'MANUAL', position: { x: 100, y: 100 }, config: {} },
          { key: 'research', type: 'START_RESEARCH', position: { x: 100, y: 220 }, config: { mode: 'STANDARD' } },
          { key: 'summary', type: 'RESEARCH_SUMMARY', position: { x: 100, y: 340 }, config: {} },
          { key: 'save', type: 'CREATE_DOCUMENT', position: { x: 100, y: 460 }, config: { filename: 'Research_Report.md' } }
        ],
        edges: [
          { source: 'trigger', target: 'research' },
          { source: 'research', target: 'summary' },
          { source: 'summary', target: 'save' }
        ]
      }
    }
  ];

  return NextResponse.json({ success: true, data: templates });
}
