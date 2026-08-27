type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function firstDefined(
  records: Array<UnknownRecord | null>,
  keys: string[],
) {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null) {
        return record[key];
      }
    }
  }
  return undefined;
}

function normalizeFieldName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function firstNormalizedField(
  records: Array<UnknownRecord | null>,
  normalizedNames: string[],
) {
  const accepted = new Set(normalizedNames);
  for (const record of records) {
    if (!record) continue;
    for (const [key, value] of Object.entries(record)) {
      if (
        value !== undefined &&
        value !== null &&
        accepted.has(normalizeFieldName(key))
      ) {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * Normalize both CMB's explicit custom-webhook body and HighLevel's documented
 * outbound workflow shapes. HighLevel's default workflow payload nests the
 * location as `location.id`; marketplace-style webhooks may nest contact data
 * under `data` or `contact` instead.
 */
export function canonicalizePostPurchasePayload(body: UnknownRecord) {
  const data = asRecord(body.data);
  const contact = asRecord(body.contact) ?? asRecord(data?.contact);
  const location = asRecord(body.location) ?? asRecord(data?.location);
  const contactRecords = [body, data, contact];

  return {
    email: firstDefined(contactRecords, ["email", "contact_email"]),
    firstName: firstDefined(contactRecords, ["firstName", "first_name"]),
    lastName: firstDefined(contactRecords, ["lastName", "last_name"]),
    name: firstDefined(contactRecords, ["name", "contact_name"]),
    productLine: firstNormalizedField(contactRecords, ["productline"]),
    addOnPurchased: firstNormalizedField(contactRecords, [
      "addonpurchased",
    ]),
    contactId:
      firstDefined([body, data], ["contactId", "contact_id"]) ??
      firstDefined([contact], ["id"]) ??
      firstDefined([data, body], ["id"]),
    locationId:
      firstDefined([body, data], ["locationId", "location_id"]) ??
      firstDefined([location], ["id"]),
    idempotencyKey: firstDefined([body, data], [
      "idempotencyKey",
      "idempotency_key",
    ]),
  };
}
