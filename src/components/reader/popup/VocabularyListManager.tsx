"use client";

import { useState, useEffect } from "react";
import { 
  ListPlus, 
  Loader2, 
  Check, 
  Plus, 
  X,
  FolderOpen
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface VocabularyList {
  id: string;
  name: string;
  description?: string;
}

interface VocabularyListManagerProps {
  savedItemId: string | null;
  onEnsureSaved: () => Promise<string | null>;
}

export function VocabularyListManager({
  savedItemId,
  onEnsureSaved,
}: VocabularyListManagerProps) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<VocabularyList[]>([]);
  const [memberListIds, setMemberListIds] = useState<Set<string>>(new Set());
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [isLoadingMembership, setIsLoadingMembership] = useState(false);
  
  const [newListName, setNewListName] = useState("");
  const [isCreatingList, setIsCreatingList] = useState(false);

  // Fetch lists on open
  useEffect(() => {
    if (open) {
      setIsLoadingLists(true);
      fetch("/api/vocabulary/lists")
        .then((res) => res.json())
        .then((data) => {
          if (data.lists) setLists(data.lists);
        })
        .finally(() => setIsLoadingLists(false));
    }
  }, [open]);

  // Fetch membership if savedItemId exists
  useEffect(() => {
    if (open && savedItemId) {
      setIsLoadingMembership(true);
      fetch(`/api/vocabulary/items/${savedItemId}/membership`)
        .then((res) => res.json())
        .then((data) => {
          if (data.listIds) setMemberListIds(new Set(data.listIds));
        })
        .finally(() => setIsLoadingMembership(false));
    } else {
      setMemberListIds(new Set());
    }
  }, [open, savedItemId]);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    setIsCreatingList(true);
    try {
      const res = await fetch("/api/vocabulary/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName }),
      });
      const data = await res.json();
      if (data.list) {
        setLists((prev) => [data.list, ...prev]);
        setNewListName("");
        // Automatically add current item to new list?
        if (savedItemId) {
            await handleToggleList(data.list.id, true);
        }
      }
    } catch (err) {
      console.error("Failed to create list", err);
    } finally {
      setIsCreatingList(false);
    }
  };

  const handleToggleList = async (listId: string, forceAdd?: boolean) => {
    let currentSavedId = savedItemId;

    // If not saved, save first
    if (!currentSavedId) {
      currentSavedId = await onEnsureSaved();
      if (!currentSavedId) return; // Save failed
    }

    const isMember = memberListIds.has(listId);
    const shouldAdd = forceAdd !== undefined ? forceAdd : !isMember;

    // Optimistic update
    setMemberListIds((prev) => {
      const next = new Set(prev);
      if (shouldAdd) next.add(listId);
      else next.delete(listId);
      return next;
    });

    try {
      const method = shouldAdd ? "POST" : "DELETE";
      const res = await fetch(`/api/vocabulary/lists/${listId}/items`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedVocabularyIds: [currentSavedId] }),
      });
      if (!res.ok) throw new Error("Failed to update list");
    } catch {
      // Rollback
      setMemberListIds((prev) => {
        const next = new Set(prev);
        if (shouldAdd) next.delete(listId);
        else next.add(listId);
        return next;
      });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Manage Lists"
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 bg-card border-border text-foreground shadow-xl" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Add to Lists</h4>
            {isLoadingLists && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="New list name..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              className="h-8 text-xs bg-card border-border focus-visible:ring-primary/40"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateList();
              }}
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 bg-muted hover:bg-muted/80"
              onClick={handleCreateList}
              disabled={!newListName.trim() || isCreatingList}
            >
              {isCreatingList ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="h-40 overflow-y-auto -mx-1 px-1 custom-scrollbar">
            {lists.length === 0 && !isLoadingLists ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No lists created yet.
              </p>
            ) : (
              <div className="space-y-1">
                {lists.map((list) => {
                  const isSelected = memberListIds.has(list.id);
                  return (
                    <button
                      key={list.id}
                      onClick={() => handleToggleList(list.id)}
                      className="flex items-center justify-between w-full px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors group text-left"
                    >
                      <span className="truncate flex-1 pr-2">{list.name}</span>
                      {isSelected && (
                        <Check className="h-3 w-3 text-cyan-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
