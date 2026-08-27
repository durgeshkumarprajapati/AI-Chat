'use client';

// Phase 77: split out of page.tsx so @xyflow/react (the single largest client dependency in
// this codebase, used only on this one page) loads as its own async chunk via next/dynamic in
// the parent, instead of being bundled into the page's initial JS. Rendered output/props/event
// wiring are unchanged from the original inline <ReactFlow> usage.
import { useEffect } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface ArchitectureGraphCanvasProps {
  initialNodes: Node[];
  initialEdges: any[];
  isDarkMode: boolean;
  onNodeSelect: (_node: Node) => void;
}

export default function ArchitectureGraphCanvas({
  initialNodes,
  initialEdges,
  isDarkMode,
  onNodeSelect
}: ArchitectureGraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => onNodeSelect(node)}
      fitView
    >
      <Background color={isDarkMode ? '#334155' : '#cbd5e1'} gap={16} size={1} />
      <Controls />
      <MiniMap
        nodeColor={() => (isDarkMode ? '#6366f1' : '#3b82f6')}
        maskColor={isDarkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.7)'}
      />
    </ReactFlow>
  );
}
