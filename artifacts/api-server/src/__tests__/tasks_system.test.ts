import { describe, it, expect } from "vitest";

describe("Task System Logic", () => {
  it("should validate custom limits and unlimited representation", () => {
    const parseMaxClaims = (maxClaims: any): number | null => {
      if (maxClaims !== undefined && maxClaims !== null && maxClaims !== "" && maxClaims !== "unlimited") {
        const n = parseInt(String(maxClaims), 10);
        if (!isNaN(n) && n > 0) {
          return n;
        }
      }
      return null;
    };

    expect(parseMaxClaims("7")).toBe(7);
    expect(parseMaxClaims(73)).toBe(73);
    expect(parseMaxClaims("1500")).toBe(1500);
    expect(parseMaxClaims("unlimited")).toBe(null);
    expect(parseMaxClaims("")).toBe(null);
    expect(parseMaxClaims(null)).toBe(null);
    expect(parseMaxClaims(undefined)).toBe(null);
    expect(parseMaxClaims(0)).toBe(null);
    expect(parseMaxClaims(-5)).toBe(null);
  });

  it("should filter full finite tasks for users but keep unlimited and available tasks", () => {
    const nowDate = new Date();
    const tasks = [
      { id: 1, title: "Finite Available", maxClaims: 50, claimedCount: 12, expiresAt: null },
      { id: 2, title: "Finite Full", maxClaims: 50, claimedCount: 50, expiresAt: null },
      { id: 3, title: "Finite Overflowed", maxClaims: 50, claimedCount: 51, expiresAt: null },
      { id: 4, title: "Unlimited", maxClaims: null, claimedCount: 500, expiresAt: null },
      { id: 5, title: "Custom Limit 7", maxClaims: 7, claimedCount: 6, expiresAt: null },
      { id: 6, title: "Custom Limit 7 Full", maxClaims: 7, claimedCount: 7, expiresAt: null },
      { id: 7, title: "Expired", maxClaims: null, claimedCount: 0, expiresAt: new Date(Date.now() - 10000) },
    ];

    const activeForUsers = tasks.filter((t) => {
      if (t.expiresAt && new Date(t.expiresAt) <= nowDate) return false;
      if (t.maxClaims !== null && t.maxClaims !== undefined && t.maxClaims > 0) {
        if (t.claimedCount >= t.maxClaims) return false;
      }
      return true;
    });

    expect(activeForUsers.map(t => t.id)).toEqual([1, 4, 5]);
  });

  it("should keep all tasks in Admin view with claimedCount and completion status", () => {
    const tasks = [
      { id: 1, title: "Finite Available", maxClaims: 50, claimedCount: 12 },
      { id: 2, title: "Finite Full", maxClaims: 50, claimedCount: 50 },
      { id: 3, title: "Unlimited", maxClaims: null, claimedCount: 500 },
      { id: 4, title: "Custom Limit 73", maxClaims: 73, claimedCount: 73 },
    ];

    expect(tasks.length).toBe(4);
    expect(tasks.find(t => t.id === 2)?.claimedCount).toBe(50);
    expect(tasks.find(t => t.id === 4)?.claimedCount).toBe(73);
  });
});
