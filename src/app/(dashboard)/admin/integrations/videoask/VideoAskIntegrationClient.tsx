"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type FormSummary = {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: string | null;
};

type Props = {
  configured: boolean;
  connected: boolean;
  organizationName: string | null;
  organizationId: string | null;
  expiresAt: string | null;
  lastValidatedAt: string | null;
  lastError: string | null;
};

export function VideoAskIntegrationClient(props: Props) {
  const [scanning, setScanning] = useState(false);
  const [forms, setForms] = useState<FormSummary[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  async function scanInventory() {
    setScanning(true);
    setScanError(null);
    try {
      const response = await fetch("/api/admin/integrations/videoask/forms", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        forms?: FormSummary[];
        error?: string;
      };
      if (!response.ok || !payload.forms) {
        throw new Error(payload.error || "Inventory scan failed");
      }
      setForms(payload.forms);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Inventory scan failed");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {props.connected ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : null}
            VideoAsk connection
          </CardTitle>
          <CardDescription>
            OAuth access is refreshed automatically and its credentials are
            encrypted before being stored in Neon.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">
                {props.connected ? "Connected" : "Not connected"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Organization</dt>
              <dd className="font-medium">
                {props.organizationName || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Organization ID</dt>
              <dd className="break-all font-mono text-xs">
                {props.organizationId || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last API check</dt>
              <dd className="font-medium">
                {props.lastValidatedAt
                  ? new Date(props.lastValidatedAt).toLocaleString()
                  : "Not checked yet"}
              </dd>
            </div>
          </dl>

          {props.expiresAt ? (
            <p className="text-xs text-muted-foreground">
              The current access token expires {new Date(props.expiresAt).toLocaleString()}.
              CMB Lab will refresh it automatically.
            </p>
          ) : null}
          {props.lastError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Last connection error: {props.lastError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {props.configured ? (
              <Button asChild>
                <a href="/api/admin/integrations/videoask/connect">
                  <RefreshCw />
                  {props.connected ? "Reconnect VideoAsk" : "Connect VideoAsk"}
                </a>
              </Button>
            ) : (
              <Button disabled>
                <RefreshCw />
                Connect VideoAsk
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={scanInventory}
              disabled={!props.connected || scanning}
            >
              {scanning ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ScanSearch />
              )}
              {scanning ? "Scanning…" : "Scan inventory"}
            </Button>
          </div>
          {!props.configured ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Add the three VideoAsk environment variables in Vercel, then redeploy.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {scanError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {scanError}
        </p>
      ) : null}

      {forms ? (
        <Card>
          <CardHeader>
            <CardTitle>{forms.length} VideoAsk forms found</CardTitle>
            <CardDescription>
              This confirms CMB Lab can read the source inventory. No content has
              been changed or imported yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[28rem] overflow-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Form</th>
                    <th className="px-3 py-2 font-medium">Folder ID</th>
                  </tr>
                </thead>
                <tbody>
                  {forms.map((form) => (
                    <tr key={form.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{form.title}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {form.id}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {form.folderId || "Root"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
