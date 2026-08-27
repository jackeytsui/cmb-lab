type VocalHackPlacementPublicationState = {
  status: string;
  publishedLessonId: string | null;
};

/** Published placements are immutable source snapshots for preparation. */
export function isVocalHackPlacementPublicationLocked(
  placement: VocalHackPlacementPublicationState,
) {
  return placement.status === "published" || Boolean(placement.publishedLessonId);
}
