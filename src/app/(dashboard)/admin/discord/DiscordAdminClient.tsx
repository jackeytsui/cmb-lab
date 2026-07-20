"use client";

import { useCallback, useEffect, useState } from "react";

interface Overview {
  botConfigured: boolean;
  oauthConfigured: boolean;
  guild: { id: string; name: string; memberCount?: number } | null;
  guildError: string | null;
  linkedUsers: number;
  joinedUsers: number;
  erroredUsers: number;
  activeMappings: number;
  removalPolicy: "kick" | "strip_roles";
  recentAudit: AuditEntry[];
}

interface AuditEntry {
  id: string;
  action: string;
  status: string;
  detail: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

interface Mapping {
  id: string;
  tagId: string;
  tagName: string;
  tagColor: string;
  discordRoleId: string;
  discordRoleName: string | null;
  grantsMembership: boolean;
  privateChannelId: string | null;
  isActive: boolean;
}

interface TagOption {
  id: string;
  name: string;
  color: string;
}

interface RoleOption {
  id: string;
  name: string;
}

interface Member {
  userId: string;
  name: string | null;
  email: string;
  discordUsername: string | null;
  guildStatus: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  tags: { name: string; color: string }[];
}

export function DiscordAdminClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Create-mapping form state
  const [formTagId, setFormTagId] = useState("");
  const [formRoleMode, setFormRoleMode] = useState<"existing" | "create">(
    "existing"
  );
  const [formRoleId, setFormRoleId] = useState("");
  const [formRoleName, setFormRoleName] = useState("");
  const [formPrivateChannel, setFormPrivateChannel] = useState(false);
  const [formGrantsMembership, setFormGrantsMembership] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, mapRes, tagRes, roleRes, memRes] = await Promise.all([
        fetch("/api/admin/discord/overview"),
        fetch("/api/admin/discord/role-mappings"),
        fetch("/api/admin/tags"),
        fetch("/api/admin/discord/roles"),
        fetch("/api/admin/discord/members"),
      ]);
      if (ovRes.ok) setOverview(await ovRes.json());
      if (mapRes.ok) setMappings((await mapRes.json()).mappings ?? []);
      if (tagRes.ok) setTags((await tagRes.json()).tags ?? []);
      if (roleRes.ok) setRoles((await roleRes.json()).roles ?? []);
      if (memRes.ok) setMembers((await memRes.json()).members ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function syncAll() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/discord/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        const s = data.stats;
        setMessage(
          `Sync complete: ${s.processed} processed, ${s.joined} joined, ${s.removed} removed, ${s.roleChanges} role updates, ${s.errors} errors.`
        );
        loadAll();
      } else {
        setMessage(data.error ?? "Sync failed");
      }
    } catch {
      setMessage("Network error running sync");
    } finally {
      setSyncing(false);
    }
  }

  async function setPolicy(policy: "kick" | "strip_roles") {
    const res = await fetch("/api/admin/discord/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removalPolicy: policy }),
    });
    if (res.ok && overview) {
      setOverview({ ...overview, removalPolicy: policy });
    }
  }

  async function createMapping() {
    if (!formTagId) return;
    setCreating(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        tagId: formTagId,
        grantsMembership: formGrantsMembership,
        createPrivateChannel: formPrivateChannel,
      };
      if (formRoleMode === "existing") body.discordRoleId = formRoleId;
      else body.createRoleName = formRoleName;

      const res = await fetch("/api/admin/discord/role-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(
          `Mapping created. Queued a Discord sync for ${data.syncQueued} student(s) holding the tag.`
        );
        setFormTagId("");
        setFormRoleId("");
        setFormRoleName("");
        setFormPrivateChannel(false);
        loadAll();
      } else {
        setMessage(data.error ?? "Failed to create mapping");
      }
    } catch {
      setMessage("Network error creating mapping");
    } finally {
      setCreating(false);
    }
  }

  async function toggleMapping(mapping: Mapping) {
    await fetch(`/api/admin/discord/role-mappings/${mapping.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !mapping.isActive }),
    });
    loadAll();
  }

  async function deleteMapping(mapping: Mapping) {
    if (
      !confirm(
        `Delete mapping "${mapping.tagName}" → ${mapping.discordRoleName ?? mapping.discordRoleId}? The Discord role is removed from all linked students holding the tag.`
      )
    ) {
      return;
    }
    await fetch(`/api/admin/discord/role-mappings/${mapping.id}`, {
      method: "DELETE",
    });
    loadAll();
  }

  async function syncMember(userId: string) {
    await fetch("/api/admin/discord/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    loadAll();
  }

  if (loading && !overview) {
    return <div className="text-zinc-400">Loading Discord settings...</div>;
  }

  const statusDot = (ok: boolean) => (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-green-400" : "bg-red-400"}`}
    />
  );

  return (
    <div className="space-y-8">
      {message && (
        <div className="rounded-md bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
          {message}
        </div>
      )}

      {/* Status */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Status</h2>
            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              <div className="flex items-center gap-2">
                {statusDot(!!overview?.botConfigured)}
                Bot configured{" "}
                <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
                  DISCORD_BOT_TOKEN / DISCORD_GUILD_ID
                </code>
              </div>
              <div className="flex items-center gap-2">
                {statusDot(!!overview?.oauthConfigured)}
                Student OAuth configured{" "}
                <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
                  DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
                </code>
              </div>
              {overview?.guild && (
                <div className="flex items-center gap-2">
                  {statusDot(true)}
                  Connected to <strong>{overview.guild.name}</strong>
                  {overview.guild.memberCount !== undefined && (
                    <span className="text-zinc-500">
                      ({overview.guild.memberCount} members)
                    </span>
                  )}
                </div>
              )}
              {overview?.guildError && (
                <div className="text-red-400">{overview.guildError}</div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <button
              onClick={syncAll}
              disabled={syncing || !overview?.botConfigured}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync all now"}
            </button>
            <div className="text-right text-sm text-zinc-400">
              <div>
                {overview?.linkedUsers ?? 0} linked · {overview?.joinedUsers ?? 0}{" "}
                in server · {overview?.erroredUsers ?? 0} with errors
              </div>
              <div>{overview?.activeMappings ?? 0} active role mappings</div>
            </div>
          </div>
        </div>

        {/* Removal policy */}
        <div className="mt-6 border-t border-zinc-800 pt-4">
          <h3 className="text-sm font-medium text-white">
            When a student loses access (tag removed / expired)
          </h3>
          <div className="mt-2 flex gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="radio"
                checked={overview?.removalPolicy === "kick"}
                onChange={() => setPolicy("kick")}
              />
              Remove them from the server
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="radio"
                checked={overview?.removalPolicy === "strip_roles"}
                onChange={() => setPolicy("strip_roles")}
              />
              Keep them in the server but strip student roles
            </label>
          </div>
        </div>
      </section>

      {/* Role mappings */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">
          Tag → Discord Role Mappings
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Students holding the tag get the Discord role automatically (and lose
          it when the tag is removed — e.g. by a GHL workflow on purchase,
          completion, or expiry).
        </p>

        {/* Create form */}
        <div className="mt-4 grid gap-3 rounded-md border border-zinc-800 bg-zinc-900 p-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-zinc-400">LMS / GHL tag</label>
            <select
              value={formTagId}
              onChange={(e) => setFormTagId(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              <option value="">Select a tag...</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400">Discord role</label>
            <div className="mt-1 flex gap-2">
              <select
                value={formRoleMode}
                onChange={(e) =>
                  setFormRoleMode(e.target.value as "existing" | "create")
                }
                className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm text-white"
              >
                <option value="existing">Existing</option>
                <option value="create">Create new</option>
              </select>
              {formRoleMode === "existing" ? (
                <select
                  value={formRoleId}
                  onChange={(e) => setFormRoleId(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                >
                  <option value="">Select a role...</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={formRoleName}
                  onChange={(e) => setFormRoleName(e.target.value)}
                  placeholder="New role name (e.g. Blueprint Student)"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                />
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={formGrantsMembership}
              onChange={(e) => setFormGrantsMembership(e.target.checked)}
            />
            Grants server membership (uncheck for bonus/cosmetic roles)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={formPrivateChannel}
              onChange={(e) => setFormPrivateChannel(e.target.checked)}
            />
            Also create a private channel only this role can see
          </label>
          <div className="md:col-span-2">
            <button
              onClick={createMapping}
              disabled={
                creating ||
                !formTagId ||
                (formRoleMode === "existing" ? !formRoleId : !formRoleName)
              }
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating..." : "Add mapping"}
            </button>
          </div>
        </div>

        {/* Mapping list */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-2 pr-4">Tag</th>
                <th className="py-2 pr-4">Discord role</th>
                <th className="py-2 pr-4">Membership</th>
                <th className="py-2 pr-4">Private channel</th>
                <th className="py-2 pr-4">Active</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-300">
              {mappings.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-zinc-500">
                    No mappings yet. Map your enrollment tag (e.g.
                    &quot;CNPLAB&quot;) to a Discord role to start automating.
                  </td>
                </tr>
              )}
              {mappings.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-4">
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: m.tagColor }}
                    />
                    {m.tagName}
                  </td>
                  <td className="py-2 pr-4">
                    {m.discordRoleName ?? m.discordRoleId}
                  </td>
                  <td className="py-2 pr-4">
                    {m.grantsMembership ? "Grants" : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {m.privateChannelId ? "Yes" : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => toggleMapping(m)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        m.isActive
                          ? "bg-green-500/10 text-green-400"
                          : "bg-zinc-700/50 text-zinc-400"
                      }`}
                    >
                      {m.isActive ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => deleteMapping(m)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Members */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Linked Students</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Students who connected their Discord account from the dashboard.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-2 pr-4">Student</th>
                <th className="py-2 pr-4">Discord</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Tags</th>
                <th className="py-2 pr-4">Last synced</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-300">
              {members.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-zinc-500">
                    No students have linked Discord yet. They connect from
                    Dashboard → Discord Community.
                  </td>
                </tr>
              )}
              {members.map((m) => (
                <tr key={m.userId}>
                  <td className="py-2 pr-4">
                    <div>{m.name ?? "—"}</div>
                    <div className="text-xs text-zinc-500">{m.email}</div>
                  </td>
                  <td className="py-2 pr-4">{m.discordUsername ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        m.guildStatus === "joined"
                          ? "bg-green-500/10 text-green-400"
                          : m.guildStatus === "removed"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-zinc-700/50 text-zinc-400"
                      }`}
                    >
                      {m.guildStatus}
                    </span>
                    {m.lastSyncError && (
                      <div
                        className="mt-1 max-w-[220px] truncate text-xs text-amber-400"
                        title={m.lastSyncError}
                      >
                        {m.lastSyncError}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex max-w-[240px] flex-wrap gap-1">
                      {m.tags.map((t) => (
                        <span
                          key={t.name}
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{
                            backgroundColor: `${t.color}22`,
                            color: t.color,
                          }}
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-xs text-zinc-500">
                    {m.lastSyncedAt
                      ? new Date(m.lastSyncedAt).toLocaleString()
                      : "never"}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => syncMember(m.userId)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Sync now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Audit log */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
        <div className="mt-4 space-y-2">
          {(overview?.recentAudit ?? []).length === 0 && (
            <p className="text-sm text-zinc-500">No Discord activity yet.</p>
          )}
          {(overview?.recentAudit ?? []).map((entry) => (
            <div
              key={entry.id}
              className="flex items-start justify-between gap-4 rounded-md bg-zinc-900 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span
                  className={`mr-2 font-mono text-xs ${
                    entry.status === "error"
                      ? "text-red-400"
                      : "text-green-400"
                  }`}
                >
                  {entry.action}
                </span>
                <span className="text-zinc-400">
                  {entry.userName ?? entry.userEmail ?? ""}
                </span>
                {entry.errorMessage && (
                  <div className="truncate text-xs text-red-400">
                    {entry.errorMessage}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-xs text-zinc-500">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
