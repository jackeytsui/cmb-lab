"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { LogicRule, PlayerStep } from "@/types/video-thread-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Plus, Trash2, Zap, Code2, Video, Mic, Type, MousePointerClick, ListChecks } from "lucide-react";

interface LogicRuleEditorProps {
  step: PlayerStep;
  allSteps: PlayerStep[];
  onUpdate: (stepId: string, updates: Partial<PlayerStep>) => void;
}

type Operator = LogicRule["operator"];
type FocusTarget = "field" | "value";
type ResponseType = "video" | "audio" | "text" | "button" | "multiple_choice";
type EditorMode = "guided" | "advanced";

interface VariableToken {
  key: string;
  label: string;
  path: string;
  sample: string;
}

const OPERATORS: Array<{ value: Operator; label: string }> = [
  { value: "equals", label: "Equals" },
  { value: "contains", label: "Contains" },
  { value: "exists", label: "Exists" },
  { value: "gt", label: "Greater Than" },
  { value: "lt", label: "Less Than" },
];

const RESPONSE_TYPE_ICONS: Record<string, React.ReactNode> = {
  video: <Video className="w-4 h-4" />,
  audio: <Mic className="w-4 h-4" />,
  text: <Type className="w-4 h-4" />,
  button: <MousePointerClick className="w-4 h-4" />,
  multiple_choice: <ListChecks className="w-4 h-4" />,
};

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  video: "Video",
  audio: "Audio",
  text: "Text",
  button: "Button",
  multiple_choice: "Multiple Choice",
};

const RESPONSE_PRIORITY = ["text", "button", "multiple_choice", "audio", "video"] as const;

function expressionFor(path: string): string {
  return `{{$json.${path}}}`;
}

function normalizeFieldPath(path: string): string {
  if (!path) return "";
  const expressionMatch = path.match(/^\s*\{\{\s*\$json\.([^}]+)\s*\}\}\s*$/);
  return (expressionMatch?.[1] ?? path).trim();
}

function getAllowedResponseTypes(step: PlayerStep | undefined): ResponseType[] {
  if (!step) return [];
  const allowed = ((step.allowedResponseTypes as ResponseType[] | null) ?? []).filter(Boolean);
  const fallback = step.responseType ? [step.responseType as ResponseType] : [];
  return Array.from(new Set([...(allowed.length > 0 ? allowed : fallback)]));
}

function trimPrompt(prompt?: string | null): string {
  if (!prompt) return "Untitled step";
  return prompt.length > 40 ? `${prompt.slice(0, 40)}...` : prompt;
}

function inferSourceResponseType(sourceStep: PlayerStep): string {
  const allowed = sourceStep.allowedResponseTypes || [];
  const inferred = RESPONSE_PRIORITY.find((t) => allowed.includes(t));
  return inferred ?? sourceStep.responseType ?? "text";
}

function buildSourceTokens(sourceStep: PlayerStep | undefined): VariableToken[] {
  if (!sourceStep) {
    return [
      { key: "answer.content", label: "Answer Content", path: "answer.content", sample: "student response" },
      { key: "answer.type", label: "Answer Type", path: "answer.type", sample: "text" },
    ];
  }

  const responseType = inferSourceResponseType(sourceStep);
  const allowedTypes = getAllowedResponseTypes(sourceStep);
  const hasMultipleTypes = allowedTypes.length > 1;
  const tokens: VariableToken[] = [
    {
      key: "answer.type",
      label: "Answer Type",
      path: "answer.type",
      sample: hasMultipleTypes ? allowedTypes.join("|") : responseType,
    },
    {
      key: "answer.content",
      label: "Answer Content",
      path: "answer.content",
      sample: hasMultipleTypes
        ? "varies_by_response_type"
        : responseType === "text"
        ? "I need help with tones"
        : responseType === "audio" || responseType === "video"
          ? "mux_playback_id"
          : sourceStep.responseOptions?.options?.[0]?.value || "selected_option",
    },
  ];

  if (responseType === "audio" || responseType === "video") {
    tokens.push({ key: "answer.metadata.muxPlaybackId", label: "Media Playback ID", path: "answer.metadata.muxPlaybackId", sample: "abcd1234" });
  }

  if (responseType === "button" || responseType === "multiple_choice") {
    tokens.push({ key: "answer.content", label: "Selected Option Value", path: "answer.content", sample: sourceStep.responseOptions?.options?.[0]?.value || "option_value" });
  }

  return tokens;
}

function buildPreviewContext(sourceStep: PlayerStep | undefined) {
  if (!sourceStep) {
    return { answer: { type: "text", content: "student response" }, student: { email: "student@example.com" }, note: "Connect a previous node to this logic node for source-aware variables." };
  }

  const responseType = inferSourceResponseType(sourceStep);
  const allowedTypes = getAllowedResponseTypes(sourceStep);
  const hasMultipleTypes = allowedTypes.length > 1;
  const firstOption = sourceStep.responseOptions?.options?.[0];

  const answerBase: { type: string; content: string; metadata?: { muxPlaybackId: string } } = {
    type: hasMultipleTypes ? allowedTypes.join("|") : responseType,
    content: hasMultipleTypes
      ? "value depends on chosen response type"
      : responseType === "text"
      ? "I want to practice pronunciation"
      : responseType === "audio" || responseType === "video"
        ? "mux_playback_id_123"
        : firstOption?.value || "selected_option",
  };

  if (responseType === "audio" || responseType === "video") {
    answerBase.metadata = { muxPlaybackId: "mux_playback_id_123" };
  }

  return {
    answer: answerBase,
    sourceStep: { id: sourceStep.id, promptText: sourceStep.promptText, responseType, allowedResponseTypes: allowedTypes, options: sourceStep.responseOptions?.options || [] },
    student: { email: "student@example.com" },
  };
}

function extractInboundSources(step: PlayerStep, allSteps: PlayerStep[]): PlayerStep[] {
  const inbound = allSteps.filter((candidate) => {
    if (candidate.id === step.id) return false;
    const hasLogicConnection = (candidate.logic || []).some((rule) => rule.nextStepId === step.id);
    const hasLogicRuleConnection = (candidate.logicRules || []).some((rule) => rule.nextStepId === step.id);
    const hasFallbackConnection = candidate.fallbackStepId === step.id;
    return hasLogicConnection || hasLogicRuleConnection || hasFallbackConnection;
  });

  if (inbound.length > 0) return inbound.sort((a, b) => a.sortOrder - b.sortOrder);

  const previousByOrder = [...allSteps]
    .filter((candidate) => candidate.id !== step.id && candidate.sortOrder < step.sortOrder)
    .sort((a, b) => b.sortOrder - a.sortOrder)[0];

  return previousByOrder ? [previousByOrder] : [];
}

function buildDefaultRule(tokens: VariableToken[]): LogicRule {
  const defaultField = tokens[0]?.path || "answer.content";
  return { id: crypto.randomUUID(), field: expressionFor(defaultField), operator: "equals", value: "", nextStepId: "" };
}

// ─── Step Selector Component ────────────────────────────────────────────────
function StepSelector({
  value,
  onChange,
  allSteps,
  excludeStepId,
  placeholder = "Select destination...",
  includeEndScreen = false,
}: {
  value: string;
  onChange: (value: string) => void;
  allSteps: PlayerStep[];
  excludeStepId: string;
  placeholder?: string;
  includeEndScreen?: boolean;
}) {
  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
      <SelectTrigger className="h-9 bg-white text-sm text-zinc-900 border-zinc-300">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="text-zinc-900">
        <SelectItem value="none" className="text-zinc-500">{placeholder}</SelectItem>
        {includeEndScreen && (
          <SelectItem value="end_screen" className="text-emerald-700 font-medium">End Screen (finish thread)</SelectItem>
        )}
        {allSteps
          .filter((s) => s.id !== excludeStepId)
          .map((s, idx) => (
            <SelectItem key={s.id} value={s.id} className="text-zinc-900">
              Step {idx + 1}: {trimPrompt(s.promptText)}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function LogicRuleEditor({ step, allSteps, onUpdate }: LogicRuleEditorProps) {
  const rules = step.logicRules || [];
  const fallbackStepId = step.fallbackStepId;
  const rulesContainerRef = useRef<HTMLDivElement | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("guided");

  const sourceCandidates = useMemo(
    () => extractInboundSources(step, allSteps),
    [step, allSteps]
  );

  const [sourceStepId, setSourceStepId] = useState<string>(sourceCandidates[0]?.id || "");
  const [focusedInput, setFocusedInput] = useState<{ ruleId: string; target: FocusTarget } | null>(null);
  const [pendingFocusRuleId, setPendingFocusRuleId] = useState<string | null>(null);

  useEffect(() => {
    if (sourceCandidates.length === 0) { setSourceStepId(""); return; }
    const stillValid = sourceCandidates.some((c) => c.id === sourceStepId);
    if (!stillValid) setSourceStepId(sourceCandidates[0].id);
  }, [sourceCandidates, sourceStepId]);

  const sourceStep = sourceCandidates.find((c) => c.id === sourceStepId);
  const sourceAllowedTypes = useMemo(() => getAllowedResponseTypes(sourceStep), [sourceStep]);
  const sourceOptions = useMemo(() => sourceStep?.responseOptions?.options || [], [sourceStep]);
  const sourceTokens = useMemo(() => buildSourceTokens(sourceStep), [sourceStep]);
  const previewContext = useMemo(() => buildPreviewContext(sourceStep), [sourceStep]);

  const incompleteRuleIds = useMemo(() => {
    return new Set(
      rules
        .filter((rule) => {
          if (!rule.field?.trim()) return true;
          if (!rule.nextStepId?.trim()) return true;
          if (rule.operator !== "exists" && !rule.value?.trim()) return true;
          return false;
        })
        .map((rule) => rule.id)
    );
  }, [rules]);

  useEffect(() => {
    if (!pendingFocusRuleId) return;
    const target = document.getElementById(`logic-rule-field-${pendingFocusRuleId}`) as HTMLInputElement | null;
    if (target) { target.focus(); target.scrollIntoView({ behavior: "smooth", block: "center" }); }
    setPendingFocusRuleId(null);
  }, [pendingFocusRuleId, rules]);

  // ─── Rule Handlers ──────────────────────────────────────────────────────
  const handleAddRule = () => {
    const newRule = buildDefaultRule(sourceTokens);
    onUpdate(step.id, { logicRules: [...rules, newRule] });
    setPendingFocusRuleId(newRule.id);
    setFocusedInput({ ruleId: newRule.id, target: "field" });
  };

  const handleUpdateRule = (ruleId: string, updates: Partial<LogicRule>) => {
    const nextRules = rules.map((rule) => (rule.id === ruleId ? { ...rule, ...updates } : rule));
    onUpdate(step.id, { logicRules: nextRules });
  };

  const handleDeleteRule = (ruleId: string) => {
    onUpdate(step.id, { logicRules: rules.filter((rule) => rule.id !== ruleId) });
  };

  const handleUpdateFallback = (nextStepId: string) => {
    onUpdate(step.id, { fallbackStepId: nextStepId === "none" ? null : nextStepId === "end_screen" ? null : nextStepId });
  };

  const moveRule = (ruleId: string, direction: "up" | "down") => {
    const index = rules.findIndex((rule) => rule.id === ruleId);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rules.length) return;
    const next = [...rules];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    onUpdate(step.id, { logicRules: next });
  };

  // ─── Guided Mode: Type-Based Routing ────────────────────────────────────
  const findTypeRule = (responseType: ResponseType) =>
    rules.find(
      (rule) =>
        normalizeFieldPath(rule.field) === "answer.type" &&
        rule.operator === "equals" &&
        (rule.value || "").trim() === responseType
    );

  const getTypeRuleTarget = (responseType: ResponseType) => findTypeRule(responseType)?.nextStepId || "";

  const setTypeRuleTarget = (responseType: ResponseType, nextStepId: string) => {
    const existing = findTypeRule(responseType);
    if (!existing) {
      const newRule: LogicRule = { id: crypto.randomUUID(), field: expressionFor("answer.type"), operator: "equals", value: responseType, nextStepId };
      onUpdate(step.id, { logicRules: [...rules, newRule] });
      return;
    }
    handleUpdateRule(existing.id, { nextStepId });
  };

  // ─── Guided Mode: Option-Based Routing ──────────────────────────────────
  const findOptionRule = (optionValue: string) =>
    rules.find(
      (rule) =>
        normalizeFieldPath(rule.field) === "answer.content" &&
        rule.operator === "equals" &&
        (rule.value || "").trim() === optionValue
    );

  const getOptionRuleTarget = (optionValue: string) => findOptionRule(optionValue)?.nextStepId || "";

  const setOptionRuleTarget = (optionValue: string, nextStepId: string) => {
    const existing = findOptionRule(optionValue);
    if (!existing) {
      const newRule: LogicRule = { id: crypto.randomUUID(), field: expressionFor("answer.content"), operator: "equals", value: optionValue, nextStepId };
      onUpdate(step.id, { logicRules: [...rules, newRule] });
      return;
    }
    handleUpdateRule(existing.id, { nextStepId });
  };

  // ─── Token Insertion (Advanced Mode) ────────────────────────────────────
  const insertTokenIntoRule = (tokenPath: string) => {
    const expression = expressionFor(tokenPath);
    if (rules.length === 0) {
      const bootstrapRule = buildDefaultRule(sourceTokens);
      bootstrapRule.field = expression;
      onUpdate(step.id, { logicRules: [bootstrapRule] });
      setPendingFocusRuleId(bootstrapRule.id);
      setFocusedInput({ ruleId: bootstrapRule.id, target: "value" });
      return;
    }
    if (!focusedInput) {
      const firstRuleId = rules[0].id;
      const existingField = rules[0].field?.trim();
      handleUpdateRule(firstRuleId, { field: existingField || expression });
      return;
    }
    const rule = rules.find((entry) => entry.id === focusedInput.ruleId);
    if (!rule) return;
    if (focusedInput.target === "field") {
      handleUpdateRule(rule.id, { field: expression });
      return;
    }
    const existingValue = rule.value || "";
    handleUpdateRule(rule.id, { value: existingValue ? `${existingValue} ${expression}` : expression });
  };

  const handleDropToken = (event: React.DragEvent<HTMLInputElement>, rule: LogicRule, target: FocusTarget) => {
    event.preventDefault();
    const tokenPath = event.dataTransfer.getData("application/x-vt-token");
    if (!tokenPath) return;
    const expression = expressionFor(tokenPath);
    if (target === "field") { handleUpdateRule(rule.id, { field: expression }); return; }
    const currentValue = event.currentTarget.value || "";
    const cursorStart = event.currentTarget.selectionStart ?? currentValue.length;
    const cursorEnd = event.currentTarget.selectionEnd ?? currentValue.length;
    handleUpdateRule(rule.id, { value: currentValue.slice(0, cursorStart) + expression + currentValue.slice(cursorEnd) });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-lg border border-zinc-300 bg-white">
      {/* ─── Left Panel: Source Data ──────────────────────────────────────── */}
      <div className="w-[320px] border-r border-zinc-200 bg-zinc-900 p-5 text-zinc-100 flex flex-col">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-300">
          Source Data
        </h3>

        {/* Source Node Selector */}
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-800 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-300">
            Source Node
          </p>
          <Select value={sourceStepId || "none"} onValueChange={(value) => setSourceStepId(value === "none" ? "" : value)}>
            <SelectTrigger className="h-9 border-zinc-600 bg-zinc-800 text-sm text-zinc-100">
              <SelectValue placeholder="Select connected node" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 text-zinc-100 border-zinc-700">
              {sourceCandidates.length === 0 ? (
                <SelectItem value="none" className="text-zinc-300">No connected source</SelectItem>
              ) : (
                sourceCandidates.map((candidate, idx) => (
                  <SelectItem key={candidate.id} value={candidate.id} className="text-zinc-100">
                    Step {idx + 1}: {trimPrompt(candidate.promptText)}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Source Info */}
        {sourceStep && (
          <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-800/60 p-3">
            <p className="text-xs font-semibold text-zinc-300 mb-2">Accepts</p>
            <div className="flex flex-wrap gap-1.5">
              {sourceAllowedTypes.map((type) => (
                <span key={type} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-700 px-2 py-1 text-xs font-medium text-zinc-200">
                  {RESPONSE_TYPE_ICONS[type]}
                  {RESPONSE_TYPE_LABELS[type] || type}
                </span>
              ))}
            </div>
            {sourceOptions.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-zinc-300 mb-1.5">Options</p>
                <div className="flex flex-wrap gap-1.5">
                  {sourceOptions.map((opt) => (
                    <span key={opt.value} className="rounded bg-indigo-900/50 border border-indigo-700/50 px-2 py-0.5 text-xs text-indigo-200">
                      {opt.label || opt.value}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Variables (for Advanced mode) */}
        <div className="mb-4 rounded-lg border border-zinc-700 bg-black/30 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-300">
            Variables
          </p>
          <div className="flex flex-wrap gap-2">
            {sourceTokens.map((token) => (
              <button
                key={token.key}
                type="button"
                onClick={() => { if (editorMode === "advanced") insertTokenIntoRule(token.path); }}
                draggable={editorMode === "advanced"}
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-vt-token", token.path);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                className={`rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  editorMode === "advanced"
                    ? "text-zinc-200 hover:border-indigo-400 hover:text-indigo-200 cursor-pointer"
                    : "text-zinc-400 cursor-default"
                }`}
              >
                <div className="font-mono text-[11px]">{expressionFor(token.path)}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{token.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Preview Context */}
        <div className="flex-1 min-h-0 overflow-auto">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300 mb-2">Context Preview</p>
          <pre className="rounded-lg border border-zinc-700 bg-black/40 p-3 text-[11px] leading-5 text-emerald-400 overflow-auto max-h-[200px]">
{JSON.stringify(previewContext, null, 2)}
          </pre>
        </div>
      </div>

      {/* ─── Right Panel: Rules Editor ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col bg-white min-w-0">
        {/* Mode Switcher + Header */}
        <div className="border-b border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-zinc-900 text-base">Routing Rules</h3>
            <div className="flex bg-zinc-200 p-0.5 rounded-lg">
              <button
                onClick={() => setEditorMode("guided")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  editorMode === "guided"
                    ? "bg-white shadow-sm text-indigo-700"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Guided
              </button>
              <button
                onClick={() => setEditorMode("advanced")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  editorMode === "advanced"
                    ? "bg-white shadow-sm text-indigo-700"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Advanced
              </button>
            </div>
          </div>
          <p className="text-sm text-zinc-600">
            {editorMode === "guided"
              ? "Route students to different paths based on their response type or answer."
              : "Write custom rules using n8n-style expressions. Rules run top to bottom — first match wins."}
          </p>
        </div>

        {/* ─── Guided Mode ─────────────────────────────────────────────── */}
        {editorMode === "guided" ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Route by Response Type */}
            {sourceAllowedTypes.length > 1 && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-indigo-600" />
                  </div>
                  <h4 className="font-semibold text-zinc-900 text-sm">Route by Response Type</h4>
                </div>
                <p className="text-sm text-zinc-600 mb-4 ml-9">
                  If the student answers with video, send them one way. Audio? Another way. Set each path below.
                </p>
                <div className="space-y-3 ml-9">
                  {sourceAllowedTypes.map((type) => (
                    <div key={type} className="flex items-center gap-3">
                      <div className="flex items-center gap-2 w-[160px] shrink-0 rounded-lg border border-indigo-200 bg-white px-3 py-2">
                        <span className="text-indigo-600">{RESPONSE_TYPE_ICONS[type]}</span>
                        <span className="text-sm font-semibold text-zinc-900">{RESPONSE_TYPE_LABELS[type] || type}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-400 shrink-0" />
                      <div className="flex-1">
                        <StepSelector
                          value={getTypeRuleTarget(type)}
                          onChange={(v) => setTypeRuleTarget(type, v)}
                          allSteps={allSteps}
                          excludeStepId={step.id}
                          placeholder="Select destination..."
                          includeEndScreen
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Route by Answer Option (Button/MC) */}
            {sourceOptions.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                    <MousePointerClick className="w-4 h-4 text-amber-600" />
                  </div>
                  <h4 className="font-semibold text-zinc-900 text-sm">Route by Answer Option</h4>
                </div>
                <p className="text-sm text-zinc-600 mb-4 ml-9">
                  If the student picks a specific button or choice, route them accordingly.
                </p>
                <div className="space-y-3 ml-9">
                  {sourceOptions.map((option) => (
                    <div key={option.value} className="flex items-center gap-3">
                      <div className="w-[160px] shrink-0 rounded-lg border border-amber-200 bg-white px-3 py-2">
                        <span className="text-sm font-semibold text-zinc-900">{option.label || option.value}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-zinc-400 shrink-0" />
                      <div className="flex-1">
                        <StepSelector
                          value={getOptionRuleTarget(option.value)}
                          onChange={(v) => setOptionRuleTarget(option.value, v)}
                          allSteps={allSteps}
                          excludeStepId={step.id}
                          placeholder="Select destination..."
                          includeEndScreen
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No routing sections available */}
            {sourceAllowedTypes.length <= 1 && sourceOptions.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-zinc-300 p-8 text-center">
                <p className="text-sm font-medium text-zinc-700 mb-2">No guided routing available</p>
                <p className="text-sm text-zinc-500 mb-4">
                  The source step only has one response type and no button/MC options.
                  Switch to <strong>Advanced</strong> mode to write custom rules, or update the source step to accept multiple response types.
                </p>
                <Button size="sm" variant="outline" onClick={() => setEditorMode("advanced")} className="text-zinc-800">
                  <Code2 className="w-4 h-4 mr-2" />
                  Switch to Advanced
                </Button>
              </div>
            )}

            {/* Hint to use Advanced */}
            {(sourceAllowedTypes.length > 1 || sourceOptions.length > 0) && (
              <p className="text-xs text-zinc-500 px-1">
                Need more complex conditions? Switch to <button type="button" onClick={() => setEditorMode("advanced")} className="text-indigo-600 font-medium hover:underline">Advanced mode</button> for full expression support.
              </p>
            )}
          </div>
        ) : (
          /* ─── Advanced Mode ─────────────────────────────────────────── */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-5 py-3 bg-zinc-50 border-b border-zinc-200">
              <p className="text-sm text-zinc-700">
                {rules.length} rule{rules.length !== 1 ? "s" : ""} defined
              </p>
              <Button size="sm" onClick={handleAddRule} className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white">
                <Plus className="mr-1 h-4 w-4" /> Add Rule
              </Button>
            </div>

            <div ref={rulesContainerRef} className="flex-1 space-y-4 overflow-y-auto p-5">
              {rules.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-zinc-300 py-8 text-center">
                  <p className="text-sm text-zinc-700 mb-2">No rules defined yet.</p>
                  <p className="text-sm text-zinc-500">Click <strong>Add Rule</strong> or click a variable token to create the first rule.</p>
                </div>
              )}

              {rules.map((rule, index) => {
                const sourceType = sourceStep ? inferSourceResponseType(sourceStep) : null;
                const ruleSourceOptions = sourceStep?.responseOptions?.options || [];

                return (
                  <div key={rule.id} className="group relative rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white">
                        IF
                      </span>
                      <span className="text-sm font-medium text-zinc-700">Rule #{index + 1}</span>
                      {incompleteRuleIds.has(rule.id) && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                          <AlertTriangle className="h-3 w-3" />
                          Incomplete
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <button type="button" aria-label="Move rule up" onClick={() => moveRule(rule.id, "up")} disabled={index === 0} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" aria-label="Move rule down" onClick={() => moveRule(rule.id, "down")} disabled={index === rules.length - 1} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteRule(rule.id)} className="rounded p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete rule">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-[1.1fr_160px_1fr] gap-2">
                      <Input
                        id={`logic-rule-field-${rule.id}`}
                        className="h-9 text-sm font-mono text-zinc-900 placeholder:text-zinc-400"
                        value={rule.field || ""}
                        placeholder="{{$json.answer.content}}"
                        onFocus={() => setFocusedInput({ ruleId: rule.id, target: "field" })}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleDropToken(event, rule, "field")}
                        onChange={(e) => handleUpdateRule(rule.id, { field: e.target.value })}
                      />
                      <Select value={rule.operator} onValueChange={(value) => handleUpdateRule(rule.id, { operator: value as Operator })}>
                        <SelectTrigger className="h-9 text-sm text-zinc-900">
                          <SelectValue placeholder="Operator" />
                        </SelectTrigger>
                        <SelectContent className="text-zinc-900">
                          {OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value} className="text-zinc-900">{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-9 text-sm text-zinc-900 placeholder:text-zinc-400"
                        value={rule.value || ""}
                        placeholder={rule.operator === "exists" ? "(not needed)" : "Value"}
                        onFocus={() => setFocusedInput({ ruleId: rule.id, target: "value" })}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleDropToken(event, rule, "value")}
                        onChange={(e) => handleUpdateRule(rule.id, { value: e.target.value })}
                        disabled={rule.operator === "exists"}
                      />
                    </div>

                    {/* Quick value chips for button/MC source */}
                    {(sourceType === "button" || sourceType === "multiple_choice") && ruleSourceOptions.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-zinc-600">Quick:</span>
                        {ruleSourceOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className="rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-sm text-zinc-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                            onClick={() => handleUpdateRule(rule.id, { value: option.value })}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
                      <ArrowRight className="h-4 w-4 text-zinc-500 shrink-0" />
                      <span className="text-sm font-medium text-zinc-800 shrink-0">Then go to:</span>
                      <div className="flex-1">
                        <StepSelector
                          value={rule.nextStepId}
                          onChange={(v) => handleUpdateRule(rule.id, { nextStepId: v })}
                          allSteps={allSteps}
                          excludeStepId={step.id}
                          placeholder="Select step..."
                          includeEndScreen
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Fallback (always visible) ─────────────────────────────── */}
        <div className="border-t border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-zinc-700 px-2.5 py-1 text-xs font-bold text-white">
              ELSE
            </div>
            <span className="text-sm font-medium text-zinc-700 shrink-0">If no rules match:</span>
            <div className="flex-1">
              <StepSelector
                value={fallbackStepId || "end_screen"}
                onChange={handleUpdateFallback}
                allSteps={allSteps}
                excludeStepId={step.id}
                placeholder="End Screen"
                includeEndScreen
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
