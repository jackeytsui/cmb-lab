"use client";

import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { ChevronRight, ChevronDown, Loader2, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LessonNode {
  id: string;
  title: string;
}

interface ModuleNode {
  id: string;
  title: string;
  lessons: LessonNode[];
}

interface CourseNode {
  id: string;
  title: string;
  modules: ModuleNode[];
}

type CheckState = "checked" | "indeterminate" | "unchecked";

interface Grant {
  courseId: string;
  moduleId: string | null;
  lessonId: string | null;
}

interface PermissionTreeProps {
  roleId: string;
  courseTree: CourseNode[];
  initialGrants: Grant[];
  allCourses: boolean;
}

// ---------------------------------------------------------------------------
// Pure function: derive check state for every node from grants
// ---------------------------------------------------------------------------

function deriveTreeState(
  grants: Grant[],
  courseTree: CourseNode[]
): Map<string, CheckState> {
  const stateMap = new Map<string, CheckState>();

  for (const course of courseTree) {
    // Check if there is a course-level grant (moduleId=null, lessonId=null)
    const hasCourseGrant = grants.some(
      (g) =>
        g.courseId === course.id && g.moduleId === null && g.lessonId === null
    );

    if (hasCourseGrant) {
      // Course-level grant: everything under this course is checked
      stateMap.set(course.id, "checked");
      for (const mod of course.modules) {
        stateMap.set(mod.id, "checked");
        for (const lesson of mod.lessons) {
          stateMap.set(lesson.id, "checked");
        }
      }
      continue;
    }

    // No course-level grant -- check module and lesson levels
    let courseCheckedModules = 0;
    let courseHasAnyGrant = false;

    for (const mod of course.modules) {
      // Check for module-level grant
      const hasModuleGrant = grants.some(
        (g) =>
          g.courseId === course.id &&
          g.moduleId === mod.id &&
          g.lessonId === null
      );

      if (hasModuleGrant) {
        // Module-level grant: module and all its lessons are checked
        stateMap.set(mod.id, "checked");
        for (const lesson of mod.lessons) {
          stateMap.set(lesson.id, "checked");
        }
        courseCheckedModules++;
        courseHasAnyGrant = true;
        continue;
      }

      // No module-level grant -- check lesson-level
      let moduleCheckedLessons = 0;
      for (const lesson of mod.lessons) {
        const hasLessonGrant = grants.some(
          (g) =>
            g.courseId === course.id &&
            g.moduleId === mod.id &&
            g.lessonId === lesson.id
        );
        if (hasLessonGrant) {
          stateMap.set(lesson.id, "checked");
          moduleCheckedLessons++;
          courseHasAnyGrant = true;
        } else {
          stateMap.set(lesson.id, "unchecked");
        }
      }

      if (mod.lessons.length > 0 && moduleCheckedLessons === mod.lessons.length) {
        stateMap.set(mod.id, "checked");
        courseCheckedModules++;
      } else if (moduleCheckedLessons > 0) {
        stateMap.set(mod.id, "indeterminate");
      } else {
        stateMap.set(mod.id, "unchecked");
      }
    }

    // Determine course state
    if (
      course.modules.length > 0 &&
      courseCheckedModules === course.modules.length
    ) {
      stateMap.set(course.id, "checked");
    } else if (courseHasAnyGrant) {
      stateMap.set(course.id, "indeterminate");
    } else {
      stateMap.set(course.id, "unchecked");
    }
  }

  return stateMap;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PermissionTree({
  roleId,
  courseTree,
  initialGrants,
  allCourses,
}: PermissionTreeProps) {
  const [grants, setGrants] = useState<Grant[]>(initialGrants);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const checkStates = useMemo(
    () => deriveTreeState(grants, courseTree),
    [grants, courseTree]
  );

  const getCheckState = useCallback(
    (nodeId: string): CheckState => checkStates.get(nodeId) ?? "unchecked",
    [checkStates]
  );

  // ---------------------------------------------------------------------------
  // Auto-save helper
  // ---------------------------------------------------------------------------

  const savePermission = useCallback(
    async (
      key: string,
      payload: { courseId: string; moduleId: string | null; lessonId: string | null; granted: boolean },
      optimisticGrants: Grant[],
      rollbackGrants: Grant[]
    ) => {
      setSavingKey(key);
      try {
        const res = await fetch(`/api/admin/roles/${roleId}/courses`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Request failed");
        toast.success("Permissions updated");
      } catch {
        setGrants(rollbackGrants);
        toast.error("Failed to save permission");
      } finally {
        setSavingKey(null);
      }
    },
    [roleId]
  );

  // ---------------------------------------------------------------------------
  // Toggle handlers
  // ---------------------------------------------------------------------------

  const onToggleCourse = useCallback(
    (courseId: string, newChecked: boolean) => {
      const previousGrants = [...grants];

      if (newChecked) {
        // Select All: remove all rows for this course, add one course-level row
        const updated = grants.filter((g) => g.courseId !== courseId);
        updated.push({ courseId, moduleId: null, lessonId: null });
        setGrants(updated);
        savePermission(
          courseId,
          { courseId, moduleId: null, lessonId: null, granted: true },
          updated,
          previousGrants
        );
      } else {
        // Deselect All: remove all rows for this course
        const updated = grants.filter((g) => g.courseId !== courseId);
        setGrants(updated);
        savePermission(
          courseId,
          { courseId, moduleId: null, lessonId: null, granted: false },
          updated,
          previousGrants
        );
      }
    },
    [grants, savePermission]
  );

  const onToggleModule = useCallback(
    (courseId: string, moduleId: string, newChecked: boolean) => {
      const previousGrants = [...grants];

      if (newChecked) {
        // Remove any lesson-level rows for this module, add one module-level row
        const updated = grants.filter(
          (g) => !(g.courseId === courseId && g.moduleId === moduleId)
        );
        updated.push({ courseId, moduleId, lessonId: null });
        setGrants(updated);
        savePermission(
          moduleId,
          { courseId, moduleId, lessonId: null, granted: true },
          updated,
          previousGrants
        );
      } else {
        // Remove the module-level row and all lesson-level rows for this module
        const updated = grants.filter(
          (g) => !(g.courseId === courseId && g.moduleId === moduleId)
        );
        setGrants(updated);
        savePermission(
          moduleId,
          { courseId, moduleId, lessonId: null, granted: false },
          updated,
          previousGrants
        );
      }
    },
    [grants, savePermission]
  );

  const onToggleLesson = useCallback(
    (courseId: string, moduleId: string, lessonId: string, newChecked: boolean) => {
      const previousGrants = [...grants];

      if (newChecked) {
        // Add lesson-level row
        const updated = [...grants, { courseId, moduleId, lessonId }];
        setGrants(updated);
        savePermission(
          lessonId,
          { courseId, moduleId, lessonId, granted: true },
          updated,
          previousGrants
        );
      } else {
        // Remove lesson-level row
        const updated = grants.filter(
          (g) =>
            !(
              g.courseId === courseId &&
              g.moduleId === moduleId &&
              g.lessonId === lessonId
            )
        );
        setGrants(updated);
        savePermission(
          lessonId,
          { courseId, moduleId, lessonId, granted: false },
          updated,
          previousGrants
        );
      }
    },
    [grants, savePermission]
  );

  // ---------------------------------------------------------------------------
  // Checkbox value converter
  // ---------------------------------------------------------------------------

  function toCheckedProp(state: CheckState): boolean | "indeterminate" {
    if (state === "checked") return true;
    if (state === "indeterminate") return "indeterminate";
    return false;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (courseTree.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No courses available. Create courses first before configuring permissions.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {allCourses && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This role grants access to all courses. Individual course permissions
          below are overridden.
        </div>
      )}

      {courseTree.map((course) => {
        const courseState = getCheckState(course.id);

        return (
          <Collapsible key={course.id} defaultOpen={courseState !== "unchecked"}>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-800/50">
              {course.modules.length > 0 ? (
                <CollapsibleTrigger className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:text-zinc-200">
                  <ChevronRight className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                </CollapsibleTrigger>
              ) : (
                <span className="h-5 w-5" />
              )}
              <Checkbox
                checked={toCheckedProp(courseState)}
                onCheckedChange={(checked) =>
                  onToggleCourse(course.id, !!checked)
                }
                disabled={allCourses}
              />
              <span className="text-sm font-medium text-zinc-200">
                {course.title}
              </span>
              {savingKey === course.id && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
              )}
            </div>

            <CollapsibleContent>
              <div className="ml-5 border-l border-zinc-700/50 pl-2">
                {course.modules.map((mod) => {
                  const modState = getCheckState(mod.id);

                  return (
                    <Collapsible
                      key={mod.id}
                      defaultOpen={modState !== "unchecked"}
                    >
                      <div className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-zinc-800/50">
                        {mod.lessons.length > 0 ? (
                          <CollapsibleTrigger className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:text-zinc-200">
                            <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=open]>&]:rotate-90" />
                          </CollapsibleTrigger>
                        ) : (
                          <span className="h-5 w-5" />
                        )}
                        <Checkbox
                          checked={toCheckedProp(modState)}
                          onCheckedChange={(checked) =>
                            onToggleModule(course.id, mod.id, !!checked)
                          }
                          disabled={allCourses}
                        />
                        <span className="text-sm text-zinc-300">
                          {mod.title}
                        </span>
                        {savingKey === mod.id && (
                          <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                        )}
                      </div>

                      <CollapsibleContent>
                        <div className="ml-5 border-l border-zinc-700/30 pl-2">
                          {mod.lessons.map((lesson) => {
                            const lessonState = getCheckState(lesson.id);

                            return (
                              <div
                                key={lesson.id}
                                className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-zinc-800/50"
                              >
                                <span className="h-5 w-5" />
                                <Checkbox
                                  checked={toCheckedProp(lessonState)}
                                  onCheckedChange={(checked) =>
                                    onToggleLesson(
                                      course.id,
                                      mod.id,
                                      lesson.id,
                                      !!checked
                                    )
                                  }
                                  disabled={allCourses}
                                />
                                <span className="text-sm text-zinc-400">
                                  {lesson.title}
                                </span>
                                {savingKey === lesson.id && (
                                  <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
