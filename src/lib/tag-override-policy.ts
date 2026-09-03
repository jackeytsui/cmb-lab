export type AutomatedTagAction = "add" | "remove";

/**
 * No staff decision means automation may supply its default. Once staff has
 * chosen a state, automation may only move toward that state.
 */
export function shouldApplyTagChangeAgainstStaffOverride(params: {
  overrideIsAssigned: boolean | null | undefined;
  action: AutomatedTagAction;
}) {
  if (params.overrideIsAssigned == null) return true;
  return params.action === "add"
    ? params.overrideIsAssigned
    : !params.overrideIsAssigned;
}
