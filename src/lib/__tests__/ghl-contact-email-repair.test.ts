import { describe, expect, it } from "vitest";
import {
  extractGhlDuplicateEmailContact,
  findPendingDuplicateEmailUsers,
} from "@/lib/ghl/contact-email-repair";

const duplicateError =
  'GHL API error 400 PUT /contacts/old: {"statusCode":400,"message":"This location does not allow duplicated contacts.","meta":{"contactName":"Linnea Berg","contactId":"correct-contact","matchingField":"email"},"succeeded":false}';

describe("extractGhlDuplicateEmailContact", () => {
  it("extracts the authoritative contact from an email duplicate response", () => {
    expect(extractGhlDuplicateEmailContact(duplicateError)).toEqual({
      contactId: "correct-contact",
      contactName: "Linnea Berg",
    });
  });

  it("rejects non-email conflicts and malformed API errors", () => {
    expect(
      extractGhlDuplicateEmailContact(
        'GHL API error 400: {"message":"This location does not allow duplicated contacts.","meta":{"contactId":"other","matchingField":"phone"}}',
      ),
    ).toBeNull();
    expect(extractGhlDuplicateEmailContact("GHL API error 400: nope")).toBeNull();
    expect(
      extractGhlDuplicateEmailContact(
        'GHL API error 400: {"message":"Contact not found","meta":{"contactId":"other","matchingField":"email"}}',
      ),
    ).toBeNull();
  });
});

describe("findPendingDuplicateEmailUsers", () => {
  it("keeps only locations whose newest event is an unresolved duplicate", () => {
    expect(
      findPendingDuplicateEmailUsers([
        {
          entityId: "repaired-user",
          eventType: "contact.email_relinked",
          status: "completed",
          payload: { locationId: "course" },
        },
        {
          entityId: "repaired-user",
          eventType: "contact.email_updated",
          status: "failed",
          payload: { locationId: "course", error: duplicateError },
        },
        {
          entityId: "pending-user",
          eventType: "contact.email_updated",
          status: "failed",
          payload: { locationId: "sales", error: duplicateError },
        },
        {
          entityId: "pending-user",
          eventType: "contact.email_updated",
          status: "completed",
          payload: { locationId: "course" },
        },
      ]),
    ).toEqual(["pending-user"]);
  });
});
