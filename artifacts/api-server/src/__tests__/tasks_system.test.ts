import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeChatId,
  extractChannelUsername,
  verifyUserChannelMembership,
  checkBotChannelAdmin,
} from "../lib/telegramChannel";

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

  it("should filter full finite tasks for users but keep completed tasks visible", () => {
    const nowDate = new Date();
    const userCompletedIds = new Set([2]); // user completed task 2
    const tasks = [
      { id: 1, title: "Finite Available", maxClaims: 50, claimedCount: 12, expiresAt: null },
      { id: 2, title: "Finite Full (User Completed)", maxClaims: 50, claimedCount: 50, expiresAt: null },
      { id: 3, title: "Finite Full (Not Completed)", maxClaims: 50, claimedCount: 50, expiresAt: null },
      { id: 4, title: "Unlimited", maxClaims: null, claimedCount: 500, expiresAt: null },
      { id: 5, title: "Custom Limit 7", maxClaims: 7, claimedCount: 6, expiresAt: null },
    ];

    const activeForUsers = tasks.filter((t) => {
      if (t.expiresAt && new Date(t.expiresAt) <= nowDate) return false;
      if (t.maxClaims !== null && t.maxClaims !== undefined && t.maxClaims > 0) {
        if (t.claimedCount >= t.maxClaims && !userCompletedIds.has(t.id)) return false;
      }
      return true;
    });

    expect(activeForUsers.map(t => t.id)).toEqual([1, 2, 4, 5]);
  });

  it("should sort completed tasks to the very bottom of the task list", () => {
    const tasks = [
      { id: 1, title: "Task A" },
      { id: 2, title: "Task B" },
      { id: 3, title: "Task C" },
      { id: 4, title: "Task D" },
    ];
    const completed = [2, 4]; // B and D completed

    const activeTasks = tasks.filter((t) => !completed.includes(t.id));
    const doneTasks = tasks.filter((t) => completed.includes(t.id));
    const displayTasks = [...activeTasks, ...doneTasks];

    expect(displayTasks.map((t) => t.id)).toEqual([1, 3, 2, 4]);
  });

  it("should normalize channel URLs, usernames, and numeric chat IDs properly", () => {
    expect(normalizeChatId("https://t.me/my_awesome_channel")).toBe("@my_awesome_channel");
    expect(normalizeChatId("http://t.me/GramGoOfficial")).toBe("@GramGoOfficial");
    expect(normalizeChatId("@my_channel")).toBe("@my_channel");
    expect(normalizeChatId("my_channel")).toBe("@my_channel");
    expect(normalizeChatId("-1001234567890")).toBe("-1001234567890");
    expect(normalizeChatId("-987654321")).toBe("-987654321");
    expect(normalizeChatId("")).toBe(null);

    expect(extractChannelUsername("https://t.me/GramGoOfficial")).toBe("GramGoOfficial");
    expect(extractChannelUsername("@GramGoOfficial")).toBe("GramGoOfficial");
    expect(extractChannelUsername("GramGoOfficial")).toBe("GramGoOfficial");
  });
});

describe("Telegram Channel Membership Verification", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "123456:MOCK_TOKEN";
    vi.restoreAllMocks();
  });

  it("should return isMember: true for member, administrator, and creator", async () => {
    const mockStatuses = ["creator", "administrator", "member", "restricted"];

    for (const status of mockStatuses) {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: { status, is_member: true },
        }),
      });

      const res = await verifyUserChannelMembership(12345, "@GramGoOfficial");
      expect(res.isMember).toBe(true);
      expect(res.status).toBe(status);
    }
  });

  it("should return isMember: false when user is not a participant (left / kicked)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: { status: "left" },
      }),
    });

    const res = await verifyUserChannelMembership(12345, "@GramGoOfficial");
    expect(res.isMember).toBe(false);
    expect(res.error).toContain("الانضمام للقناة");
  });

  it("should check if bot is administrator in the target channel", async () => {
    // 1. getChat returns chat info
    // 2. getChatAdministrators returns admins
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { id: -1001234567890, title: "Official Channel", username: "GramGoOfficial" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: [{ user: { id: 123456, is_bot: true, username: "GramGoBot" }, status: "administrator" }],
        }),
      });

    const adminCheck = await checkBotChannelAdmin("@GramGoOfficial");
    expect(adminCheck.ok).toBe(true);
    expect(adminCheck.isAdmin).toBe(true);
    expect(adminCheck.chatId).toBe("-1001234567890");
    expect(adminCheck.title).toBe("Official Channel");
  });

  it("should fail bot admin check if bot is not in the channel or not admin", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        description: "Bad Request: chat not found",
      }),
    });

    const adminCheck = await checkBotChannelAdmin("@NonExistentChannel");
    expect(adminCheck.ok).toBe(false);
    expect(adminCheck.isAdmin).toBe(false);
    expect(adminCheck.error).toContain("غير موجودة");
  });
});
