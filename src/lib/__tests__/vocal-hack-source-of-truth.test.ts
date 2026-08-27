import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const viewer = readFileSync(
  path.join(
    process.cwd(),
    "src/app/(dashboard)/dashboard/course-library/[courseId]/lessons/[lessonId]/VocalHackViewer.tsx",
  ),
  "utf8",
);
const legacyAssignment = readFileSync(
  path.join(
    process.cwd(),
    "src/components/assignments/VocalHackAssignment.tsx",
  ),
  "utf8",
);
const consensusMigration = readFileSync(
  path.join(
    process.cwd(),
    "src/db/migrations/0097_vocal_hack_consensus_alignment.sql",
  ),
  "utf8",
);
const residualConsensusMigration = readFileSync(
  path.join(
    process.cwd(),
    "src/db/migrations/0098_vocal_hack_residual_consensus_alignment.sql",
  ),
  "utf8",
);
const residualRomanisationMigration = readFileSync(
  path.join(
    process.cwd(),
    "src/db/migrations/0099_vocal_hack_residual_romanisation.sql",
  ),
  "utf8",
);
const toneSandhiMigration = readFileSync(
  path.join(
    process.cwd(),
    "src/db/migrations/0100_vocal_hack_one_tone_sandhi.sql",
  ),
  "utf8",
);

describe("Vocal Hack video source-of-truth guidance", () => {
  it("shows the guidance before every Vocal Hack sentence list", () => {
    const notice = viewer.indexOf('data-testid="vocal-hack-source-of-truth"');
    const sentenceList = viewer.indexOf("{sentences.map((sentence, idx)");

    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(sentenceList);
    expect(viewer).toContain("Video is the source of truth");
    expect(viewer).toContain(
      "If any wording, pronunciation, or meaning shown in CMB Lab differs",
    );
    expect(viewer).toContain("from the coach video, follow the coach video.");
  });

  it("shows the same guidance in the legacy Vocal Hack assignment renderer", () => {
    const notice = legacyAssignment.indexOf(
      'data-testid="legacy-vocal-hack-source-of-truth"',
    );
    const sentenceCard = legacyAssignment.indexOf("{/* Sentence card */}");

    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(sentenceCard);
    expect(legacyAssignment).toContain("Video is the source of truth");
    expect(legacyAssignment).toContain(
      "If any wording, pronunciation, or meaning shown in CMB Lab differs",
    );
    expect(legacyAssignment).toContain(
      "from the coach video, follow the coach video.",
    );
  });

  it("keeps every consensus-backed video correction guarded and staged", () => {
    const confirmedSentenceIds = [
      "c8f92c5b-db28-4f23-9501-9512a8c66228",
      "17dfa53c-1bbb-4dbb-9e62-acd33647170b",
      "95477360-45f4-42cc-8cea-123d5c89723f",
      "abfa15b8-d45e-4c52-a8ce-0961524e87c8",
      "9fbe9898-5389-4482-88e1-9a85e72f4c5c",
      "0da0f1b1-9a98-40f3-8c05-43c2b238aeed",
      "cb17c681-c6c7-4f05-a92b-3888fbfc9f07",
      "bea8a3e7-5d4a-4470-9a07-28e6bf2c6fcb",
      "3120c8f4-8dfb-4c05-9625-0f33302617f1",
    ];

    for (const sentenceId of confirmedSentenceIds) {
      expect(consensusMigration.match(new RegExp(sentenceId, "g"))).toHaveLength(2);
    }
    expect(consensusMigration).toContain("GET DIAGNOSTICS changed_count");
    expect(consensusMigration).toContain("RAISE EXCEPTION");
    expect(consensusMigration).toContain(
      'UPDATE "videoask_vocal_hack_sentences" AS staged',
    );

    const residualSentenceIds = [
      "ad57fa14-6690-455b-abb0-a73752f6ea94",
      "22a20420-3862-47d5-8cae-f31c6163693c",
      "32279d3f-6417-41e0-842a-2fe5d2e77bf5",
      "1271589d-18ce-4c8a-9031-d1b77510481f",
      "5042ef6e-6df5-4589-a6f9-9c85afa19ffa",
      "dafaef58-5811-425c-83f6-97eb53ec2bda",
      "68978898-8df4-4a40-a6b9-03ab9ba9c6cf",
      "899b6e12-4383-47e9-a06e-1040c66ed36e",
    ];
    for (const sentenceId of residualSentenceIds) {
      expect(
        residualConsensusMigration.match(new RegExp(sentenceId, "g")),
      ).toHaveLength(2);
    }
    expect(residualConsensusMigration).toContain("GET DIAGNOSTICS changed_count");
    expect(residualConsensusMigration).toContain("RAISE EXCEPTION");
    expect(residualConsensusMigration).toContain(
      'UPDATE "videoask_vocal_hack_sentences" AS staged',
    );
    for (const sentenceId of [
      "68978898-8df4-4a40-a6b9-03ab9ba9c6cf",
      "dafaef58-5811-425c-83f6-97eb53ec2bda",
    ]) {
      expect(
        residualRomanisationMigration.match(new RegExp(sentenceId, "g")),
      ).toHaveLength(2);
    }
    expect(residualRomanisationMigration).toContain(
      'UPDATE "videoask_vocal_hack_sentences" AS staged',
    );
    expect(
      toneSandhiMigration.match(
        new RegExp("68978898-8df4-4a40-a6b9-03ab9ba9c6cf", "g"),
      ),
    ).toHaveLength(4);
    expect(toneSandhiMigration).toContain(
      'UPDATE "videoask_vocal_hack_sentences" AS staged',
    );
  });
});
