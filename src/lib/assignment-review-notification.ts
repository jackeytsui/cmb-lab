/**
 * Students receive one notification when the whole assignment is first
 * reviewed. Editing an existing review must not create another notification.
 */
export function shouldNotifyAssignmentReview(previousStatus: string): boolean {
  return previousStatus !== "reviewed";
}
