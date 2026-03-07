"use client";

import React from "react";
import { PlayerStep, StepLogic, StepResponseOptions } from "@/types/video-thread-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowRight } from "lucide-react";

interface StepLogicEditorProps {
  step: PlayerStep;
  allSteps: PlayerStep[];
  onChange: (updates: Partial<PlayerStep>) => void;
}

function trimPrompt(prompt?: string | null): string {
  if (!prompt) return "Untitled step";
  return prompt.length > 25 ? `${prompt.slice(0, 25)}...` : prompt;
}

export function StepLogicEditor({ step, allSteps, onChange }: StepLogicEditorProps) {
  const options = step.responseOptions?.options || [];
  const logicRules = step.logic || [];

  const handleAddOption = () => {
    const newOption = { label: "", value: `opt_${Date.now()}` };
    const newOptions = [...options, newOption];
    onChange({
      responseOptions: { ...step.responseOptions, options: newOptions } as StepResponseOptions
    });
  };

  const handleOptionChange = (index: number, txt: string) => {
    const oldOptionValue = options[index].value;
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], label: txt, value: txt };

    let newLogic = logicRules;
    if (oldOptionValue !== txt) {
      newLogic = logicRules.map(rule => {
        if (rule.condition === oldOptionValue) {
          return { ...rule, condition: txt };
        }
        return rule;
      });
    }

    onChange({
      responseOptions: { ...step.responseOptions, options: newOptions } as StepResponseOptions,
      logic: newLogic
    });
  };

  const handleLogicChange = (optionValue: string, nextStepId: string) => {
    const filteredLogic = logicRules.filter(l => l.condition !== optionValue);
    const newRule: StepLogic = { condition: optionValue, nextStepId };
    onChange({ logic: [...filteredLogic, newRule] });
  };

  const handleDeleteOption = (index: number) => {
    const optionToRemove = options[index];
    const newOptions = options.filter((_, i) => i !== index);
    const newLogic = logicRules.filter(l => l.condition !== optionToRemove.value);
    onChange({
      responseOptions: { ...step.responseOptions, options: newOptions } as StepResponseOptions,
      logic: newLogic
    });
  };

  const getDestination = (val: string) => {
    return logicRules.find(l => l.condition === val)?.nextStepId || "default";
  };

  return (
    <div className="space-y-4 rounded-lg border border-zinc-300 bg-zinc-50 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-zinc-900">Answer Options & Logic</h3>
      </div>

      <div className="space-y-3">
        {options.map((opt, idx) => (
          <div key={idx} className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
            {/* Option label row */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide shrink-0 w-14">Option</span>
              <Input
                placeholder="e.g. Yes, No"
                value={opt.label}
                onChange={(e) => handleOptionChange(idx, e.target.value)}
                className="bg-white text-zinc-900 placeholder:text-zinc-400 h-8 text-sm flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteOption(idx)}
                className="text-zinc-400 hover:text-red-500 shrink-0 h-8 w-8"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Destination row */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide shrink-0 w-14 flex items-center gap-1">
                <ArrowRight className="w-3 h-3" /> Go to
              </span>
              <Select
                value={getDestination(opt.value)}
                onValueChange={(val) => handleLogicChange(opt.value, val)}
              >
                <SelectTrigger className="bg-zinc-50 text-zinc-900 h-8 text-sm flex-1">
                  <SelectValue placeholder="Select step..." />
                </SelectTrigger>
                <SelectContent className="text-zinc-900">
                  <SelectItem value="default" className="text-zinc-900">Continue to next</SelectItem>
                  {allSteps
                    .filter(s => s.id !== step.id)
                    .map((s, i) => (
                    <SelectItem key={s.id} value={s.id} className="text-zinc-900">
                      Step {i + 1}: {trimPrompt(s.promptText)}
                    </SelectItem>
                  ))}
                  <SelectItem value="end_screen" className="text-emerald-700 font-medium">End Screen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>

      {options.length === 0 && (
        <p className="text-sm text-zinc-600 text-center py-2">No options yet. Add button/MC options to create routing paths.</p>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleAddOption}
        className="w-full border-dashed text-zinc-700 hover:text-indigo-700 hover:border-indigo-300"
      >
        <Plus className="w-4 h-4 mr-2" /> Add Option
      </Button>
    </div>
  );
}
