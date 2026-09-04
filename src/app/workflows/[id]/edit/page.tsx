'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function VisualWorkflowEditorPage({ params }: { params: { id: string } }) {
  const [workflow, setWorkflow] = useState<any>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [validationResult, setValidationResult] = useState<{ isValid?: boolean; errors?: string[]; warnings?: string[] } | null>(null);
  const [newNodeType, setNewNodeType] = useState('AI_SUMMARIZE');

  useEffect(() => {
    fetchWorkflow();
  }, [params.id]);

  const fetchWorkflow = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/workflows/${params.id}`).then((r) => r.json());
      if (res.success && res.data) {
        setWorkflow(res.data);
        const activeVer = res.data.versions?.[0];
        if (activeVer?.definition) {
          setNodes(activeVer.definition.nodes || []);
          setEdges(activeVer.definition.edges || []);
        }
      }
    } catch {
      console.error('Failed to load workflow.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNode = () => {
    const key = `node_${Date.now()}`;
    const newNode = {
      key,
      type: newNodeType,
      position: { x: 100 + nodes.length * 20, y: 100 + nodes.length * 80 },
      config: {}
    };

    setNodes([...nodes, newNode]);

    // Automatically connect previous node to new node if edges exist
    if (nodes.length > 0) {
      const prevKey = nodes[nodes.length - 1].key;
      setEdges([...edges, { source: prevKey, target: key }]);
    }
    setSelectedNodeKey(key);
  };

  const handleDeleteNode = (key: string) => {
    setNodes(nodes.filter((n) => n.key !== key));
    setEdges(edges.filter((e) => e.source !== key && e.target !== key));
    if (selectedNodeKey === key) setSelectedNodeKey(null);
  };

  const handleValidate = async () => {
    try {
      const res = await fetch(`/api/workflows/${params.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition: { version: 1, nodes, edges } })
      });
      const data = await res.json();
      if (data.success) {
        setValidationResult(data.data);
      }
    } catch {
      setValidationResult({ isValid: false, errors: ['Validation server error.'] });
    }
  };

  const handlePublish = async () => {
    try {
      setPublishing(true);
      const res = await fetch(`/api/workflows/${params.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition: { version: 1, nodes, edges } })
      });
      const data = await res.json();
      if (data.success) {
        alert('Workflow published successfully! Created new immutable version.');
        fetchWorkflow();
      } else {
        alert(data.error || 'Publish failed.');
      }
    } catch {
      alert('Publish failed.');
    } finally {
      setPublishing(false);
    }
  };

  const selectedNode = nodes.find((n) => n.key === selectedNodeKey);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading visual canvas...</div>;

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      {/* Top Action Header */}
      <div className="p-4 border-b flex flex-wrap gap-3 justify-between items-center bg-white dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <Link href={`/workflows/${params.id}`} className="text-xs text-gray-500 hover:underline flex-shrink-0">
            ← Back to Details
          </Link>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">
            {workflow?.name || 'Workflow Editor'}
          </h1>
          <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded font-mono flex-shrink-0">
            {nodes.length} Nodes, {edges.length} Edges
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleValidate}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 rounded"
          >
            🔍 Validate Graph
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow disabled:opacity-50"
          >
            {publishing ? 'Publishing...' : '🚀 Publish Version'}
          </button>
        </div>
      </div>

      {validationResult && (
        <div
          className={`p-3 text-xs border-b ${
            validationResult.isValid
              ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300'
          }`}
        >
          {validationResult.isValid ? (
            <span>✓ Workflow graph structure is VALID!</span>
          ) : (
            <span>❌ Graph Validation Errors: {validationResult.errors?.join('; ')}</span>
          )}
        </div>
      )}

      {/* Main Canvas Body */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden">
        {/* Left Node Palette Sidebar */}
        <div className="w-full lg:w-64 lg:shrink-0 border-b lg:border-b-0 lg:border-r p-4 bg-gray-50 dark:bg-gray-900 space-y-4 lg:overflow-y-auto">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Node Palette</h2>

          <div className="space-y-2">
            <label className="text-xs font-medium">Select Node Type</label>
            <select
              value={newNodeType}
              onChange={(e) => setNewNodeType(e.target.value)}
              className="w-full text-xs p-2 border rounded dark:bg-gray-800"
            >
              <optgroup label="Triggers">
                <option value="MANUAL">Manual Trigger</option>
                <option value="DOCUMENT_UPLOADED">Document Uploaded</option>
                <option value="SCHEDULED">Scheduled Trigger</option>
              </optgroup>
              <optgroup label="Data & RAG">
                <option value="GET_DOCUMENT">Get Document</option>
                <option value="SEARCH_DOCUMENTS">Search Documents (RAG)</option>
                <option value="SEARCH_KNOWLEDGE_BASE">Search KB</option>
                <option value="WEB_SEARCH">Web Search</option>
              </optgroup>
              <optgroup label="AI Operations">
                <option value="AI_ANSWER">AI Answer</option>
                <option value="AI_EXTRACT">AI Extract</option>
                <option value="AI_CLASSIFY">AI Classify</option>
                <option value="AI_SUMMARIZE">AI Summarize</option>
              </optgroup>
              <optgroup label="Logic">
                <option value="CONDITION">Condition (If/Else)</option>
                <option value="LOOP">Loop (For Each)</option>
              </optgroup>
              <optgroup label="Output">
                <option value="SAVE_RESULT">Save Result</option>
                <option value="CREATE_DOCUMENT">Create Document</option>
              </optgroup>
            </select>

            <button
              onClick={handleAddNode}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded transition"
            >
              + Add Node to Canvas
            </button>
          </div>
        </div>

        {/* Center Node Visual Canvas */}
        <div className="flex-1 bg-gray-100 dark:bg-gray-950 p-4 sm:p-6 lg:overflow-auto relative space-y-6 min-w-0">
          <div className="flex flex-col items-center gap-6">
            {nodes.map((n, idx) => (
              <div key={n.key} className="flex flex-col items-center w-full">
                <div
                  onClick={() => setSelectedNodeKey(n.key)}
                  className={`w-full max-w-72 p-4 bg-white dark:bg-gray-900 border-2 rounded-xl shadow cursor-pointer transition relative ${
                    selectedNodeKey === n.key
                      ? 'border-indigo-600 ring-2 ring-indigo-300'
                      : 'border-gray-200 dark:border-gray-800'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono">{n.key}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNode(n.key);
                      }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="font-semibold text-sm text-gray-900 dark:text-white">{n.type}</div>
                  <div className="text-xs text-gray-400 truncate mt-1">
                    {JSON.stringify(n.config || {})}
                  </div>
                </div>

                {idx < nodes.length - 1 && (
                  <div className="my-2 flex flex-col items-center">
                    <div className="w-0.5 h-6 bg-indigo-400"></div>
                    <div className="text-xs text-indigo-500 font-bold">↓</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Configuration Inspector Panel */}
        {selectedNode && (
          <div className="w-full lg:w-80 lg:shrink-0 border-t lg:border-t-0 lg:border-l p-4 bg-white dark:bg-gray-900 space-y-4 lg:overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm">Node Configuration</h3>
              <span className="text-xs font-mono text-indigo-600">{selectedNode.key}</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-500 mb-1">Node Type</label>
                <input type="text" value={selectedNode.type} readOnly className="w-full p-2 border rounded bg-gray-100 dark:bg-gray-800" />
              </div>

              <div>
                <label className="block text-gray-500 mb-1">Configuration (JSON)</label>
                <textarea
                  rows={6}
                  value={JSON.stringify(selectedNode.config || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const cfg = JSON.parse(e.target.value);
                      setNodes(nodes.map((n) => (n.key === selectedNode.key ? { ...n, config: cfg } : n)));
                    } catch {}
                  }}
                  className="w-full p-2 border rounded font-mono dark:bg-gray-800"
                />
              </div>

              <button
                onClick={() => handleDeleteNode(selectedNode.key)}
                className="w-full py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-xs"
              >
                Delete Selected Node
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
