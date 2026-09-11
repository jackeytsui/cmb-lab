// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { makeWebmSeekable } from "@/lib/seekable-webm";

describe("makeWebmSeekable integration", () => {
  it("repairs a real browser recording and is idempotent", async () => {
    const bytes = await readFile(
      resolve(
        process.cwd(),
        "public/uploads/submissions/submission-1771135664333-sykxd0km1m.webm",
      ),
    );
    const original = new Blob([bytes], { type: "audio/webm;codecs=opus" });

    const repaired = await makeWebmSeekable(original);
    const repairedAgain = await makeWebmSeekable(repaired);

    expect(repaired.size).toBeGreaterThan(0);
    expect(repaired.type).toBe(original.type);
    expect(await repairedAgain.arrayBuffer()).toEqual(
      await repaired.arrayBuffer(),
    );
  });
});
