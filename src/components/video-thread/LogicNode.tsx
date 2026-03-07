import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitFork } from 'lucide-react';
import { PlayerStep } from '@/types/video-thread-player';

interface LogicNodeData {
    step: PlayerStep;
    isSelected: boolean;
    label: string;
}

const LogicNode = ({ data }: NodeProps<any>) => {
    const { step } = data as LogicNodeData;
    const rules = step.logicRules || [];
    const hasRules = rules.length > 0;

    return (
        <div className={`
            w-[220px] bg-white rounded-xl shadow-lg border-2 overflow-visible transition-all
            ${data.isSelected ? 'border-amber-500 ring-4 ring-amber-500/20' : 'border-amber-200 hover:border-amber-300'}
        `}>
            {/* Input Handle (Left) */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-[30px] !h-[30px] !bg-transparent !border-0 cursor-crosshair z-50"
            >
                <div className="w-3.5 h-3.5 bg-amber-500 border-2 border-white rounded-full shadow-sm pointer-events-none" />
            </Handle>

            {/* Diamond accent / Header */}
            <div className="bg-amber-50 p-3 border-b border-amber-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center rotate-45">
                    <GitFork className="w-4 h-4 -rotate-45" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">Logic</div>
                    <div className="text-[10px] text-amber-600 truncate">
                        {step.promptText || "Condition Check"}
                    </div>
                </div>
            </div>

            {/* Rule Summary (non-interactive, just info) */}
            <div className="p-3 text-xs text-gray-700">
                {hasRules ? (
                    <span className="font-medium">{rules.length} rule{rules.length !== 1 ? 's' : ''} configured</span>
                ) : (
                    <span className="italic text-gray-500">No rules — double-click to configure</span>
                )}
            </div>

            {/* Fixed Outputs: True and False */}
            <div className="border-t border-gray-100">
                {/* True output */}
                <div className="relative flex items-center h-10 px-4 bg-emerald-50/50">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                    <span className="text-xs font-semibold text-emerald-700">True</span>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="true-output"
                        className="!w-[30px] !h-[30px] !bg-transparent !border-0 cursor-crosshair z-50"
                        style={{ top: '50%', right: -15 }}
                    >
                        <div className="w-3 h-3 bg-emerald-500 border-2 border-white rounded-full shadow-sm pointer-events-none" />
                    </Handle>
                </div>
                {/* False output */}
                <div className="relative flex items-center h-10 px-4 bg-red-50/50">
                    <div className="w-2 h-2 rounded-full bg-red-400 mr-2" />
                    <span className="text-xs font-semibold text-red-600">False</span>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="false-output"
                        className="!w-[30px] !h-[30px] !bg-transparent !border-0 cursor-crosshair z-50"
                        style={{ top: '50%', right: -15 }}
                    >
                        <div className="w-3 h-3 bg-red-400 border-2 border-white rounded-full shadow-sm pointer-events-none" />
                    </Handle>
                </div>
            </div>
        </div>
    );
};

export default memo(LogicNode);
