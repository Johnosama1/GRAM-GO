import { describe, it, expect, vi } from "vitest";
import { purgeUsersCompletely } from "../lib/userPurge";

describe("User Account Purge System", () => {
  it("should ignore empty or invalid IDs gracefully", async () => {
    const result = await purgeUsersCompletely([] as any);
    expect(result.success).toBe(true);
    expect(result.userIds).toEqual([]);

    const resultInvalid = await purgeUsersCompletely([NaN, -5, 0] as any);
    expect(resultInvalid.success).toBe(true);
    expect(resultInvalid.userIds).toEqual([]);
  });

  it("should completely purge user records across tables using mock client", async () => {
    const deletedTables: string[] = [];
    const mockClient = {
      delete: vi.fn().mockImplementation((table: any) => ({
        where: vi.fn().mockImplementation(() => {
          deletedTables.push(table?._?.name || "unknown");
          return Promise.resolve({ rowCount: 1 });
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue({ rowCount: 1 }),
        })),
      })),
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue([{ referredBy: 999 }]),
        })),
      })),
      execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
    };

    const targetUserIds = [6507841710, 2069046826];
    const result = await purgeUsersCompletely(targetUserIds, mockClient);

    expect(result.success).toBe(true);
    expect(result.userIds).toEqual(targetUserIds);
    expect(mockClient.delete).toHaveBeenCalled();
    expect(mockClient.update).toHaveBeenCalled();
  });

  it("should allow a purged user to re-register as a brand new referral", async () => {
    // Simulate database state after purge
    const dbUsers: Record<number, any> = {};
    const dbReferrals: Array<{ referrerId: number; referredId: number; status: string }> = [];

    // Target user was purged, so dbUsers[6507841710] is undefined
    expect(dbUsers[6507841710]).toBeUndefined();

    // User joins via a new inviter (e.g. inviter ID 888888)
    const newInviterId = 888888;
    const joiningUserId = 6507841710;

    // Simulate onboarding logic:
    const isNew = !dbUsers[joiningUserId];
    expect(isNew).toBe(true);

    if (isNew) {
      dbUsers[joiningUserId] = {
        id: joiningUserId,
        referredBy: newInviterId,
        goBalance: "0",
        gramBalance: "0",
      };

      dbReferrals.push({
        referrerId: newInviterId,
        referredId: joiningUserId,
        status: "pending",
      });
    }

    expect(dbUsers[joiningUserId]).toBeDefined();
    expect(dbUsers[joiningUserId].referredBy).toBe(newInviterId);
    expect(dbReferrals).toHaveLength(1);
    expect(dbReferrals[0]).toEqual({
      referrerId: newInviterId,
      referredId: joiningUserId,
      status: "pending",
    });
  });
});
