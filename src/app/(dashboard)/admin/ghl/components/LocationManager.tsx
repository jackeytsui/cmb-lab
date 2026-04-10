"use client";

import { useState, useEffect, useCallback } from "react";

interface GhlLocation {
  id: string;
  name: string;
  ghlLocationId: string;
  isActive: boolean;
  hasApiToken: boolean;
  hasWebhookSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ConnectionResult {
  connected: boolean;
  locationName?: string;
  error?: string;
}

interface NewLocation {
  name: string;
  ghlLocationId: string;
  apiToken: string;
  webhookSecret: string;
}

export function LocationManager() {
  const [locations, setLocations] = useState<GhlLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ConnectionResult>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<NewLocation> & { isActive?: boolean }>({});
  const [newLocation, setNewLocation] = useState<NewLocation>({
    name: "",
    ghlLocationId: "",
    apiToken: "",
    webhookSecret: "",
  });

  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ghl/locations");
      const data = await res.json();
      setLocations(data.locations || []);
    } catch {
      setError("Failed to load locations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  async function handleAdd() {
    if (!newLocation.name || !newLocation.ghlLocationId || !newLocation.apiToken) {
      setError("Name, Location ID, and API Token are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ghl/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLocation),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add location");
        return;
      }
      setAdding(false);
      setNewLocation({ name: "", ghlLocationId: "", apiToken: "", webhookSecret: "" });
      await fetchLocations();
    } catch {
      setError("Failed to add location");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(locationId: string) {
    setTestingId(locationId);
    try {
      const res = await fetch(
        `/api/admin/ghl/test-connection?locationId=${locationId}`,
        { method: "POST" }
      );
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [locationId]: data }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [locationId]: { connected: false, error: "Network error" },
      }));
    } finally {
      setTestingId(null);
    }
  }

  async function handleToggleActive(location: GhlLocation) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/ghl/locations/${location.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !location.isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update");
        return;
      }
      await fetchLocations();
    } catch {
      setError("Failed to update location");
    }
  }

  async function handleDelete(locationId: string) {
    if (!confirm("Delete this location? Contacts linked to it will no longer sync.")) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/admin/ghl/locations/${locationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete");
        return;
      }
      await fetchLocations();
    } catch {
      setError("Failed to delete location");
    }
  }

  function startEdit(location: GhlLocation) {
    setEditingId(location.id);
    setEditFields({ name: location.name, webhookSecret: "" });
  }

  async function handleSaveEdit(locationId: string) {
    setSaving(true);
    setError(null);
    try {
      const updates: Record<string, unknown> = {};
      if (editFields.name) updates.name = editFields.name;
      if (editFields.apiToken) updates.apiToken = editFields.apiToken;
      if (editFields.webhookSecret !== undefined) updates.webhookSecret = editFields.webhookSecret;

      const res = await fetch(`/api/admin/ghl/locations/${locationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update");
        return;
      }
      setEditingId(null);
      setEditFields({});
      await fetchLocations();
    } catch {
      setError("Failed to update location");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
        <p className="text-zinc-400">Loading locations...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            GHL Locations (Sub-Accounts)
          </h3>
          <p className="mt-1 text-sm text-zinc-400">
            Connect multiple GHL sub-accounts. Tags sync bidirectionally with all active locations.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Add Location
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Add new location form */}
      {adding && (
        <div className="mb-6 rounded-lg border border-zinc-600 bg-zinc-900 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Display Name
              </label>
              <input
                type="text"
                placeholder="e.g. Main Sub-Account"
                value={newLocation.name}
                onChange={(e) =>
                  setNewLocation((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                GHL Location ID
              </label>
              <input
                type="text"
                placeholder="From GHL Settings > Business Info"
                value={newLocation.ghlLocationId}
                onChange={(e) =>
                  setNewLocation((prev) => ({
                    ...prev,
                    ghlLocationId: e.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                API Token (Private Integration Token)
              </label>
              <input
                type="password"
                placeholder="pit-xxxx..."
                value={newLocation.apiToken}
                onChange={(e) =>
                  setNewLocation((prev) => ({
                    ...prev,
                    apiToken: e.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Webhook Secret (Optional)
              </label>
              <input
                type="password"
                placeholder="For verifying inbound webhooks"
                value={newLocation.webhookSecret}
                onChange={(e) =>
                  setNewLocation((prev) => ({
                    ...prev,
                    webhookSecret: e.target.value,
                  }))
                }
                className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Location"}
            </button>
          </div>
        </div>
      )}

      {/* Location list */}
      {locations.length === 0 ? (
        <div className="rounded-md bg-zinc-700/50 px-4 py-6 text-center text-sm text-zinc-400">
          No GHL locations configured yet. Add one to start syncing tags.
        </div>
      ) : (
        <div className="space-y-3">
          {locations.map((location) => (
            <div
              key={location.id}
              className="rounded-lg border border-zinc-600 bg-zinc-900 p-4"
            >
              {editingId === location.id ? (
                /* Edit mode */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={editFields.name ?? ""}
                        onChange={(e) =>
                          setEditFields((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        New API Token (leave blank to keep current)
                      </label>
                      <input
                        type="password"
                        placeholder="Leave blank to keep current token"
                        value={editFields.apiToken ?? ""}
                        onChange={(e) =>
                          setEditFields((prev) => ({
                            ...prev,
                            apiToken: e.target.value,
                          }))
                        }
                        className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditFields({});
                      }}
                      className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(location.id)}
                      disabled={saving}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        location.isActive ? "bg-green-400" : "bg-zinc-500"
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {location.name}
                        </span>
                        {!location.isActive && (
                          <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                            Inactive
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500">
                        {location.ghlLocationId}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Test result */}
                    {testResults[location.id] && (
                      <span
                        className={`text-xs ${
                          testResults[location.id].connected
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {testResults[location.id].connected
                          ? testResults[location.id].locationName
                          : testResults[location.id].error}
                      </span>
                    )}

                    <button
                      onClick={() => handleTest(location.id)}
                      disabled={testingId === location.id}
                      className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {testingId === location.id ? "Testing..." : "Test"}
                    </button>
                    <button
                      onClick={() => startEdit(location)}
                      className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(location)}
                      className={`rounded-md border px-3 py-1.5 text-xs ${
                        location.isActive
                          ? "border-yellow-600/50 text-yellow-400 hover:bg-yellow-600/10"
                          : "border-green-600/50 text-green-400 hover:bg-green-600/10"
                      }`}
                    >
                      {location.isActive ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleDelete(location.id)}
                      className="rounded-md border border-red-600/50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-600/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
