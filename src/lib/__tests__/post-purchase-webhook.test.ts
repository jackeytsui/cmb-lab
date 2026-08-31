import { describe, expect, it } from "vitest";
import { canonicalizePostPurchasePayload } from "@/lib/ghl/post-purchase-webhook";
import { derivePostPurchaseTags, type PostPurchaseEntitlementInput } from "@/lib/post-purchase-entitlements";

describe("post-purchase webhook payload normalization", () => {
  it("preserves and maps all three add-ons sent by the live workflow", () => {
    const payload = canonicalizePostPurchasePayload({
      email: "student@example.com",
      productLine: "CMBP",
      addOnPurchased: "ICGC (Group Coaching), 1:1 coaching + Discord Private Channel, Custom course",
      contactId: "contact-1",
      locationId: "sales-location",
    });
    expect(derivePostPurchaseTags(payload as PostPurchaseEntitlementInput)).toEqual([
      "cmb_student", "1on1_student", "icgc_student", "custom_course_student",
    ]);
  });

  it("keeps the explicit CMB custom payload compatible", () => {
    expect(
      canonicalizePostPurchasePayload({
        email: "student@example.com",
        first_name: "Ada",
        last_name: "Wong",
        product_line: "CMBP",
        add_on_purchased: ["1:1 Coaching"],
        contact_id: "contact-1",
        location_id: "location-1",
        idempotency_key: "purchase-1",
      }),
    ).toEqual({
      email: "student@example.com",
      firstName: "Ada",
      lastName: "Wong",
      name: undefined,
      productLine: "CMBP",
      addOnPurchased: ["1:1 Coaching"],
      contactId: "contact-1",
      locationId: "location-1",
      idempotencyKey: "purchase-1",
    });
  });

  it("accepts HighLevel's default outbound workflow location object", () => {
    expect(
      canonicalizePostPurchasePayload({
        id: "contact-2",
        email: "student@example.com",
        firstName: "Ada",
        lastName: "Wong",
        "Product Line?": "Improve Canto",
        "Add-on Purchased": "ICGC",
        location: { id: "sales-location" },
      }),
    ).toMatchObject({
      contactId: "contact-2",
      locationId: "sales-location",
      productLine: "Improve Canto",
      addOnPurchased: "ICGC",
    });
  });

  it("accepts marketplace-style data and nested contact payloads", () => {
    expect(
      canonicalizePostPurchasePayload({
        locationId: "sales-location",
        data: {
          contact: {
            id: "contact-3",
            email: "student@example.com",
            name: "Ada Wong",
            productLine: ["CMBP"],
            addOnPurchased: "1:1 Coaching",
          },
        },
      }),
    ).toMatchObject({
      email: "student@example.com",
      name: "Ada Wong",
      contactId: "contact-3",
      locationId: "sales-location",
      productLine: ["CMBP"],
      addOnPurchased: "1:1 Coaching",
    });
  });

  it("prefers an explicit contact ID over a generic event ID", () => {
    expect(
      canonicalizePostPurchasePayload({
        id: "event-1",
        contactId: "contact-4",
        location: { id: "sales-location" },
      }).contactId,
    ).toBe("contact-4");
  });
});
