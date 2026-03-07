"use client";

import { useState, useEffect, useCallback } from "react";

interface FieldMapping {
  id: string;
  lmsConcept: string;
  ghlFieldId: string;
  ghlFieldName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EditState {
  lmsConcept: string;
  ghlFieldId: string;
  ghlFieldName: string;
}

const CONCEPT_HINTS = ["timezone", "goals", "native_language", "learning_level"];

export function FieldMappingTable() {
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newMapping, setNewMapping] = useState<EditState>({
    lmsConcept: "",
    ghlFieldId: "",
    ghlFieldName: "",
  });
  const [editMapping, setEditMapping] = useState<EditState>({
    lmsConcept: "",
    ghlFieldId: "",
    ghlFieldName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchMappings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ghl/field-mappings");
      const data = await res.json();
      setMappings(data.fieldMappings || []);
    } catch {
      setError("Failed to load field mappings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  async function handleSaveNew() {
    if (!newMapping.lmsConcept || !newMapping.ghlFieldId || !newMapping.ghlFieldName) {
      setError("All fields are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ghl/field-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMapping),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save mapping");
        return;
      }
      setAdding(false);
      setNewMapping({ lmsConcept: "", ghlFieldId: "", ghlFieldName: "" });
      await fetchMappings();
    } catch {
      setError("Failed to save mapping");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!editMapping.lmsConcept || !editMapping.ghlFieldId || !editMapping.ghlFieldName) {
      setError("All fields are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ghl/field-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editMapping),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update mapping");
        return;
      }
      setEditingId(null);
      await fetchMappings();
    } catch {
      setError("Failed to update mapping");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, concept: string) {
    if (!confirm(`Delete mapping for "${concept}"?`)) return;
    try {
      const res = await fetch(`/api/admin/ghl/field-mappings/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Failed to delete mapping");
        return;
      }
      await fetchMappings();
    } catch {
      setError("Failed to delete mapping");
    }
  }

  function startEdit(mapping: FieldMapping) {
    setEditingId(mapping.id);
    setEditMapping({
      lmsConcept: mapping.lmsConcept,
      ghlFieldId: mapping.ghlFieldId,
      ghlFieldName: mapping.ghlFieldName,
    });
    setAdding(false);
    setError(null);
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-48 rounded bg-zinc-700" />
          <div className="h-4 w-64 rounded bg-zinc-700" />
          <div className="h-32 rounded bg-zinc-700" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Custom Field Mappings
          </h3>
          <p className="mt-1 text-sm text-zinc-400">
            Map GHL custom fields to LMS concepts for data sync.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setEditingId(null);
              setError(null);
            }}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Add Mapping
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-700 text-zinc-400">
              <th className="pb-3 pr-4 font-medium">LMS Concept</th>
              <th className="pb-3 pr-4 font-medium">GHL Field ID</th>
              <th className="pb-3 pr-4 font-medium">GHL Field Name</th>
              <th className="pb-3 pr-4 font-medium">Active</th>
              <th className="pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="border-b border-zinc-700/50">
                <td className="py-3 pr-4">
                  <input
                    type="text"
                    value={newMapping.lmsConcept}
                    onChange={(e) =>
                      setNewMapping({ ...newMapping, lmsConcept: e.target.value })
                    }
                    placeholder="e.g. timezone"
                    className="w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Suggestions: {CONCEPT_HINTS.join(", ")}
                  </p>
                </td>
                <td className="py-3 pr-4">
                  <input
                    type="text"
                    value={newMapping.ghlFieldId}
                    onChange={(e) =>
                      setNewMapping({ ...newMapping, ghlFieldId: e.target.value })
                    }
                    placeholder="e.g. contact.timezone"
                    className="w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                </td>
                <td className="py-3 pr-4">
                  <input
                    type="text"
                    value={newMapping.ghlFieldName}
                    onChange={(e) =>
                      setNewMapping({
                        ...newMapping,
                        ghlFieldName: e.target.value,
                      })
                    }
                    placeholder="e.g. Timezone"
                    className="w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                </td>
                <td className="py-3 pr-4">
                  <span className="text-zinc-500">--</span>
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveNew}
                      disabled={saving}
                      className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setAdding(false);
                        setError(null);
                        setNewMapping({
                          lmsConcept: "",
                          ghlFieldId: "",
                          ghlFieldName: "",
                        });
                      }}
                      className="rounded bg-zinc-600 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-500"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {mappings.map((mapping) =>
              editingId === mapping.id ? (
                <tr key={mapping.id} className="border-b border-zinc-700/50">
                  <td className="py-3 pr-4">
                    <input
                      type="text"
                      value={editMapping.lmsConcept}
                      onChange={(e) =>
                        setEditMapping({
                          ...editMapping,
                          lmsConcept: e.target.value,
                        })
                      }
                      className="w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      type="text"
                      value={editMapping.ghlFieldId}
                      onChange={(e) =>
                        setEditMapping({
                          ...editMapping,
                          ghlFieldId: e.target.value,
                        })
                      }
                      className="w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      type="text"
                      value={editMapping.ghlFieldName}
                      onChange={(e) =>
                        setEditMapping({
                          ...editMapping,
                          ghlFieldName: e.target.value,
                        })
                      }
                      className="w-full rounded border border-zinc-600 bg-zinc-700 px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        mapping.isActive
                          ? "bg-green-500/10 text-green-400"
                          : "bg-zinc-600 text-zinc-400"
                      }`}
                    >
                      {mapping.isActive ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setError(null);
                        }}
                        className="rounded bg-zinc-600 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={mapping.id} className="border-b border-zinc-700/50">
                  <td className="py-3 pr-4 text-white">{mapping.lmsConcept}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-zinc-300">
                    {mapping.ghlFieldId}
                  </td>
                  <td className="py-3 pr-4 text-zinc-300">
                    {mapping.ghlFieldName}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        mapping.isActive
                          ? "bg-green-500/10 text-green-400"
                          : "bg-zinc-600 text-zinc-400"
                      }`}
                    >
                      {mapping.isActive ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(mapping)}
                        className="rounded bg-zinc-600 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-500"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(mapping.id, mapping.lmsConcept)}
                        className="rounded bg-red-600/20 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-600/30"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>

        {mappings.length === 0 && !adding && (
          <p className="py-8 text-center text-sm text-zinc-500">
            No field mappings configured. Add mappings to sync GHL custom fields
            to LMS concepts.
          </p>
        )}
      </div>
    </div>
  );
}
