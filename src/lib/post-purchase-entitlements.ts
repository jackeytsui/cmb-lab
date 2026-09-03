export const POST_PURCHASE_CONTROLLED_TAGS = [
  "cmb_student",
  "ic_student",
  "1on1_student",
  "icgc_student",
  "custom_course_student",
] as const;

export type PostPurchaseControlledTag =
  (typeof POST_PURCHASE_CONTROLLED_TAGS)[number];

export type PostPurchaseTagOverride = {
  tagName: string;
  isAssigned: boolean;
};

export type PostPurchaseEntitlementInput = {
  productLine?: string | string[] | null;
  addOnPurchased?: string | string[] | null;
  /**
   * Legacy rosters store active 1:1 access in dedicated eligibility/end-date
   * fields instead of Add-on Purchased. The caller must set this only after
   * confirming that eligibility is YES and the 1:1 end date has not passed.
   */
  oneOnOneEligibilityActive?: boolean | null;
  /**
   * When explicitly false, a 1:1 purchase is kept pending until CMB Lab has
   * a real coach assignment. Omit this during the initial webhook so the
   * provisioning flow can resolve the coach from the newly linked contacts.
   */
  oneOnOneCoachAssigned?: boolean | null;
};

export type PostPurchaseSourceRow = PostPurchaseEntitlementInput & {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type AggregatedPostPurchaseStudent = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  productLine: string[];
  addOnPurchased: string[];
  oneOnOneEligibilityActive: boolean;
  sourceRows: number;
};

function normalizeValues(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .flatMap((item) => item.split(","))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function uniqueRawValues(values: Array<string | string[] | null | undefined>) {
  const result = new Map<string, string>();
  for (const value of values) {
    const items = Array.isArray(value) ? value : value ? [value] : [];
    for (const item of items.flatMap((entry) => entry.split(","))) {
      const trimmed = item.trim();
      if (trimmed) result.set(trimmed.toLowerCase(), trimmed);
    }
  }
  return [...result.values()];
}

/**
 * A person can appear more than once in the synced GHL snapshot. Reconcile
 * their union of purchases once so one row cannot remove an entitlement that
 * another row grants.
 */
export function aggregatePostPurchaseStudents(
  rows: PostPurchaseSourceRow[]
): AggregatedPostPurchaseStudent[] {
  const byEmail = new Map<string, PostPurchaseSourceRow[]>();
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (!email) continue;
    const entries = byEmail.get(email) ?? [];
    entries.push(row);
    byEmail.set(email, entries);
  }

  return [...byEmail.entries()].map(([email, entries]) => ({
    email,
    firstName:
      entries.find((entry) => entry.firstName?.trim())?.firstName?.trim() ??
      null,
    lastName:
      entries.find((entry) => entry.lastName?.trim())?.lastName?.trim() ?? null,
    productLine: uniqueRawValues(entries.map((entry) => entry.productLine)),
    addOnPurchased: uniqueRawValues(
      entries.map((entry) => entry.addOnPurchased)
    ),
    oneOnOneEligibilityActive: entries.some(
      (entry) => entry.oneOnOneEligibilityActive === true
    ),
    sourceRows: entries.length,
  }));
}

export function derivePostPurchaseTags(
  input: PostPurchaseEntitlementInput
): PostPurchaseControlledTag[] {
  const products = normalizeValues(input.productLine);
  const addOns = normalizeValues(input.addOnPurchased);
  const expected = new Set<PostPurchaseControlledTag>();

  if (products.some((value) => value.includes("cmbp"))) {
    expected.add("cmb_student");
  }
  if (products.some((value) => value.includes("improve canto"))) {
    expected.add("ic_student");
  }
  const hasOneOnOneEntitlement =
    addOns.some((value) => value.includes("1:1 coaching")) ||
    input.oneOnOneEligibilityActive === true;
  if (hasOneOnOneEntitlement && input.oneOnOneCoachAssigned !== false) {
    expected.add("1on1_student");
  }
  if (addOns.some((value) => value.includes("icgc"))) {
    expected.add("icgc_student");
  }
  if (addOns.some((value) => value.includes("custom course"))) {
    // Purchase/fulfillment marker only. Custom content must still be granted
    // to the individual student; cc_student means Confident Cantonese.
    expected.add("custom_course_student");
  }

  return POST_PURCHASE_CONTROLLED_TAGS.filter((tag) => expected.has(tag));
}

export function planPostPurchaseTagReconciliation(params: {
  currentTags: Iterable<string>;
  expectedTags: Iterable<PostPurchaseControlledTag>;
}) {
  const current = new Set(
    [...params.currentTags].map((tag) => tag.trim().toLowerCase())
  );
  const expected = new Set(params.expectedTags);

  return {
    add: POST_PURCHASE_CONTROLLED_TAGS.filter(
      (tag) => expected.has(tag) && !current.has(tag)
    ),
    // Access synchronization is deliberately additive. A missing source tag
    // can mean that an older purchase, a spreadsheet fallback, or a manual
    // grant has not made it into that source yet. Only an explicit staff
    // force-off may remove access.
    remove: [] as PostPurchaseControlledTag[],
  };
}

/** Apply durable staff choices after deriving the automated GHL defaults. */
export function applyPostPurchaseTagOverrides(params: {
  expectedTags: Iterable<PostPurchaseControlledTag>;
  overrides: Iterable<PostPurchaseTagOverride>;
}): PostPurchaseControlledTag[] {
  const expected = new Set<PostPurchaseControlledTag>(params.expectedTags);
  const managed = new Set<string>(POST_PURCHASE_CONTROLLED_TAGS);

  for (const override of params.overrides) {
    const normalized = override.tagName.trim().toLowerCase();
    if (!managed.has(normalized)) continue;
    const tag = normalized as PostPurchaseControlledTag;
    if (override.isAssigned) expected.add(tag);
    else expected.delete(tag);
  }

  return POST_PURCHASE_CONTROLLED_TAGS.filter((tag) => expected.has(tag));
}

export function shouldReconcilePostPurchaseStudent(params: {
  userExists: boolean;
  currentTags: Iterable<string>;
  expectedTags: Iterable<PostPurchaseControlledTag>;
  hasCourseContact: boolean;
  resyncGhl: boolean;
}) {
  if (!params.userExists || params.resyncGhl || !params.hasCourseContact) {
    return true;
  }
  const plan = planPostPurchaseTagReconciliation({
    currentTags: params.currentTags,
    expectedTags: params.expectedTags,
  });
  return plan.add.length > 0 || plan.remove.length > 0;
}

/**
 * A contact returned by an email-based upsert is authoritative for that email,
 * but only inside the exact GHL location that handled the upsert. This lets the
 * reconciler repair legacy cross-user contact mappings without making webhook
 * contact IDs eligible for reassignment.
 */
export function canReassignAuthoritativeGhlContact(params: {
  authoritativeEmailUpsert: boolean;
  existingLocationId: string;
  requestedLocationId: string;
}) {
  return (
    params.authoritativeEmailUpsert &&
    params.existingLocationId === params.requestedLocationId
  );
}

export function shouldApplyInboundPostPurchaseTagChange(params: {
  tagName: string;
  action: "add" | "remove";
  expectedTags: Iterable<PostPurchaseControlledTag> | null;
}) {
  // GHL is an additive entitlement source, not a revocation source. Accept a
  // grant even when another snapshot has not caught up, and ignore removals.
  // Explicit admin/coach removals are handled through durable staff overrides.
  void params.tagName;
  void params.expectedTags;
  return params.action === "add";
}
