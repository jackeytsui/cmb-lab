export type VocalHackPreviewFormStatus = {
  formImportId: string;
  confidence: string;
};

export type VocalHackWorkflowPlacementStatus = {
  formImportId: string;
  status: string;
  totalSentences: number;
  readySentences: number;
};

export function getUnpreparedStrongVocalHackForms<
  T extends VocalHackPreviewFormStatus,
>(
  forms: T[],
  placements: VocalHackWorkflowPlacementStatus[],
): T[] {
  const preparedFormIds = new Set(
    placements.map((placement) => placement.formImportId),
  );

  return forms.filter(
    (form) =>
      (form.confidence === "exact" || form.confidence === "high") &&
      !preparedFormIds.has(form.formImportId),
  );
}

export function getVocalHackPreviewReadiness(
  placement: VocalHackWorkflowPlacementStatus | null,
) {
  if (!placement) {
    return {
      headline: "Review draft not prepared",
      detail: "Prepare before transcription",
      complete: false,
    };
  }

  const headline = `${placement.readySentences}/${placement.totalSentences} sentence text ready`;
  if (placement.status === "published") {
    return { headline, detail: "Published", complete: true };
  }
  if (placement.status === "ready_for_review") {
    return { headline, detail: "Ready for review", complete: true };
  }
  if (placement.status === "transcribing") {
    return { headline, detail: "AI transcription in progress", complete: false };
  }
  if (placement.status === "planned") {
    return { headline, detail: "AI transcription pending", complete: false };
  }

  return {
    headline,
    detail: placement.status.replaceAll("_", " "),
    complete: placement.readySentences === placement.totalSentences,
  };
}
