import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Play } from 'lucide-react';
import { PlayerStep } from '@/types/video-thread-player';

interface StartNodeData {
    step: PlayerStep;
    isSelected: boolean;
}

const StartNode = ({ data }: NodeProps<any>) => {
    const { step } = data as StartNodeData;

    return (
        <div className={`
            w-64 bg-white rounded-lg shadow-md border-2 overflow-visible transition-all group
            ${data.isSelected ? 'border-green-500 ring-2 ring-green-200' : 'border-green-400'}
        `}>
            {/* Header */}
            <div className="bg-green-50 p-3 border-b border-green-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center shadow-sm">
                        <Play className="w-3 h-3 fill-current" />
                    </div>
                    <span className="text-xs font-bold text-green-700 uppercase tracking-wider">
                        Start
                    </span>
                </div>
            </div>

            {/* Body */}
            <div className="p-4">
                <div className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">
                    {step.promptText || "Welcome Message"}
                </div>

                {step.videoUrl ? (
                    <div className="aspect-video bg-gray-900 rounded-md overflow-hidden relative">
                         <video src={step.videoUrl} className="w-full h-full object-cover opacity-80" />
                    </div>
                ) : (
                    <div className="aspect-video bg-green-50/50 rounded-md flex items-center justify-center text-green-600/40 text-xs border border-green-100">
                        Entry Video
                    </div>
                )}
            </div>

            {/* Source Handle - Right side only */}
            <Handle
                type="source"
                position={Position.Right}
                id="default"
                className="!w-[30px] !h-[30px] !bg-transparent !border-0 cursor-crosshair z-50"
            >
                <div className="w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm pointer-events-none" />
            </Handle>
        </div>
    );
};

export default memo(StartNode);
