import { describe, expect, it } from "vitest";
import {
  groupCoachingReminderKey,
  groupCoachingSessionState,
  isGroupCoachingReminderBannerVisible,
} from "@/lib/group-coaching-session-state";

const NOW = new Date("2026-08-28T18:00:00.000Z").getTime();

describe("group coaching session state", () => {
  it("moves from upcoming to live to past using the session duration", () => {
    const session = {
      startsAt: new Date(NOW + 10 * 60_000),
      durationMinutes: 60,
    };

    expect(groupCoachingSessionState(session, NOW)).toBe("upcoming");
    expect(groupCoachingSessionState(session, NOW + 10 * 60_000)).toBe("live");
    expect(groupCoachingSessionState(session, NOW + 69 * 60_000)).toBe("live");
    expect(groupCoachingSessionState(session, NOW + 70 * 60_000)).toBe("past");
    expect(
      groupCoachingSessionState({ ...session, isCancelled: true }, NOW),
    ).toBe("cancelled");
  });

  it("assigns one idempotent reminder slot at one hour and go-live", () => {
    expect(groupCoachingReminderKey(new Date(NOW + 59 * 60_000), NOW)).toBe(
      "one_hour",
    );
    expect(groupCoachingReminderKey(new Date(NOW), NOW)).toBe("starting_now");
    expect(groupCoachingReminderKey(new Date(NOW - 4 * 60_000), NOW)).toBe(
      "starting_now",
    );
    expect(groupCoachingReminderKey(new Date(NOW + 30 * 60_000), NOW)).toBeNull();
    expect(groupCoachingReminderKey(new Date(NOW + 55 * 60_000), NOW)).toBeNull();
    expect(groupCoachingReminderKey(new Date(NOW - 5 * 60_000), NOW)).toBeNull();
  });

  it("shows the targeted banner for the hour before and while a session is live", () => {
    expect(
      isGroupCoachingReminderBannerVisible(
        { startsAt: new Date(NOW + 60 * 60_000), durationMinutes: 60 },
        NOW,
      ),
    ).toBe(true);
    expect(
      isGroupCoachingReminderBannerVisible(
        { startsAt: new Date(NOW + 61 * 60_000), durationMinutes: 60 },
        NOW,
      ),
    ).toBe(false);
    expect(
      isGroupCoachingReminderBannerVisible(
        { startsAt: new Date(NOW - 30 * 60_000), durationMinutes: 60 },
        NOW,
      ),
    ).toBe(true);
  });
});
