export const POST_PURCHASE_CONTROLLED_TAGS = [
  "cmb_student",
  "ic_student",
  "1on1_student",
  "icgc_student",
] as const;

export type PostPurchaseControlledTag =
  (typeof POST_PURCHASE_CONTROLLED_TAGS)[number];

export type PostPurchaseEntitlementInput = {
  productLine?: string | string[] | null;
  addOnPurchased?: string | string[] | null;
};

function normalizeValues(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .flatMap((item) => item.split(","))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function derivePostPurchaseTags(
  input: PostPurchaseEntitlementInput,
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
  if (addOns.some((value) => value.includes("1:1 coaching"))) {
    expected.add("1on1_student");
  }
  if (addOns.some((value) => value.includes("icgc"))) {
    expected.add("icgc_student");
  }

  return POST_PURCHASE_CONTROLLED_TAGS.filter((tag) => expected.has(tag));
}

export function planPostPurchaseTagReconciliation(params: {
  currentTags: Iterable<string>;
  expectedTags: Iterable<PostPurchaseControlledTag>;
}) {
  const current = new Set(
    [...params.currentTags].map((tag) => tag.trim().toLowerCase()),
  );
  const expected = new Set(params.expectedTags);

  return {
    add: POST_PURCHASE_CONTROLLED_TAGS.filter(
      (tag) => expected.has(tag) && !current.has(tag),
    ),
    remove: POST_PURCHASE_CONTROLLED_TAGS.filter(
      (tag) => !expected.has(tag) && current.has(tag),
    ),
  };
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

export function shouldApplyInboundPostPurchaseTagChange(params: {
  tagName: string;
  action: "add" | "remove";
  expectedTags: Iterable<PostPurchaseControlledTag> | null;
}) {
  if (params.expectedTags === null) return true;

  const normalizedTag = params.tagName.trim().toLowerCase();
  const controlled = new Set<string>(POST_PURCHASE_CONTROLLED_TAGS);
  if (!controlled.has(normalizedTag)) return true;

  const expected = new Set<string>(params.expectedTags);
  return params.action === "add"
    ? expected.has(normalizedTag)
    : !expected.has(normalizedTag);
}
