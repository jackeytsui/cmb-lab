import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Video, AlertCircle, PlayCircle, CheckCircle2 } from 'lucide-react';
import { PlayerStep } from '@/types/video-thread-player';

interface VideoStepNodeData {
    step: PlayerStep;
    isSelected: boolean;
    label: string;
}

const VideoStepNode = ({ data }: NodeProps<any>) => {
    const { step } = data as VideoStepNodeData;
    const options = step.responseOptions?.options || [];

    // Determine status
    const hasMuxPlayback = !!step.upload?.muxPlaybackId;
    const hasVideo = hasMuxPlayback || !!step.videoUrl;

    return (
        <div className={`
            w-[280px] bg-white rounded-xl shadow-lg border-2 overflow-visible transition-all group
            ${data.isSelected ? 'border-indigo-500 ring-4 ring-indigo-500/20' : 'border-gray-200 hover:border-indigo-300'}
        `}>
            {/* Input Handle (Left) */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-[30px] !h-[30px] !bg-transparent !border-0 cursor-crosshair z-50"
            >
                <div className="w-3.5 h-3.5 bg-indigo-500 border-2 border-white rounded-full shadow-sm pointer-events-none" />
            </Handle>

            {/* Thumbnail / Video Preview */}
            <div className="h-32 bg-gray-900 relative flex items-center justify-center overflow-hidden">
                {hasMuxPlayback ? (
                    <img
                        src={`https://image.mux.com/${step.upload!.muxPlaybackId}/thumbnail.webp?width=560&height=256&fit_mode=crop`}
                        alt={step.promptText || "Video thumbnail"}
                        className="w-full h-full object-cover opacity-90"
                        loading="lazy"
                    />
                ) : step.videoUrl ? (
                    <video
                        src={step.videoUrl}
                        className="w-full h-full object-cover opacity-80"
                        muted
                        playsInline
                    />
                ) : (
                    <div className="text-gray-400 flex flex-col items-center">
                        <Video className="w-8 h-8 mb-2" />
                        <span className="text-xs font-medium uppercase tracking-wider">No Video</span>
                    </div>
                )}

                {/* Overlay Badge */}
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded text-[10px] font-bold text-white uppercase tracking-wider">
                    {step.responseType} Response
                </div>

                {/* Status Indicator */}
                {hasVideo ? (
                    <div className="absolute top-2 right-2 text-green-400 bg-green-950/80 p-1 rounded-full">
                        <CheckCircle2 className="w-4 h-4" />
                    </div>
                ) : (
                    <div className="absolute top-2 right-2 text-amber-500 bg-amber-950/80 p-1 rounded-full">
                        <AlertCircle className="w-4 h-4" />
                    </div>
                )}
            </div>

            {/* Content Body */}
            <div className="p-4 bg-white relative">
                <h3 className="font-bold text-gray-800 text-sm leading-tight line-clamp-2 min-h-[1.25rem]">
                    {step.promptText || "Untitled Step"}
                </h3>

                <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                        <PlayCircle className="w-3 h-3" />
                        {options.length || step.logic?.length || 0} connections
                    </span>
                    <span className="font-mono text-gray-500">#{step.sortOrder + 1}</span>
                </div>
            </div>

            {/* Dynamic Output Handles */}
            <div className="border-t border-gray-100 bg-gray-50/50">
                {options.length > 0 ? (
                    options.map((option, idx) => (
                        <div key={option.value} className="relative flex items-center h-9 px-4 border-b border-gray-50 last:border-b-0">
                            <span className="text-xs text-gray-700 font-medium truncate flex-1">{option.label}</span>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={option.value}
                                className="!w-[30px] !h-[30px] !bg-transparent !border-0 cursor-crosshair z-50"
                                style={{ top: 'auto', right: -15 }}
                            >
                                <div className="w-3 h-3 bg-indigo-500 border-2 border-white rounded-full shadow-sm pointer-events-none" />
                            </Handle>
                        </div>
                    ))
                ) : (
                    <div className="relative flex items-center justify-center h-9 px-4">
                        <span className="text-xs text-gray-500 italic">No options configured</span>
                        <Handle
                            type="source"
                            position={Position.Right}
                            id="default"
                            className="!w-[30px] !h-[30px] !bg-transparent !border-0 cursor-crosshair z-50"
                            style={{ top: 'auto', right: -15 }}
                        >
                            <div className="w-3 h-3 bg-gray-400 border-2 border-white rounded-full shadow-sm pointer-events-none" />
                        </Handle>
                    </div>
                )}
            </div>
        </div>
    );
};

export default memo(VideoStepNode);
