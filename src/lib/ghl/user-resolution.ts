export interface GhlUserSummary {
  id?: string;
  email?: string;
}

export function selectExactGhlUserId(
  users: GhlUserSummary[],
  email: string,
): string | null {
  const normalizedEmail = email.trim().toLowerCase();
  const match = users.find(
    (user) =>
      typeof user.id === "string" &&
      user.id.length > 0 &&
      user.email?.trim().toLowerCase() === normalizedEmail,
  );
  return match?.id ?? null;
}
