"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoRecorder } from "@/components/video-thread/VideoRecorder";
import { VideoLibraryPicker } from "@/components/video-thread/VideoLibraryPicker";
import { StepLogicEditor } from "@/components/video-thread/StepLogicEditor";
import { FlowEditor } from "@/components/video-thread/FlowEditor";
import { LogicRuleEditor } from "@/components/video-thread/LogicRuleEditor";
import { ThreadSubmissionsPanel } from "@/components/admin/video-threads/ThreadSubmissionsPanel";
import { PlayerStep } from "@/types/video-thread-player";
import {
  Loader2,
  Plus,
  Video,
  Save,
  AlertCircle,
  LayoutTemplate,
  Workflow,
  Library,
  RotateCcw,
  Trash2,
  Flag,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type ViewMode = "build" | "flow" | "submissions";

interface StepReference {
  sourceStepId: string;
  sourcePrompt: string;
  field: "logic" | "logicRules" | "fallbackStepId";
}

export default function VideoThreadBuilderPage() {
  const params = useParams();
  const threadId = params.threadId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [steps, setSteps] = useState<PlayerStep[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("build");

  const [nodePositions, setNodePositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const [isLogicModalOpen, setIsLogicModalOpen] = useState(false);
  const [editingLogicStepId, setEditingLogicStepId] = useState<string | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingStepId, setDeletingStepId] = useState<string | null>(null);
  const [deleteReplacement, setDeleteReplacement] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function fetchThread() {
      try {
        const res = await fetch(`/api/admin/video-threads/${threadId}/steps`);
        if (!res.ok) throw new Error("Failed to load thread steps");
        const data = await res.json();

        if (data.steps && data.steps.length > 0) {
          setSteps(data.steps);
          setSelectedStepId(data.steps[0].id);
          const initialPositions: Record<string, { x: number; y: number }> = {};
          data.steps.forEach((step: PlayerStep) => {
            if (step.positionX !== undefined) {
              initialPositions[step.id] = { x: step.positionX, y: step.positionY };
            }
          });
          setNodePositions(initialPositions);
        } else {
          const initialId = crypto.randomUUID();
          const initialStep: PlayerStep = {
            id: initialId,
            threadId,
            videoUrl: "",
            promptText: "Welcome! How can I help you?",
            responseType: "video",
            allowedResponseTypes: ["video"],
            logic: [],
            logicRules: [],
            responseOptions: { options: [] },
            fallbackStepId: null,
            sortOrder: 0,
            positionX: 0,
            positionY: 150,
            isEndScreen: false,
            upload: null,
            uploadId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          setSteps([initialStep]);
          setSelectedStepId(initialId);
        }
      } catch (error) {
        console.error(error);
        toast.error("Error loading thread steps");
      } finally {
        setLoading(false);
      }
    }

    if (threadId) fetchThread();
  }, [threadId]);

  const selectedStep = steps.find((s) => s.id === selectedStepId);
  const editingLogicStep = steps.find((s) => s.id === editingLogicStepId);

  const deletingReferences = useMemo(() => {
    if (!deletingStepId) return [] as StepReference[];
    return getInboundReferences(steps, deletingStepId);
  }, [steps, deletingStepId]);

  const updateStepById = (stepId: string, updates: Partial<PlayerStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...updates } : s)));
  };

  const handleUpdateStep = (updates: Partial<PlayerStep>) => {
    if (!selectedStepId) return;
    updateStepById(selectedStepId, updates);
  };

  const handleToggleResponseType = (type: string) => {
    if (!selectedStep) return;

    const currentTypes = selectedStep.allowedResponseTypes || [selectedStep.responseType];
    let newTypes: string[];

    if (currentTypes.includes(type as never)) {
      if (currentTypes.length > 1) {
        newTypes = currentTypes.filter((t) => t !== type);
      } else {
        return;
      }
    } else {
      newTypes = [...currentTypes, type];
    }

    handleUpdateStep({
      allowedResponseTypes: newTypes as never,
      responseType: newTypes[0] as never,
    });
  };

  const handleRecordingComplete = (result: {
    uploadId: string;
    dbUploadId: string;
    muxPlaybackId?: string;
  }) => {
    if (!selectedStepId) return;
    updateStepById(selectedStepId, {
      uploadId: result.dbUploadId,
      upload: { muxPlaybackId: result.muxPlaybackId || null },
      videoUrl: result.muxPlaybackId
        ? `https://stream.mux.com/${result.muxPlaybackId}.m3u8`
        : "",
    });
    toast.success("Video recorded and uploaded successfully");
  };

  const handleLibrarySelect = (upload: {
    id: string;
    muxPlaybackId: string;
    filename: string;
  }) => {
    if (!selectedStepId) return;
    updateStepById(selectedStepId, {
      uploadId: upload.id,
      upload: { muxPlaybackId: upload.muxPlaybackId },
      videoUrl: `https://stream.mux.com/${upload.muxPlaybackId}.m3u8`,
    });
    setIsLibraryOpen(false);
    toast.success(`Video \"${upload.filename}\" selected`);
  };

  const handleClearVideo = () => {
    if (!selectedStepId) return;
    updateStepById(selectedStepId, {
      uploadId: null,
      upload: null,
      videoUrl: "",
    });
  };

  const addNewStep = (type: "video" | "logic" = "video") => {
    const newId = crypto.randomUUID();

    const baseStep: PlayerStep = {
      id: newId,
      threadId,
      videoUrl: "",
      promptText: type === "logic" ? "Check Condition" : "New Question...",
      responseType: type === "logic" ? "button" : "video",
      allowedResponseTypes: [type === "logic" ? "button" : "video"],
      logic: [],
      logicRules: [],
      responseOptions:
        type === "logic"
          ? {
              options: [
                { label: "True", value: "true" },
                { label: "False", value: "false" },
              ],
            }
          : { options: [] },
      fallbackStepId: null,
      sortOrder: steps.length,
      positionX: 0,
      positionY: 150,
      isEndScreen: false,
      upload: null,
      uploadId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setSteps([...steps, baseStep]);

    if (type === "video") {
      setSelectedStepId(newId);
      setViewMode("build");
    } else {
      setEditingLogicStepId(newId);
      setIsLogicModalOpen(true);
    }
  };

  const handleEditStep = (stepId: string) => {
    setSelectedStepId(stepId);
    setViewMode("build");
  };

  const handleEditLogic = (stepId: string) => {
    setEditingLogicStepId(stepId);
    setIsLogicModalOpen(true);
  };

  const refreshSteps = async () => {
    const verifyRes = await fetch(`/api/admin/video-threads/${threadId}/steps`);
    const verifyData = await verifyRes.json();
    if (verifyData.steps) {
      setSteps(verifyData.steps);
      const refreshedPositions: Record<string, { x: number; y: number }> = {};
      verifyData.steps.forEach((step: PlayerStep) => {
        if (step.positionX !== undefined) {
          refreshedPositions[step.id] = { x: step.positionX, y: step.positionY };
        }
      });
      setNodePositions(refreshedPositions);
      if (!verifyData.steps.some((s: PlayerStep) => s.id === selectedStepId)) {
        setSelectedStepId(verifyData.steps[0]?.id || null);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const stepsWithPositions = steps.map((step) => ({
        ...step,
        positionX: Math.round(
          nodePositions[step.id]?.x ?? step.positionX ?? step.sortOrder * 450
        ),
        positionY: Math.round(nodePositions[step.id]?.y ?? step.positionY ?? 150),
      }));

      const res = await fetch(`/api/admin/video-threads/${threadId}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: stepsWithPositions }),
      });

      if (!res.ok) throw new Error("Failed to save changes");

      toast.success("Changes saved successfully");
      await refreshSteps();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save changes to database");
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (stepId: string) => {
    setDeletingStepId(stepId);
    setDeleteReplacement("");
    setIsDeleteModalOpen(true);
  };

  const handleDeleteStep = async () => {
    if (!deletingStepId) return;
    if (deletingReferences.length > 0 && !deleteReplacement) {
      toast.error("Select replacement route before deleting.");
      return;
    }

    setIsDeleting(true);
    try {
      const useEndScreen = deleteReplacement === "end_screen";
      const replacementStepId =
        deleteReplacement && !useEndScreen ? deleteReplacement : null;

      const res = await fetch(
        `/api/admin/video-threads/${threadId}/steps/${deletingStepId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replacementStepId, useEndScreen }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to delete step");
      }

      await refreshSteps();
      setIsDeleteModalOpen(false);
      setDeletingStepId(null);
      setDeleteReplacement("");
      toast.success("Step deleted");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-100">
        <Loader2 className="animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-zinc-100">
      <div className="h-14 border-b bg-white flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg text-zinc-900">Thread Builder</h1>
          <div className="h-6 w-px bg-zinc-300" />
          <div className="flex bg-zinc-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode("build")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === "build"
                  ? "bg-white shadow-sm text-indigo-600"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <LayoutTemplate className="w-4 h-4" />
              Build
            </button>
            <button
              onClick={() => setViewMode("flow")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === "flow"
                  ? "bg-white shadow-sm text-indigo-600"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <Workflow className="w-4 h-4" />
              Logic Flow
            </button>
            <button
              onClick={() => setViewMode("submissions")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === "submissions"
                  ? "bg-white shadow-sm text-indigo-600"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Submissions
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-70 transition-all min-w-[140px]"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 border-r bg-white flex flex-col shrink-0">
          <div className="p-4 border-b bg-zinc-50">
            <h2 className="font-semibold text-sm text-zinc-800">Steps</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                onClick={() => handleEditStep(step.id)}
                className={`p-3 rounded-lg cursor-pointer border transition-all duration-200 group ${
                  selectedStepId === step.id
                    ? "border-indigo-500 bg-indigo-50 shadow-sm"
                    : "border-transparent hover:bg-zinc-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      selectedStepId === step.id
                        ? "bg-indigo-200 text-indigo-700"
                        : "bg-zinc-200 text-zinc-700"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-zinc-900">
                      {step.promptText || "Untitled Step"}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {step.videoUrl || step.upload?.muxPlaybackId ? (
                        <Video className="w-3 h-3 text-green-600" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-amber-600" />
                      )}
                      <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
                        {step.responseType}
                      </span>
                      {step.isEndScreen && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          <Flag className="w-3 h-3" /> Final
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteDialog(step.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1.5 text-zinc-500 hover:text-red-600 hover:bg-red-50"
                    aria-label="Delete step"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t bg-zinc-50">
            <Button
              onClick={() => addNewStep("video")}
              variant="outline"
              className="w-full border-dashed text-zinc-700 hover:text-indigo-700 hover:border-indigo-300"
            >
              <Plus className="w-4 h-4 mr-2" /> Add Step
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden relative">
          {viewMode === "submissions" ? (
            <ThreadSubmissionsPanel threadId={threadId} />
          ) : viewMode === "flow" ? (
            <FlowEditor
              steps={steps}
              onUpdateStep={updateStepById}
              onEditStep={handleEditStep}
              onEditLogic={handleEditLogic}
              onAddStep={addNewStep}
              onPositionsChange={setNodePositions}
            />
          ) : (
            <>
              <div className="flex-1 p-8 flex flex-col items-center bg-zinc-100 overflow-y-auto">
                {selectedStep ? (
                  <div className="w-full max-w-3xl space-y-6">
                    <div className="bg-white p-1 rounded-2xl shadow-lg border border-zinc-300">
                      <div className="aspect-video bg-black rounded-xl overflow-hidden relative group">
                        {selectedStep.upload?.muxPlaybackId ? (
                          <>
                            <img
                              src={`https://image.mux.com/${selectedStep.upload.muxPlaybackId}/thumbnail.webp?width=960&height=540&fit_mode=crop`}
                              alt="Video thumbnail"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                              <Button variant="secondary" size="sm" onClick={handleClearVideo}>
                                <RotateCcw className="w-4 h-4 mr-2" /> Replace Video
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setIsLibraryOpen(true)}
                              >
                                <Library className="w-4 h-4 mr-2" /> Choose from Library
                              </Button>
                            </div>
                          </>
                        ) : selectedStep.videoUrl ? (
                          <>
                            <video src={selectedStep.videoUrl} controls className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                              <Button variant="secondary" size="sm" onClick={handleClearVideo}>
                                <RotateCcw className="w-4 h-4 mr-2" /> Replace Video
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setIsLibraryOpen(true)}
                              >
                                <Library className="w-4 h-4 mr-2" /> Choose from Library
                              </Button>
                            </div>
                          </>
                        ) : (
                          <VideoRecorder onUploadComplete={handleRecordingComplete} />
                        )}
                      </div>

                      {!selectedStep.videoUrl && !selectedStep.upload?.muxPlaybackId && (
                        <div className="flex justify-center py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50"
                            onClick={() => setIsLibraryOpen(true)}
                          >
                            <Library className="w-4 h-4 mr-2" /> Choose from Library
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-zinc-300 space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
                          Overlay Text
                        </label>
                        <input
                          type="text"
                          className="w-full text-2xl font-bold border-b-2 border-zinc-200 focus:border-indigo-500 outline-none py-2 transition-colors placeholder:text-zinc-400 text-zinc-950"
                          value={selectedStep.promptText || ""}
                          onChange={(e) => handleUpdateStep({ promptText: e.target.value })}
                          placeholder="Type your question here..."
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                    <Video className="w-16 h-16 mb-4 opacity-30" />
                    <p>Select a step to start editing</p>
                  </div>
                )}
              </div>

              <div className="w-96 border-l bg-white flex flex-col shrink-0">
                {selectedStep ? (
                  <Tabs defaultValue="settings" className="flex-1 flex flex-col">
                    <div className="px-4 pt-4">
                      <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                        <TabsTrigger value="logic">Logic</TabsTrigger>
                      </TabsList>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                      <TabsContent value="logic" className="mt-0 h-full space-y-4">
                        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-900">
                          <p className="flex items-center gap-2 font-medium mb-1">
                            <Workflow className="w-4 h-4" />
                            Visual Node Logic
                          </p>
                          <p className="text-indigo-800">
                            Use <strong>Logic Flow</strong> for node connections, or click below for the full logic editor.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditLogic(selectedStep.id)}
                          className="w-full text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                        >
                          <Workflow className="w-4 h-4 mr-2" />
                          Open Full Logic Editor
                        </Button>
                        <StepLogicEditor step={selectedStep} allSteps={steps} onChange={handleUpdateStep} />
                      </TabsContent>

                      <TabsContent value="settings" className="mt-0 space-y-6">
                        <div className="space-y-3">
                          <label className="text-sm font-medium text-zinc-900">Answer Type (Multi-select)</label>
                          <div className="grid grid-cols-2 gap-2">
                            {["video", "audio", "text", "button", "multiple_choice"].map((type) => {
                              const isSelected = selectedStep.allowedResponseTypes
                                ? selectedStep.allowedResponseTypes.includes(type as never)
                                : selectedStep.responseType === type;

                              return (
                                <div
                                  key={type}
                                  onClick={() => handleToggleResponseType(type)}
                                  className={`cursor-pointer border rounded-lg p-3 text-center text-sm capitalize transition-all ${
                                    isSelected
                                      ? "border-indigo-600 bg-indigo-50 text-indigo-800 font-semibold ring-1 ring-indigo-600"
                                      : "border-zinc-300 text-zinc-700 hover:border-zinc-400"
                                  }`}
                                >
                                  {type.replace("_", " ")}
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-xs text-zinc-600">
                            Primary type is the first selected option and controls default student input UI.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-zinc-900">Final Step</label>
                          <button
                            type="button"
                            onClick={() => handleUpdateStep({ isEndScreen: !selectedStep.isEndScreen })}
                            className={`w-full text-left rounded-lg border p-3 transition-colors ${
                              selectedStep.isEndScreen
                                ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                            }`}
                          >
                            {selectedStep.isEndScreen
                              ? "Marked as final step (thread can end here)"
                              : "Mark this as final step"}
                          </button>
                        </div>

                        <div className="pt-6 border-t border-zinc-200">
                          <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-70"
                          >
                            {saving ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4 mr-2" /> Save Changes
                              </>
                            )}
                          </Button>
                        </div>
                      </TabsContent>
                    </div>
                  </Tabs>
                ) : (
                  <div className="p-8 text-center text-zinc-500 text-sm">No step selected</div>
                )}
              </div>
            </>
          )}
        </div>

        <VideoLibraryPicker
          open={isLibraryOpen}
          onOpenChange={setIsLibraryOpen}
          onSelect={handleLibrarySelect}
        />

        <Dialog open={isLogicModalOpen} onOpenChange={setIsLogicModalOpen}>
          <DialogContent className="w-[99vw] max-w-none sm:max-w-none h-[97vh] flex flex-col p-0 overflow-hidden bg-zinc-50">
            <div className="sticky top-0 z-20 bg-white p-6 border-b border-zinc-300">
              <DialogHeader>
                <DialogTitle className="text-zinc-950">Configure Logic Step</DialogTitle>
                <DialogDescription className="text-zinc-800">
                  Define rules that route students to different paths.
                </DialogDescription>
              </DialogHeader>

              {editingLogicStep && (
                <div className="mt-4 flex items-center gap-4">
                  <Label className="w-24 shrink-0 text-zinc-950">Step Name</Label>
                  <Input
                    value={editingLogicStep.promptText || ""}
                    onChange={(e) =>
                      updateStepById(editingLogicStep.id, { promptText: e.target.value })
                    }
                    placeholder="e.g. Is Video Answer?"
                    className="flex-1 text-zinc-950 placeholder:text-zinc-500"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-hidden p-6 bg-zinc-100">
              {editingLogicStep && (
                <LogicRuleEditor
                  step={editingLogicStep}
                  allSteps={steps}
                  onUpdate={updateStepById}
                />
              )}
            </div>

            <DialogFooter className="sticky bottom-0 z-20 p-4 border-t border-zinc-200 bg-white">
              <Button onClick={() => setIsLogicModalOpen(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
          <DialogContent className="max-w-lg bg-white text-zinc-900">
            <DialogHeader>
              <DialogTitle className="text-zinc-950">Delete Step</DialogTitle>
              <DialogDescription className="text-zinc-600">
                If other nodes point to this step, choose where those paths should go before deleting.
              </DialogDescription>
            </DialogHeader>

            {deletingStepId && (
              <div className="space-y-4">
                {deletingReferences.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                    <p className="text-sm font-medium text-amber-900 mb-2">Referenced by:</p>
                    <ul className="space-y-1">
                      {deletingReferences.map((ref, idx) => (
                        <li key={`${ref.sourceStepId}-${idx}`} className="text-xs text-amber-900">
                          {ref.sourcePrompt} ({ref.field})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {deletingReferences.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="delete-replacement" className="text-zinc-900">Replacement route</Label>
                    <select
                      id="delete-replacement"
                      value={deleteReplacement}
                      onChange={(e) => setDeleteReplacement(e.target.value)}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                    >
                      <option value="">Select replacement...</option>
                      <option value="end_screen">End Screen</option>
                      {steps
                        .filter((s) => s.id !== deletingStepId)
                        .map((s, i) => (
                          <option key={s.id} value={s.id}>
                            Step {i + 1}: {s.promptText || "Untitled step"}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteStep}
                disabled={
                  isDeleting ||
                  !deletingStepId ||
                  (deletingReferences.length > 0 && !deleteReplacement)
                }
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Step"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function getInboundReferences(steps: PlayerStep[], targetStepId: string): StepReference[] {
  return steps
    .filter((s) => s.id !== targetStepId)
    .flatMap((s) => {
      const refs: StepReference[] = [];

      const logic = (s.logic as Array<{ nextStepId: string }> | null) ?? [];
      if (logic.some((l) => l.nextStepId === targetStepId)) {
        refs.push({
          sourceStepId: s.id,
          sourcePrompt: s.promptText || "Untitled step",
          field: "logic",
        });
      }

      const logicRules =
        (s.logicRules as Array<{ nextStepId: string }> | null) ?? [];
      if (logicRules.some((r) => r.nextStepId === targetStepId)) {
        refs.push({
          sourceStepId: s.id,
          sourcePrompt: s.promptText || "Untitled step",
          field: "logicRules",
        });
      }

      if (s.fallbackStepId === targetStepId) {
        refs.push({
          sourceStepId: s.id,
          sourcePrompt: s.promptText || "Untitled step",
          field: "fallbackStepId",
        });
      }

      return refs;
    });
}
