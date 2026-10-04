import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so variables are available inside hoisted vi.mock factories
const { mockDb, mockSendMessage } = vi.hoisted(() => {
  const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 999 });
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
  };
  return { mockDb, mockSendMessage };
});

vi.mock("@workspace/db", () => ({
  db: mockDb,
}));

// Mock Settings Cache
vi.mock("../lib/settingsCache", () => ({
  getSetting: vi.fn().mockImplementation(async (key: string) => {
    if (key === "global_mining_rate") return "0.03";
    if (key === "owner_telegram_id") return "6145230334";
    return null;
  }),
}));

// Mock Deposit Verifier
vi.mock("../lib/depositVerifier", () => ({
  getDepositWalletAddress: vi.fn().mockResolvedValue("UQBYw222...DepositWallet"),
}));

// Mock Bot
vi.mock("../bot/index", () => ({
  getBot: vi.fn(() => ({
    sendMessage: mockSendMessage,
  })),
}));

import {
  formatDepositDateTime,
  formatNumber,
  formatAdminDepositNotification,
  notifyAdminOnDeposit,
  getAdminNotificationRecipients,
  escapeHtml,
} from "../lib/depositNotifier";

describe("Admin Deposit Notification System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OWNER_TELEGRAM_ID = "6145230334";
  });

  describe("HTML Escaping & Date/Time Formatting", () => {
    it("should safely escape HTML entities", () => {
      expect(escapeHtml("<script>alert('xss')</script> & \"hi\"")).toBe(
        "&lt;script&gt;alert('xss')&lt;/script&gt; &amp; \"hi\""
      );
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
    });

    it("should format deposit date and time consistently", () => {
      // 2026-10-04 at 22:35:00 UTC / local
      const testDate = new Date(2026, 9, 4, 22, 35, 0); // Month is 0-indexed (9 = Oct)
      const res = formatDepositDateTime(testDate);

      expect(res.dateFormatted).toBe("04/10/2026");
      expect(res.timeFormatted).toBe("10:35 PM");
      expect(res.fullFormatted).toBe("04/10/2026, 10:35 PM");
    });

    it("should format numbers accurately with custom decimal places", () => {
      expect(formatNumber(1500, 2)).toBe("1,500.00");
      expect(formatNumber(0.5, 4)).toBe("0.5000");
      expect(formatNumber("0.060000", 6)).toBe("0.060000");
    });
  });

  describe("Message Construction & Field Verification", () => {
    it("should include all required fields in the formatted admin notification", () => {
      const fixedDate = new Date(2026, 9, 4, 22, 35, 0);

      const formatted = formatAdminDepositNotification({
        user: {
          id: 123456789,
          firstName: "John",
          lastName: "Osama",
          username: "johnosama",
        },
        deposit: {
          id: 42,
          amount: 0.5,
          currency: "Gram (TON Network)",
          goReceived: 500,
          txHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
          walletAddress: "UQABc123...SenderWalletAddress456",
          depositWalletAddress: "UQBYw222...DepositWallet",
          status: "confirmed",
          confirmedAt: fixedDate,
        },
        balance: {
          goBefore: 1500,
          goReceived: 500,
          goAfter: 2000,
          gramBefore: 0.0,
          gramAfter: 0.03,
        },
        mining: {
          miningRate: 0.03,
          dailyMiningGo: 60,
          dailyMiningGram: 0.06,
          isMining: true,
          unclaimedGramHarvested: 0.03,
          lastMiningAt: fixedDate,
        },
      });

      const text = formatted.text;

      // 1. Header
      expect(text).toContain("💰 <b>NEW DEPOSIT</b>");

      // 2. User Information
      expect(text).toContain("👤 <b>User Information</b>");
      expect(text).toContain("John Osama");
      expect(text).toContain("@johnosama");
      expect(text).toContain("<code>123456789</code>");

      // 3. Deposit Information
      expect(text).toContain("💳 <b>Deposit Information</b>");
      expect(text).toContain("0.5000 Gram");
      expect(text).toContain("Gram (TON Network)");
      expect(text).toContain("+500.00 GO");
      expect(text).toContain("✅ Confirmed");
      expect(text).toContain("04/10/2026");
      expect(text).toContain("10:35 PM");

      // 4. User Balance After Deposit
      expect(text).toContain("📊 <b>User Balance After Deposit</b>");
      expect(text).toContain("1,500.00 GO");
      expect(text).toContain("+500.00 GO");
      expect(text).toContain("2,000.00 GO");
      expect(text).toContain("0.000000 Gram");
      expect(text).toContain("0.030000 Gram");

      // 5. Mining Information
      expect(text).toContain("⛏️ <b>Mining Information</b>");
      expect(text).toContain("3%");
      expect(text).toContain("60.00 GO");
      expect(text).toContain("0.060000 Gram");
      expect(text).toContain("🟢 Active");
      expect(text).toContain("Auto-harvested");
      expect(text).toContain("04/10/2026, 10:35 PM");

      // 6. Transaction & Blockchain Details
      expect(text).toContain("🔗 <b>Transaction & Addresses</b>");
      expect(text).toContain("a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90");
      expect(text).toContain("UQABc123...SenderWalletAddress456");
      expect(text).toContain("UQBYw222...DepositWallet");

      // 7. Blockchain button
      expect(formatted.replyMarkup).toBeDefined();
      expect(formatted.replyMarkup.inline_keyboard[0][0].url).toContain("tonviewer.com/transaction/");
    });
  });

  describe("Admin Resolution & Security Isolation", () => {
    it("should resolve only configured admin IDs and never normal users", async () => {
      // Mock db settings table query
      mockDb.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValue([
          { key: "owner_telegram_id", value: "6145230334" },
          { key: "admin_telegram_id", value: "777888999" },
        ]),
      });

      // Mock admins table query
      mockDb.from.mockReturnValueOnce({
        select: vi.fn().mockResolvedValue([{ id: 6145230334 }, { id: 777888999 }]),
      });

      const admins = await getAdminNotificationRecipients();
      expect(admins).toContain(6145230334);
      expect(admins).toContain(777888999);
      // Ensure regular user is not included
      expect(admins).not.toContain(123456789);
    });
  });

  describe("End-to-End Notification Dispatch & Idempotency", () => {
    it("should successfully claim deposit, send notification to admin, and prevent duplicate sends", async () => {
      const fixedDate = new Date(2026, 9, 4, 22, 35, 0);

      // 1. Setup mock returning confirmed deposit on first update
      const mockDepositRow = {
        id: 100,
        userId: 123456789,
        amount: "0.50",
        currency: "Gram",
        txHash: "tx_hash_12345678901234567890",
        walletAddress: "UQSender12345678901234567890",
        status: "confirmed",
        adminNotified: true,
        adminNotifiedAt: fixedDate,
        confirmedAt: fixedDate,
      };

      const mockUserRow = {
        id: 123456789,
        firstName: "John",
        lastName: "Osama",
        username: "johnosama",
        goBalance: "2000",
        balance: "2000",
        gramBalance: "0.03",
        lastMiningAt: fixedDate,
      };

      // Atomic UPDATE returns the claimed deposit
      mockDb.update.mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            returning: vi.fn().mockResolvedValueOnce([mockDepositRow]),
          }),
        }),
      });

      // User lookup returns user
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([mockUserRow]),
          }),
        }),
      });

      // Execute first notification
      const result1 = await notifyAdminOnDeposit(100, {
        goBefore: 1500,
        goAfter: 2000,
        gramBefore: 0,
        gramAfter: 0.03,
        lastMiningAtBefore: fixedDate,
        lastMiningAtAfter: fixedDate,
        unclaimedGramHarvested: 0.03,
      });

      expect(result1.sent).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);

      const [calledAdminId, calledMessage] = mockSendMessage.mock.calls[0];
      expect(calledAdminId).toBe(6145230334);
      expect(calledMessage).toContain("💰 <b>NEW DEPOSIT</b>");
      expect(calledMessage).toContain("123456789");
      expect(calledMessage).toContain("0.5000 Gram");
      expect(calledMessage).toContain("2,000.00 GO");

      // 2. Simulate second concurrent / retry call: atomic UPDATE returns empty array (already claimed)
      mockDb.update.mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            returning: vi.fn().mockResolvedValueOnce([]), // Already claimed!
          }),
        }),
      });

      // DB lookup for diagnostic returns adminNotified: true
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([{ id: 100, status: "confirmed", adminNotified: true }]),
          }),
        }),
      });

      const result2 = await notifyAdminOnDeposit(100);
      expect(result2.sent).toBe(false);
      expect(result2.reason).toBe("already_notified");
      // bot.sendMessage should still have been called only once!
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it("should NOT send notification if deposit status is failed or pending", async () => {
      // Atomic UPDATE returns empty array because status is 'failed'
      mockDb.update.mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            returning: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      });

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([{ id: 101, status: "failed", adminNotified: false }]),
          }),
        }),
      });

      const res = await notifyAdminOnDeposit(101);
      expect(res.sent).toBe(false);
      expect(res.reason).toBe("deposit_not_confirmed");
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should gracefully handle Telegram sendMessage errors without throwing", async () => {
      mockSendMessage.mockRejectedValueOnce(new Error("Telegram Network Timeout"));

      const fixedDate = new Date();
      mockDb.update.mockReturnValueOnce({
        set: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            returning: vi.fn().mockResolvedValueOnce([{
              id: 102,
              userId: 123456789,
              amount: "0.50",
              currency: "Gram",
              status: "confirmed",
              confirmedAt: fixedDate,
            }]),
          }),
        }),
      });

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce([{
              id: 123456789,
              firstName: "Test",
              goBalance: "100",
            }]),
          }),
        }),
      });

      const res = await notifyAdminOnDeposit(102);
      expect(res.sent).toBe(false);
      // The function must resolve cleanly and not throw
    });
  });

  describe("Fractional Deposit & GO Conversion Verification", () => {
    it.each([
      { depositGram: 0.2, expectedGo: 200, dailyMiningGo: 6 },
      { depositGram: 0.3, expectedGo: 300, dailyMiningGo: 9 },
      { depositGram: 0.5, expectedGo: 500, dailyMiningGo: 15 },
      { depositGram: 1.0, expectedGo: 1000, dailyMiningGo: 30 },
      { depositGram: 2.5, expectedGo: 2500, dailyMiningGo: 75 },
    ])("should calculate correct GO and 3% mining rate for $depositGram Gram", ({ depositGram, expectedGo, dailyMiningGo }) => {
      const conversionRate = 1000; // 1 Gram = 1000 GO
      const goReceived = depositGram * conversionRate;
      expect(goReceived).toBe(expectedGo);

      const miningRate = 0.03;
      const dailyYield = goReceived * miningRate;
      expect(dailyYield).toBe(dailyMiningGo);

      const formatted = formatAdminDepositNotification({
        user: { id: 123, firstName: "User" },
        deposit: {
          id: 1,
          amount: depositGram,
          currency: "Gram",
          goReceived,
          status: "confirmed",
          confirmedAt: new Date(),
        },
        balance: {
          goBefore: 0,
          goReceived,
          goAfter: goReceived,
          gramBefore: 0,
          gramAfter: 0,
        },
        mining: {
          miningRate,
          dailyMiningGo: dailyYield,
          dailyMiningGram: dailyYield / 1000,
          isMining: true,
          lastMiningAt: new Date(),
        },
      });

      expect(formatted.text).toContain(`+${formatNumber(expectedGo, 2)} GO`);
      expect(formatted.text).toContain(`${formatNumber(dailyMiningGo, 2)} GO`);
    });
  });
});
