"use client";

import { useState, useEffect } from "react";
import { CreateListDialog } from "./CreateListDialog";
import { AssignListDialog } from "./AssignListDialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Users } from "lucide-react";

interface VocabularyList {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  assignmentCount: number;
}

export function VocabularyListsClient() {
  const [lists, setLists] = useState<VocabularyList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [assignListId, setAssignListId] = useState<string | null>(null);

  const fetchLists = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/coach/vocabulary/lists");
      const data = await res.json();
      if (data.lists) setLists(data.lists);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLists();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vocabulary Lists</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and assign vocabulary lists to students.
          </p>
        </div>
        <CreateListDialog onSuccess={fetchLists} />
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : lists.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <p className="text-muted-foreground">No vocabulary lists created yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <Card key={list.id} className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-foreground">{list.name}</CardTitle>
                {list.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {list.description}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {list.assignmentCount} Assignments
                  </span>
                  <span>
                    {new Date(list.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full border-border hover:bg-muted"
                    onClick={() => setAssignListId(list.id)}
                  >
                    Assign
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {assignListId && (
        <AssignListDialog
          listId={assignListId}
          onClose={() => setAssignListId(null)}
          onSuccess={() => {
            fetchLists(); // Update counts
            setAssignListId(null);
          }}
        />
      )}
    </div>
  );
}
