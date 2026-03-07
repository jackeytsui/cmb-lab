"use client";

import React, { useCallback, useMemo } from 'react';
import { 
  ReactFlow, 
  Controls, 
  Background, 
  applyNodeChanges, 
  applyEdgeChanges, 
  addEdge, 
  Connection, 
  Edge, 
  Node, 
  NodeChange, 
  EdgeChange,
  MarkerType,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PlayerStep, StepLogic } from '@/types/video-thread-player';
import VideoStepNode from './VideoStepNode';
import LogicNode from './LogicNode';
import StartNode from './StartNode';
import { Button } from '@/components/ui/button';
import { GitFork } from 'lucide-react';
import DeletableEdge from './DeletableEdge';

interface FlowEditorProps {
  steps: PlayerStep[];
  onUpdateStep: (stepId: string, updates: Partial<PlayerStep>) => void;
  onEditStep: (stepId: string) => void;
  onEditLogic: (stepId: string) => void; // New callback for logic nodes
  onAddStep?: (type: 'video' | 'logic') => void;
  onPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: Record<string, any> = {
  startNode: StartNode,
  videoStep: VideoStepNode,
  logicStep: LogicNode,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: Record<string, any> = {
  deletable: DeletableEdge,
};

// Helper to identify logic steps
const isLogicStep = (step: PlayerStep) => {
    // If it has logicRules initialized, it's a logic node
    if (step.logicRules !== undefined && step.logicRules !== null) return true;
    
    // Legacy/Migration check
    if (step.responseType === 'button' && step.responseOptions?.options?.length === 2) {
        const labels = step.responseOptions.options.map(o => o.label.toLowerCase());
        if (labels.includes('true') || labels.includes('yes')) return true;
    }
    return false;
};

function FlowEditorInner({ steps, onUpdateStep, onEditStep, onEditLogic, onAddStep, onPositionsChange }: FlowEditorProps) {
  const { deleteElements } = useReactFlow();

  // Convert steps to nodes
  const nodes: Node[] = useMemo(() => {
    // Determine the "Start" node (lowest sortOrder, or first in array)
    const sortedSteps = [...steps].sort((a, b) => a.sortOrder - b.sortOrder);
    const startStepId = sortedSteps.length > 0 ? sortedSteps[0].id : null;

    return steps.map((step, index) => {
        const isLogic = isLogicStep(step);
        const isStart = step.id === startStepId;

        // Use persisted DB positions; fall back to computed layout for never-saved steps
        const hasPersistedPosition = step.positionX !== 0 || step.positionY !== 150;
        const position = hasPersistedPosition
            ? { x: step.positionX, y: step.positionY }
            : { x: index * 450, y: 150 };

        return {
            id: step.id,
            type: isStart ? 'startNode' : (isLogic ? 'logicStep' : 'videoStep'),
            position,
            data: {
                step,
                index,
                label: step.promptText,
                isSelected: false,
            },
        };
    });
  }, [steps]);

  // Convert logic to edges
  const edges: Edge[] = useMemo(() => {
    const newEdges: Edge[] = [];
    
    steps.forEach((step) => {
      // 1. Logic Node: True output (first rule's destination)
      if (step.logicRules && step.logicRules.length > 0 && isLogicStep(step)) {
          const trueDestination = step.logicRules[0]?.nextStepId;
          if (trueDestination) {
              newEdges.push({
                  id: `e-${step.id}-true-${trueDestination}`,
                  source: step.id,
                  target: trueDestination,
                  sourceHandle: 'true-output',
                  type: 'deletable',
                  animated: true,
                  markerEnd: { type: MarkerType.ArrowClosed },
                  style: { stroke: '#10b981', strokeWidth: 2 },
                  interactionWidth: 20,
              });
          }
      }

      // 2. Fallback Path: Logic nodes use 'false-output', video nodes use 'fallback'
      if (step.fallbackStepId) {
          if (isLogicStep(step)) {
              newEdges.push({
                  id: `e-${step.id}-false-${step.fallbackStepId}`,
                  source: step.id,
                  target: step.fallbackStepId,
                  sourceHandle: 'false-output',
                  type: 'deletable',
                  animated: true,
                  markerEnd: { type: MarkerType.ArrowClosed },
                  style: { stroke: '#f87171', strokeWidth: 2, strokeDasharray: '5,5' },
                  interactionWidth: 20,
              });
          } else {
              newEdges.push({
                  id: `e-${step.id}-fallback-${step.fallbackStepId}`,
                  source: step.id,
                  target: step.fallbackStepId,
                  sourceHandle: 'fallback',
                  type: 'deletable',
                  animated: true,
                  markerEnd: { type: MarkerType.ArrowClosed },
                  style: { stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '5,5' },
                  interactionWidth: 20,
                  label: 'Else',
              });
          }
      }

      // 3. Legacy/Video Step Logic (Video Options)
      // Only process if NOT a logic node (to avoid duplication if we migrate data)
      if (!isLogicStep(step) && step.logic && step.logic.length > 0) {
        step.logic.forEach((rule) => {
          newEdges.push({
            id: `e-${step.id}-${rule.condition}-${rule.nextStepId}`,
            source: step.id,
            target: rule.nextStepId,
            sourceHandle: rule.condition,
            label: (rule.condition !== 'default' && rule.condition !== 'true' && rule.condition !== 'false') ? rule.condition : '',
            type: 'deletable',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#6366f1', strokeWidth: 2 },
            interactionWidth: 20, 
          });
        });
      }
    });
    
    return newEdges;
  }, [steps]);

  // Local state for React Flow
  const [localNodes, setLocalNodes] = React.useState<Node[]>([]);
  const [localEdges, setLocalEdges] = React.useState<Edge[]>([]);

  // Track which nodes the user has dragged (to preserve their positions on re-sync)
  const draggedNodesRef = React.useRef<Set<string>>(new Set());

  // Sync props to local state, preserving user-dragged positions
  const stepIds = useMemo(() => steps.map(s => s.id).join(','), [steps]);
  React.useEffect(() => {
      setLocalNodes(prev => {
          return nodes.map(n => {
              const existing = prev.find(p => p.id === n.id);
              // If user dragged this node, keep the local position
              if (existing && draggedNodesRef.current.has(n.id)) {
                  return { ...n, position: existing.position };
              }
              // Otherwise use the DB position (from nodes useMemo)
              return existing ? { ...n, position: existing.position } : n;
          });
      });
      setLocalEdges(edges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIds, edges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Track which nodes are being dragged
      changes.forEach((c) => {
        if (c.type === 'position' && 'dragging' in c && c.dragging === false) {
          draggedNodesRef.current.add(c.id);
        }
      });

      setLocalNodes((nds) => {
        const updated = applyNodeChanges(changes, nds);

        // Fire onPositionsChange when a drag finishes (dragging === false)
        const hasDragEnd = changes.some(
          (c) => c.type === 'position' && 'dragging' in c && c.dragging === false
        );
        if (hasDragEnd && onPositionsChange) {
          const positions: Record<string, { x: number; y: number }> = {};
          updated.forEach((n) => {
            positions[n.id] = { x: n.position.x, y: n.position.y };
          });
          onPositionsChange(positions);
        }

        return updated;
      });
    },
    [onPositionsChange]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setLocalEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const sourceStepId = params.source;
      const targetStepId = params.target;
      const sourceHandle = params.sourceHandle; // Rule ID, 'fallback', or Option Value

      const sourceStep = steps.find(s => s.id === sourceStepId);
      if (!sourceStep) return;

      // Logic Node Connection (True/False fixed outputs)
      if (isLogicStep(sourceStep)) {
          if (sourceHandle === 'true-output') {
              // Set the first rule's nextStepId (or create one if empty)
              if (sourceStep.logicRules && sourceStep.logicRules.length > 0) {
                  const newRules = sourceStep.logicRules.map((r, idx) =>
                      idx === 0 ? { ...r, nextStepId: targetStepId } : r
                  );
                  onUpdateStep(sourceStepId, { logicRules: newRules });
              } else {
                  // Create a default rule pointing to the target
                  const defaultRule = { id: crypto.randomUUID(), field: '', operator: 'equals' as const, value: '', nextStepId: targetStepId };
                  onUpdateStep(sourceStepId, { logicRules: [defaultRule] });
              }
          } else if (sourceHandle === 'false-output') {
              onUpdateStep(sourceStepId, { fallbackStepId: targetStepId });
          }
          return;
      }

      // Video Node Connection (Legacy)
      const newLogic = sourceStep.logic ? [...sourceStep.logic] : [];
      const condition = sourceHandle || 'default';
      
      const existingIdx = newLogic.findIndex(l => l.condition === condition);
      if (existingIdx >= 0) {
          newLogic[existingIdx] = { condition, nextStepId: targetStepId };
      } else {
          newLogic.push({ condition, nextStepId: targetStepId });
      }

      onUpdateStep(sourceStepId, { logic: newLogic });
    },
    [steps, onUpdateStep],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      deletedEdges.forEach(edge => {
        const sourceStepId = edge.source;
        const sourceHandle = edge.sourceHandle;
        
        const sourceStep = steps.find(s => s.id === sourceStepId);
        if (!sourceStep) return;

        // Logic Node Deletion (True/False fixed outputs)
        if (isLogicStep(sourceStep)) {
            if (sourceHandle === 'true-output') {
                if (sourceStep.logicRules && sourceStep.logicRules.length > 0) {
                    const newRules = sourceStep.logicRules.map((r, idx) =>
                        idx === 0 ? { ...r, nextStepId: '' } : r
                    );
                    onUpdateStep(sourceStepId, { logicRules: newRules });
                }
            } else if (sourceHandle === 'false-output') {
                onUpdateStep(sourceStepId, { fallbackStepId: null } as any);
            }
            return;
        }

        // Video Node Deletion
        if (sourceStep.logic) {
            const condition = sourceHandle || 'default';
            const newLogic = sourceStep.logic.filter(l => l.condition !== condition);
            onUpdateStep(sourceStepId, { logic: newLogic });
        }
      });
    },
    [steps, onUpdateStep]
  );

  // Handle Double Click
  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
      if (node.type === 'logicStep') {
          onEditLogic(node.id);
      } else {
          onEditStep(node.id);
      }
  }, [onEditStep, onEditLogic]);

  return (
    <div className="w-full h-full bg-slate-50 relative">
      <ReactFlow
        nodes={localNodes}
        edges={localEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ interactionWidth: 30 }}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
      >
        <Background />
        <Controls />
        
        <Panel position="top-right" className="bg-white p-2 rounded shadow-sm border border-gray-100">
            <div className="flex flex-col gap-2">
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => onAddStep?.('logic')}
                    className="flex items-center gap-2 text-xs"
                >
                    <GitFork className="w-3 h-3 text-amber-500" />
                    Add Logic
                </Button>
            </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function FlowEditor(props: FlowEditorProps) {
    return (
        <ReactFlowProvider>
            <FlowEditorInner {...props} />
        </ReactFlowProvider>
    );
}
