# Phase 32: Practice Set Builder - Research

**Researched:** 2026-02-06
**Domain:** Drag-and-drop builder UI, undo/redo state management, live preview, practice set composition
**Confidence:** HIGH

## Summary

Phase 32 builds a visual drag-and-drop practice set builder where coaches compose practice sets by dragging exercise type blocks from a palette onto a canvas, reordering them, editing inline, previewing, and publishing. This is the most complex UI in the entire v4.0 milestone -- it combines drag-and-drop primitives, undo/redo state management, inline editing, and live preview in a single page.

The foundation from Phase 31 is complete: the database schema (practice_sets, practice_exercises), the CRUD lib helpers, the API routes, the exercise type system (6 types with Zod validation), the ExerciseForm component (with 6 sub-forms), and the ExercisePreview component. Phase 32 wraps all of this in a builder experience.

The key architectural decisions are locked: @dnd-kit/react 0.2.1 for drag-and-drop (NOT the legacy @dnd-kit/core), useReducer with a past/present/future history stack for undo/redo, and the existing ExerciseForm + ExercisePreview components for inline editing and preview. The builder is a NEW page at `/admin/practice-sets/[setId]/builder` that replaces the form-based exercise management with a visual canvas experience.

**Primary recommendation:** Install `@dnd-kit/react` and `@dnd-kit/helpers`. Build a two-panel layout: left palette with draggable exercise type blocks, right canvas with sortable exercise list. Use `useReducer` with a history stack (`{ past, present, future }`) for undo/redo. Reuse the existing ExerciseForm sub-forms for inline editing and ExercisePreview for the live preview panel. Add a batch reorder API endpoint at `/api/admin/exercises/reorder` following the existing lessons/reorder pattern. Save as draft/publish via the existing practice-sets PUT API.

## Standard Stack

The established libraries/tools for this domain:

### Core (New - Must Install)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/react | ^0.2.1 | Drag-and-drop primitives (DragDropProvider, useDraggable, useDroppable, useSortable) | Project decision in STATE.md; new rewrite with simplified API, React 19 support |
| @dnd-kit/helpers | ^0.2.1 | Array manipulation utilities (move function for sortable lists) | Companion to @dnd-kit/react; provides move() helper for onDragOver |

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react (React 19) | 19.2.3 | useReducer for undo/redo state machine | No external undo/redo library needed |
| react-hook-form | 7.71.1 | Exercise inline editing forms | Already used by all 6 ExerciseForm sub-forms |
| @hookform/resolvers | 5.2.2 | Zod validation for exercise forms | Already used across all admin forms |
| zod | 4.3.6 | Exercise definition validation | Already used for all 6 exercise type schemas |
| framer-motion | 12.29.2 | Drag preview animations, drop transitions | Already installed; supplements @dnd-kit visual polish |
| lucide-react | 0.563.0 | Icons for exercise type palette blocks | Already installed; used throughout admin |
| nanoid | 5.1.6 | Temporary IDs for new exercises before server save | Already installed; used in exercise forms |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-alert-dialog | 1.1.15 | Confirm discard unsaved changes | When leaving builder with unsaved state |
| @radix-ui/react-tabs | (via shadcn) | Edit/Preview toggle in inline editor | Already installed from Phase 31 |
| @radix-ui/react-select | 2.2.6 | Exercise type selector in inline form | Already used in ExerciseForm |
| date-fns | 4.1.0 | Timestamp formatting in save status | Already installed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit/react | @hello-pangea/dnd | List-only (no palette-to-canvas drag); project decision locks @dnd-kit |
| @dnd-kit/react | framer-motion Reorder | Already installed, but only handles simple list reorder -- cannot do palette-to-canvas drag |
| useReducer history stack | use-undo library | use-undo adds a dependency for ~50 lines of code; useReducer is more flexible and already familiar |
| useReducer history stack | XState (already installed) | XState is powerful but overkill for undo/redo; useReducer with action types is simpler and standard |
| No external library for undo/redo | redux-undo or use-undo | Unnecessary dependency; the useReducer pattern with {past, present, future} is ~50 lines |

**Installation:**
```bash
npm install @dnd-kit/react @dnd-kit/helpers
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(dashboard)/admin/
│   └── practice-sets/
│       ├── page.tsx                         # Practice sets list page (redirects from exercises)
│       └── [setId]/
│           └── builder/
│               ├── page.tsx                 # Server component: load set + exercises, render BuilderClient
│               └── BuilderClient.tsx        # Client component: the full builder UI
├── components/admin/
│   ├── builder/
│   │   ├── BuilderCanvas.tsx               # Main canvas area with sortable exercise blocks
│   │   ├── BuilderPalette.tsx              # Side palette with draggable exercise type blocks
│   │   ├── BuilderToolbar.tsx              # Top toolbar: save, publish, undo, redo, preview toggle
│   │   ├── ExerciseBlock.tsx               # Single exercise block on canvas (collapsed view)
│   │   ├── ExerciseBlockEditor.tsx         # Expanded inline editor for a single exercise
│   │   └── BuilderPreviewPanel.tsx         # Live preview panel showing student view
│   └── exercises/
│       ├── ExerciseForm.tsx                # EXISTING - reuse for inline editing
│       ├── ExercisePreview.tsx             # EXISTING - reuse for live preview
│       ├── MultipleChoiceForm.tsx          # EXISTING
│       ├── FillInBlankForm.tsx             # EXISTING
│       ├── MatchingPairsForm.tsx           # EXISTING
│       ├── OrderingForm.tsx                # EXISTING
│       ├── AudioRecordingForm.tsx          # EXISTING
│       ├── FreeTextForm.tsx                # EXISTING
│       └── ExerciseList.tsx                # EXISTING
├── hooks/
│   └── useBuilderState.ts                  # Custom hook: useReducer + undo/redo + dirty tracking
├── lib/
│   └── practice.ts                         # EXISTING - add batch reorder helper
└── app/api/admin/
    ├── exercises/
    │   └── reorder/route.ts                # NEW - batch reorder exercises (PATCH)
    └── practice-sets/
        └── [setId]/
            └── duplicate/route.ts          # NEW - duplicate practice set with exercises (POST)
```

### Pattern 1: DragDropProvider with Palette-to-Canvas
**What:** Two-zone drag-and-drop: a palette of draggable exercise type blocks and a canvas of sortable exercise blocks. Dragging from palette creates a new exercise; dragging within canvas reorders.
**When to use:** The core builder interaction -- BUILD-01 (drag from palette) and BUILD-02 (reorder on canvas).
**Example:**
```typescript
// Source: @dnd-kit/react docs (next.dndkit.com) - adapted for builder
import { DragDropProvider } from '@dnd-kit/react';
import { useDraggable } from '@dnd-kit/react';
import { useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';

// Palette item (drag source only, not sortable)
function PaletteItem({ type, label, icon: Icon }: PaletteItemProps) {
  const { ref } = useDraggable({
    id: `palette-${type}`,
    data: { type, source: 'palette' }, // Mark as palette source
  });

  return (
    <button ref={ref} className="flex items-center gap-2 rounded-lg border ...">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

// Canvas item (sortable within canvas)
function CanvasExerciseBlock({ exercise, index }: CanvasBlockProps) {
  const { ref, isDragging } = useSortable({
    id: exercise.id,
    index,
    type: 'exercise',
    accept: ['exercise'], // Only accept reorder, not palette items
    group: 'canvas',
  });

  return (
    <div ref={ref} data-dragging={isDragging} className="...">
      {/* Exercise block content */}
    </div>
  );
}

// Builder wrapper
function Builder({ exercises, onAddExercise, onReorder }: BuilderProps) {
  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled) return;
        const { source, target } = event.operation;

        // Palette -> Canvas: create new exercise
        if (source.data?.source === 'palette' && target) {
          onAddExercise(source.data.type, target.data?.index);
          return;
        }

        // Canvas reorder: handled by useSortable internally
      }}
      onDragOver={(event) => {
        // For sortable reorder within canvas
        onReorder(event);
      }}
    >
      <div className="flex gap-4">
        <Palette />
        <Canvas exercises={exercises} />
      </div>
    </DragDropProvider>
  );
}
```

### Pattern 2: useReducer Undo/Redo History Stack
**What:** A custom hook that wraps useReducer with a `{ past: State[], present: State, future: State[] }` structure, enabling Ctrl+Z/Ctrl+Shift+Z undo/redo.
**When to use:** BUILD-05 (undo/redo). Every mutation to the exercises list (add, remove, reorder, edit) pushes the previous state onto `past`.
**Example:**
```typescript
// src/hooks/useBuilderState.ts
import { useReducer, useCallback, useEffect } from 'react';
import type { PracticeExercise } from '@/db/schema';

interface BuilderState {
  exercises: BuilderExercise[]; // exercises with local edits
  title: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
}

interface HistoryState {
  past: BuilderState[];
  present: BuilderState;
  future: BuilderState[];
}

type BuilderAction =
  | { type: 'ADD_EXERCISE'; exerciseType: string; atIndex?: number }
  | { type: 'REMOVE_EXERCISE'; exerciseId: string }
  | { type: 'REORDER_EXERCISES'; fromIndex: number; toIndex: number }
  | { type: 'UPDATE_EXERCISE'; exerciseId: string; data: Partial<BuilderExercise> }
  | { type: 'UPDATE_SET_META'; title?: string; description?: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'MARK_SAVED'; exercises: PracticeExercise[] }; // sync server IDs

function builderReducer(state: HistoryState, action: BuilderAction): HistoryState {
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    };
  }
  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return {
      past: [...state.past, state.present],
      present: next,
      future: state.future.slice(1),
    };
  }

  // All other actions push current to past and clear future
  const newPresent = applyAction(state.present, action);
  return {
    past: [...state.past, state.present],
    present: newPresent,
    future: [], // new action clears redo stack
  };
}

export function useBuilderState(initialState: BuilderState) {
  const [state, dispatch] = useReducer(builderReducer, {
    past: [],
    present: initialState,
    future: [],
  });

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { state: state.present, dispatch, canUndo, canRedo };
}
```

### Pattern 3: Inline Exercise Editing via Existing ExerciseForm
**What:** Clicking an exercise block on the canvas expands it to show the ExerciseForm sub-form (MultipleChoiceForm, etc.) inline. Edits update the local builder state, not the server directly.
**When to use:** BUILD-03 (click to open inline editor).
**Example:**
```typescript
// ExerciseBlockEditor wraps the existing sub-forms but saves locally instead of to API
function ExerciseBlockEditor({ exercise, onUpdate, onClose }: Props) {
  // The sub-forms currently save via fetch('/api/admin/exercises').
  // For inline editing, intercept onSave to dispatch to builder state instead.
  function handleLocalSave(updatedExercise: PracticeExercise) {
    onUpdate(exercise.id, {
      definition: updatedExercise.definition,
      language: updatedExercise.language,
    });
    onClose();
  }

  return (
    <div className="border border-blue-500/50 rounded-lg p-4 bg-zinc-800">
      <ExerciseForm
        practiceSetId={exercise.practiceSetId}
        exercise={exercise}
        onSave={handleLocalSave}
        onCancel={onClose}
      />
    </div>
  );
}
```

### Pattern 4: Live Preview Panel
**What:** A side panel or bottom panel that renders all exercises in the current builder state through ExercisePreview, showing exactly what students will see.
**When to use:** BUILD-04 (live preview).
**Example:**
```typescript
// BuilderPreviewPanel maps over current exercises and renders ExercisePreview for each
function BuilderPreviewPanel({ exercises }: { exercises: BuilderExercise[] }) {
  return (
    <div className="space-y-4 rounded-lg border border-zinc-600 bg-zinc-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Student Preview
      </p>
      {exercises.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Add exercises from the palette to see a preview.
        </p>
      ) : (
        exercises.map((ex, i) => (
          <div key={ex.id} className="space-y-1">
            <p className="text-xs text-zinc-500">Question {i + 1}</p>
            <ExercisePreview
              definition={ex.definition}
              language={ex.language}
            />
          </div>
        ))
      )}
    </div>
  );
}
```

### Pattern 5: Batch Save with Server Sync
**What:** Builder state is local (client-side). Save action pushes all changes to the server in a batch: create new exercises, update existing ones, delete removed ones, reorder all.
**When to use:** BUILD-06 (save as draft/publish).
**Example:**
```typescript
async function savePracticeSet(
  setId: string,
  localExercises: BuilderExercise[],
  serverExercises: PracticeExercise[],
  status: 'draft' | 'published'
) {
  const serverIds = new Set(serverExercises.map(e => e.id));

  // 1. Create new exercises (local ID starts with 'temp-')
  const newExercises = localExercises.filter(e => e.id.startsWith('temp-'));
  for (const ex of newExercises) {
    await fetch('/api/admin/exercises', {
      method: 'POST',
      body: JSON.stringify({
        practiceSetId: setId,
        type: ex.type,
        language: ex.language,
        definition: ex.definition,
        sortOrder: localExercises.indexOf(ex),
      }),
    });
  }

  // 2. Update modified exercises
  const existingExercises = localExercises.filter(e => serverIds.has(e.id));
  for (const ex of existingExercises) {
    await fetch(`/api/admin/exercises/${ex.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        language: ex.language,
        definition: ex.definition,
        sortOrder: localExercises.indexOf(ex),
      }),
    });
  }

  // 3. Delete removed exercises
  const localIds = new Set(localExercises.map(e => e.id));
  const deletedIds = serverExercises.filter(e => !localIds.has(e.id));
  for (const ex of deletedIds) {
    await fetch(`/api/admin/exercises/${ex.id}`, { method: 'DELETE' });
  }

  // 4. Update practice set status
  await fetch(`/api/admin/practice-sets/${setId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}
```

### Pattern 6: Practice Set Duplication
**What:** Server-side duplication of a practice set with all its exercises, creating a new set with "(Copy)" suffix.
**When to use:** BUILD-07 (duplicate practice set).
**Example:**
```typescript
// POST /api/admin/practice-sets/[setId]/duplicate
export async function POST(request: NextRequest, { params }: RouteParams) {
  // 1. Fetch original set + exercises
  const originalSet = await getPracticeSet(setId);
  const originalExercises = await listExercises(setId);

  // 2. Create new practice set
  const newSet = await createPracticeSet({
    title: `${originalSet.title} (Copy)`,
    description: originalSet.description,
    createdBy: user.id,
  });

  // 3. Copy all exercises into new set
  for (const ex of originalExercises) {
    await createExercise({
      practiceSetId: newSet.id,
      type: ex.type,
      language: ex.language,
      definition: ex.definition,
      sortOrder: ex.sortOrder,
    });
  }

  return NextResponse.json({ practiceSet: newSet }, { status: 201 });
}
```

### Anti-Patterns to Avoid
- **Server round-trip on every drag:** The builder must work entirely client-side. Only save to the server on explicit Save/Publish. Dragging and reordering should never trigger API calls.
- **Modifying ExerciseForm to dual-purpose (API save AND local save):** Instead, create a thin wrapper (ExerciseBlockEditor) that intercepts the onSave callback to dispatch to builder state instead of calling the API. This avoids modifying the working Phase 31 code.
- **Installing legacy @dnd-kit/core + @dnd-kit/sortable:** The project decision mandates @dnd-kit/react 0.2.1 (new rewrite). These are different packages with different APIs.
- **Using useState for undo/redo:** useReducer with action types is the correct pattern for undo/redo. useState makes it impossible to batch state updates atomically.
- **Storing the undo/redo history in a ref:** History must be in React state to trigger re-renders for the undo/redo button disabled states (canUndo, canRedo).
- **Infinite undo history:** Cap the past array at ~50 entries to prevent memory issues with large practice sets.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop | Custom mouse event handlers | @dnd-kit/react (DragDropProvider + useSortable + useDraggable) | Touch support, keyboard accessibility, collision detection, drag overlay |
| Sortable list reorder | Manual splice/swap logic | @dnd-kit/helpers `move()` function | Handles edge cases (same position, boundaries, multi-container) |
| Exercise forms | New form components for builder | Existing ExerciseForm + sub-forms from Phase 31 | Already built and validated for all 6 types |
| Exercise preview | New preview renderer | Existing ExercisePreview from Phase 31 | Already renders all 6 types with PhoneticText |
| Sort order persistence | Custom reorder logic | Existing `lessons/reorder` pattern (PATCH with items array) | Proven pattern in the codebase |
| Unique IDs for new exercises | Math.random() or UUID | nanoid() (already installed) with 'temp-' prefix | Distinguish new (unsaved) from existing exercises |
| Confirm discard dialog | Custom modal | Existing AlertDialog component (shadcn/ui) | Accessible, keyboard-navigable, project-consistent |

**Key insight:** Phase 32's complexity is in the orchestration (DnD + undo/redo + inline editing + preview + save sync), not in the individual components. Every atomic component already exists from Phase 31. The builder is a composition layer.

## Common Pitfalls

### Pitfall 1: @dnd-kit/react API Confusion with Legacy Docs
**What goes wrong:** Importing from `@dnd-kit/core` or `@dnd-kit/sortable` (legacy) instead of `@dnd-kit/react` (new rewrite). Or using `DndContext` instead of `DragDropProvider`.
**Why it happens:** Most tutorials and Stack Overflow answers reference the legacy API. The new @dnd-kit/react 0.2.1 has different imports and different hook signatures.
**How to avoid:** Always import from `@dnd-kit/react` (DragDropProvider, useDraggable, useDroppable) and `@dnd-kit/react/sortable` (useSortable). Never import from `@dnd-kit/core` or `@dnd-kit/sortable`. Reference next.dndkit.com, NOT docs.dndkit.com.
**Warning signs:** Import errors, `DndContext is not exported from @dnd-kit/react`, or `SortableContext` not found.

### Pitfall 2: @dnd-kit/react useSortable Source/Target Identity Bug
**What goes wrong:** In @dnd-kit/react 0.2.1, the `onDragEnd` event's `source` and `target` may report the same values after a sortable reorder, making it look like nothing changed.
**Why it happens:** Known issue in @dnd-kit/react (GitHub issue #1564, #1664). The new API handles reorder differently than the legacy API.
**How to avoid:** Use `onDragOver` instead of `onDragEnd` for sortable reorder. The `move()` helper from `@dnd-kit/helpers` handles the state update during `onDragOver`. Use `onDragEnd` only for palette-to-canvas drops (non-sortable).
**Warning signs:** Drag appears to work visually but exercises snap back to original position after drop.

### Pitfall 3: Undo/Redo with Deep Object References
**What goes wrong:** Pushing `state.present` to `past` array stores a reference, not a copy. Later mutations to `present` also mutate `past` entries.
**Why it happens:** JavaScript object references. The exercise definitions are nested objects (JSONB with arrays of options/pairs).
**How to avoid:** Deep clone the state when pushing to past: `past: [...state.past, structuredClone(state.present)]`. Use `structuredClone` (native, available in all modern browsers and Node.js 17+). Do NOT use `JSON.parse(JSON.stringify())` as it drops undefined values.
**Warning signs:** Undo restores the current state instead of the previous state. Multiple undos all show the same state.

### Pitfall 4: Orphaned Temporary IDs on Save
**What goes wrong:** New exercises created in the builder get temporary IDs (e.g., `temp-xxx`). After saving to the server, the server returns real UUIDs. If the builder state isn't updated with the real IDs, subsequent saves will try to create duplicates.
**Why it happens:** The save function creates exercises via POST (which returns new IDs) but the builder state still references temp IDs.
**How to avoid:** After a successful save, dispatch a `MARK_SAVED` action that replaces all temp IDs with the server-returned UUIDs. Track a mapping of `{ tempId -> serverId }` during the save process.
**Warning signs:** Duplicate exercises appearing after saving twice. Or "exercise not found" errors on the second save attempt.

### Pitfall 5: Unsaved Changes Lost on Navigation
**What goes wrong:** Coach adds exercises, reorders them, then clicks a link or navigates away without saving. All work is lost.
**Why it happens:** Builder state is entirely client-side; navigation unmounts the component.
**How to avoid:** Track a `isDirty` flag (compare current state to last saved state). When isDirty and user tries to navigate, show a confirmation dialog. Use `beforeunload` event for browser tab close, and Next.js router events (or an intercepting route) for in-app navigation.
**Warning signs:** Coaches report losing work when accidentally clicking Back or a nav link.

### Pitfall 6: Palette Drag Creates Exercise with Missing Definition
**What goes wrong:** Dragging an exercise type from the palette adds a block to the canvas, but the exercise has no definition (empty JSONB). If saved in this state, it fails Zod validation.
**Why it happens:** The palette drag only knows the exercise TYPE, not the full definition. The definition should be filled in via inline editing.
**How to avoid:** When adding from palette, create a BuilderExercise with a `status: 'empty'` flag and a skeleton definition (minimal valid structure). The Save action should validate that all exercises have been fully configured (no empty definitions) before saving. Show a visual indicator on unconfigured blocks.
**Warning signs:** Save fails with "Invalid definition" errors. Or exercises with empty questions appear in the student view.

### Pitfall 7: ExerciseForm onSave Triggers API Call
**What goes wrong:** The existing ExerciseForm sub-forms call `fetch('/api/admin/exercises')` directly in their onSubmit handler. Using them inline in the builder would save to the server on every edit, bypassing the builder's batch save model.
**Why it happens:** ExerciseForm was designed for standalone exercise CRUD (Phase 31), not for builder inline editing.
**How to avoid:** Two options: (a) Refactor ExerciseForm sub-forms to accept a `mode: 'api' | 'local'` prop that switches between API save and callback save. (b) Create a wrapper component (ExerciseBlockEditor) that intercepts the form submission and dispatches to builder state instead. Option (b) is preferred because it avoids modifying working Phase 31 code.
**Warning signs:** Exercises appear in the database immediately when editing in the builder, before the coach clicks Save.

## Code Examples

Verified patterns from official sources and existing codebase:

### @dnd-kit/react New API - DragDropProvider Setup
```typescript
// Source: next.dndkit.com/react/quickstart
import { DragDropProvider } from '@dnd-kit/react';
import { useDraggable } from '@dnd-kit/react';
import { useDroppable } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';

// Key API differences from legacy @dnd-kit/core:
// - DragDropProvider replaces DndContext
// - Hooks return { ref } object (not { setNodeRef, attributes, listeners })
// - useSortable from '@dnd-kit/react/sortable' (not '@dnd-kit/sortable')
// - move() from '@dnd-kit/helpers' (not arrayMove from '@dnd-kit/sortable')
// - Event: event.operation.source/target (not event.active/over)
```

### Sortable Exercise List on Canvas
```typescript
// Source: next.dndkit.com/react/guides/multiple-sortable-lists
import { useSortable } from '@dnd-kit/react/sortable';

function SortableExerciseBlock({ exercise, index }: { exercise: BuilderExercise; index: number }) {
  const { ref, isDragging } = useSortable({
    id: exercise.id,
    index,
    type: 'exercise',
    group: 'canvas',
  });

  return (
    <div
      ref={ref}
      data-dragging={isDragging}
      className={cn(
        "rounded-lg border bg-zinc-800 p-3 transition-all",
        isDragging && "opacity-50 border-blue-500",
      )}
    >
      {/* Collapsed exercise block UI */}
    </div>
  );
}
```

### Undo/Redo Keyboard Binding
```typescript
// Source: Standard React pattern
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    // Ctrl+Z (or Cmd+Z on Mac) = Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      dispatch({ type: 'UNDO' });
    }
    // Ctrl+Shift+Z (or Cmd+Shift+Z on Mac) = Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      dispatch({ type: 'REDO' });
    }
    // Also support Ctrl+Y for redo (Windows convention)
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      dispatch({ type: 'REDO' });
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [dispatch]);
```

### Batch Reorder API (following existing lessons/reorder pattern)
```typescript
// Source: Existing pattern from src/app/api/admin/lessons/reorder/route.ts
// New: POST /api/admin/exercises/reorder
export async function PATCH(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const items: { id: string; sortOrder: number }[] = body.items;

  // Validate all items have id and sortOrder
  // Verify all exercises belong to same practice set
  // Update in transaction
  const updated = await db.transaction(async (tx) => {
    const results = [];
    for (const item of items) {
      const [result] = await tx
        .update(practiceExercises)
        .set({ sortOrder: item.sortOrder })
        .where(eq(practiceExercises.id, item.id))
        .returning();
      results.push(result);
    }
    return results;
  });

  return NextResponse.json({ exercises: updated });
}
```

### beforeunload Guard for Unsaved Changes
```typescript
// Source: Standard browser API
useEffect(() => {
  if (!isDirty) return;

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    e.preventDefault();
    // Modern browsers show a generic message
  }

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [isDirty]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @dnd-kit/core + @dnd-kit/sortable + DndContext | @dnd-kit/react + @dnd-kit/helpers + DragDropProvider | 2025 rewrite (0.2.x) | Simplified API: single `ref` return, no spreading attributes/listeners |
| redux-undo or use-undo library | Native useReducer with {past, present, future} | React 18+ pattern | No dependency needed; ~50 lines of custom code |
| JSON.parse(JSON.stringify()) for deep clone | structuredClone() | Available since Node 17 / Chrome 98 | Handles more types, no data loss |
| DragOverlay from @dnd-kit/core | Built-in drag feedback in @dnd-kit/react | 0.2.x | Simpler API, automatic visual feedback |

**Deprecated/outdated:**
- @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities: Replaced by @dnd-kit/react + @dnd-kit/helpers
- react-beautiful-dnd: Deprecated by Atlassian (2023)
- DndContext: Replaced by DragDropProvider in @dnd-kit/react

## Open Questions

Things that couldn't be fully resolved:

1. **@dnd-kit/react 0.2.x Sortable onDragEnd vs onDragOver**
   - What we know: GitHub issues #1564 and #1664 report that onDragEnd source/target are identical for sortable reorder. The move() helper from @dnd-kit/helpers is designed for onDragOver.
   - What's unclear: Whether this is fixed in 0.2.1 or if it's still an issue. The official examples use onDragOver + move() for sortable.
   - Recommendation: Use onDragOver + move() for canvas reorder. Use onDragEnd only for detecting palette-to-canvas drops. Test thoroughly during implementation.

2. **ExerciseForm Refactoring Scope**
   - What we know: The existing ExerciseForm sub-forms save to the API directly via fetch(). The builder needs local-only saving.
   - What's unclear: Whether to (a) refactor sub-forms to accept a save mode prop, or (b) create a wrapper that intercepts onSave.
   - Recommendation: Option (b) - wrapper approach. This avoids modifying 6 working sub-form components and keeps Phase 31 code intact. The wrapper intercepts the `onSave` callback.

3. **Builder Page URL Structure**
   - What we know: Phase 31 uses `/admin/exercises` for standalone exercise CRUD. Phase 32 needs a builder page per practice set.
   - What's unclear: Whether to use `/admin/practice-sets/[setId]/builder` or `/admin/exercises/builder/[setId]`.
   - Recommendation: `/admin/practice-sets/[setId]/builder` -- the builder is fundamentally about the practice set, not individual exercises. The standalone `/admin/exercises` page from Phase 31 remains as a fallback/advanced editing mode.

4. **History Stack Size Limit**
   - What we know: Each history entry is a deep clone of the full builder state (exercises array with JSONB definitions).
   - What's unclear: How large the state can get with 20+ exercises and complex definitions. Memory impact of 50+ history entries.
   - Recommendation: Cap history at 50 entries. For a practice set with 20 exercises of ~500 bytes each, 50 history entries = ~500KB, which is negligible.

## Sources

### Primary (HIGH confidence)
- @dnd-kit/react docs (next.dndkit.com/react) - DragDropProvider, useDraggable, useDroppable, useSortable API
- @dnd-kit/react quickstart (next.dndkit.com/react/quickstart) - Installation, basic setup
- @dnd-kit/react multiple sortable lists guide (next.dndkit.com/react/guides/multiple-sortable-lists) - move() helper, multi-container
- Existing codebase: `src/components/admin/exercises/ExerciseForm.tsx` - Sub-form delegation pattern
- Existing codebase: `src/components/admin/exercises/ExercisePreview.tsx` - All 6 exercise type previews
- Existing codebase: `src/lib/practice.ts` - CRUD helpers for exercises and practice sets
- Existing codebase: `src/app/api/admin/lessons/reorder/route.ts` - Batch reorder API pattern
- Existing codebase: `src/app/api/admin/practice-sets/[setId]/route.ts` - Practice set CRUD
- Existing codebase: `src/types/exercises.ts` - ExerciseDefinition types and Zod schemas

### Secondary (MEDIUM confidence)
- @dnd-kit/react migration guide (next.dndkit.com/react/guides/migration) - Legacy to new API differences
- @dnd-kit/react npm (npmjs.com/package/@dnd-kit/react) - v0.2.1, Jan 2026, React 19 peer dep
- GitHub issue #1564 - useSortable source/target identity in onDragEnd
- GitHub issue #1664 - source and target identical in onDragEnd for sortable
- use-undo library (github.com/homerchen19/use-undo) - Reference implementation of {past, present, future} pattern
- Redux Implementing Undo History (redux.js.org/usage/implementing-undo-history) - Canonical undo/redo pattern

### Tertiary (LOW confidence)
- @dnd-kit/react 0.2.x production readiness (version is 0.x semver, potential breaking changes before 1.0)
- Palette-to-canvas drag pattern with @dnd-kit/react (examples are mostly sortable lists, not palette-to-droppable-canvas)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @dnd-kit/react confirmed as project decision; installation verified; all other libs already installed
- Architecture: HIGH - Builder is composition of existing Phase 31 components; patterns verified from codebase
- Pitfalls: HIGH - Key issues identified from GitHub issues (#1564, #1664), deep clone gotchas, and API save model conflicts
- DnD implementation details: MEDIUM - @dnd-kit/react 0.2.x is new; palette-to-canvas pattern less documented than sortable lists

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days - @dnd-kit/react is actively developed, may have updates)
