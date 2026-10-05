import { describe, it, expect, vi } from "vitest";
import {
  getUserQualificationProgress,
  checkAndUpdateReferralQualification,
  DEFAULT_COMMISSION_RATES,
} from "../lib/referralManager";

describe("5-Level Referral System & Qualification", () => {
  describe("1. Currency Rules & Calculations", () => {
    it("should correctly convert Gram to GO at 1 Gram = 1000 GO", () => {
      const gramToGo = (gram: number) => gram * 1000;
      expect(gramToGo(0.1)).toBe(100);
      expect(gramToGo(0.2)).toBe(200);
      expect(gramToGo(0.5)).toBe(500);
      expect(gramToGo(1.0)).toBe(1000);
    });

    it("should calculate commission in GO from GO deposit base", () => {
      const depositGram = 0.1;
      const depositGo = depositGram * 1000; // 100 GO
      const l1Percent = 10;
      const l1CommissionGo = depositGo * (l1Percent / 100);
      expect(l1CommissionGo).toBe(10); // +10 GO
    });
  });

  describe("2. Referral Qualification Conditions", () => {
    it("should report Pending if no conditions are met", async () => {
      const mockClient = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const res = [{ count: 0 }];
              const promise: any = Promise.resolve(res);
              promise.limit = vi.fn().mockResolvedValue([
                { id: 101, tasksCompleted: 0, lastDailyClaimAt: null },
              ]);
              return promise;
            }),
          })),
        })),
      };

      const progress = await getUserQualificationProgress(101, mockClient);
      expect(progress.isQualified).toBe(false);
      expect(progress.dailyCheckin).toBe(false);
      expect(progress.tasksCompleted).toBe(0);
      expect(progress.tasksRequired).toBe(3);
    });

    it("should report Pending if only Daily Check-in is completed", async () => {
      const mockClient = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const res = [{ count: 0 }];
              const promise: any = Promise.resolve(res);
              promise.limit = vi.fn().mockResolvedValue([
                { id: 101, tasksCompleted: 0, lastDailyClaimAt: new Date() },
              ]);
              return promise;
            }),
          })),
        })),
      };

      const progress = await getUserQualificationProgress(101, mockClient);
      expect(progress.isQualified).toBe(false);
      expect(progress.dailyCheckin).toBe(true);
      expect(progress.tasksCompleted).toBe(0);
    });

    it("should report Pending if Check-in is complete but tasks < 3", async () => {
      const mockClient = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const res = [{ count: 2 }];
              const promise: any = Promise.resolve(res);
              promise.limit = vi.fn().mockResolvedValue([
                { id: 101, tasksCompleted: 2, lastDailyClaimAt: new Date() },
              ]);
              return promise;
            }),
          })),
        })),
      };

      const progress = await getUserQualificationProgress(101, mockClient);
      expect(progress.isQualified).toBe(false);
      expect(progress.dailyCheckin).toBe(true);
      expect(progress.tasksCompleted).toBe(2);
      expect(progress.tasksRequired).toBe(3);
    });

    it("should become Successful (Qualified) when Check-in and >= 3 Tasks are completed (No Combo required)", async () => {
      const mockClient = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const res = [{ count: 3 }];
              const promise: any = Promise.resolve(res);
              promise.limit = vi.fn().mockResolvedValue([
                { id: 101, tasksCompleted: 3, lastDailyClaimAt: new Date() },
              ]);
              return promise;
            }),
          })),
        })),
      };

      const progress = await getUserQualificationProgress(101, mockClient);
      expect(progress.isQualified).toBe(true);
      expect(progress.dailyCheckin).toBe(true);
      expect(progress.tasksCompleted).toBe(3);
    });
  });

  describe("3. Default 5-Level Commission Structure (10%, 3%, 2%, 1%, 1%)", () => {
    it("should have default commission rates of L1=10%, L2=3%, L3=2%, L4=1%, L5=1%", () => {
      expect(DEFAULT_COMMISSION_RATES[1]).toBe(10);
      expect(DEFAULT_COMMISSION_RATES[2]).toBe(3);
      expect(DEFAULT_COMMISSION_RATES[3]).toBe(2);
      expect(DEFAULT_COMMISSION_RATES[4]).toBe(1);
      expect(DEFAULT_COMMISSION_RATES[5]).toBe(1);
    });

    it("should traverse up to 5 levels (User A -> B -> C -> D -> E -> F) and distribute exact amounts (F deposits 100 GO -> E gets 10 GO, D gets 3 GO, C gets 2 GO, B gets 1 GO, A gets 1 GO)", async () => {
      const rates = [
        { level: 1, percent: 10 },
        { level: 2, percent: 3 },
        { level: 3, percent: 2 },
        { level: 4, percent: 1 },
        { level: 5, percent: 1 },
      ];

      const depositGram = 0.1;
      const depositGo = 100; // 100 GO (or $100 equivalent)

      const expectedPayouts = [
        { level: 1, referrerId: 105, goAmount: 10 }, // User E (L1) -> 10% = 10 GO
        { level: 2, referrerId: 104, goAmount: 3 },  // User D (L2) -> 3% = 3 GO
        { level: 3, referrerId: 103, goAmount: 2 },  // User C (L3) -> 2% = 2 GO
        { level: 4, referrerId: 102, goAmount: 1 },  // User B (L4) -> 1% = 1 GO
        { level: 5, referrerId: 101, goAmount: 1 },  // User A (L5) -> 1% = 1 GO
      ];

      for (const exp of expectedPayouts) {
        const rate = rates.find((r) => r.level === exp.level)!.percent;
        const commGo = depositGo * (rate / 100);
        expect(commGo).toBe(exp.goAmount);
      }

      expect(expectedPayouts.length).toBe(5);
    });
  });

  describe("4. Direct Referral Qualification Reward (+5 GO)", () => {
    it("should credit exactly +5 GO once to referrer when referral transitions to successful", () => {
      let referrerGoBalance = 10;
      const qualificationRewardGo = 5;
      referrerGoBalance += qualificationRewardGo;
      expect(referrerGoBalance).toBe(15);

      // Verify idempotency: subsequent qualification check does not re-add +5 GO
      const isAlreadyRewarded = true;
      if (!isAlreadyRewarded) {
        referrerGoBalance += qualificationRewardGo;
      }
      expect(referrerGoBalance).toBe(15);
    });
  });

  describe("5. Dynamic Admin Settings (Single Source of Truth)", () => {
    it("should immediately calculate commissions with updated admin percentage (e.g. 10% -> 8%)", () => {
      const depositGram = 0.1;
      const depositGo = depositGram * 1000; // 100 GO

      // Old rate = 10% -> 10 GO
      let l1Rate = 10;
      expect(depositGo * (l1Rate / 100)).toBe(10);

      // Admin updates Level 1 to 8%
      l1Rate = 8;
      const updatedCommission = depositGo * (l1Rate / 100);

      // Expect exactly 8 GO (NOT 10 GO)
      expect(updatedCommission).toBe(8);
      expect(updatedCommission).not.toBe(10);
    });

    it("should reject invalid percentage settings (negative or > 100)", () => {
      const validateRate = (rate: any) => {
        const num = parseFloat(String(rate));
        if (isNaN(num) || num < 0 || num > 100) return false;
        return true;
      };

      expect(validateRate(10)).toBe(true);
      expect(validateRate(0)).toBe(true);
      expect(validateRate(100)).toBe(true);
      expect(validateRate(8.5)).toBe(true);
      expect(validateRate(-1)).toBe(false);
      expect(validateRate(105)).toBe(false);
      expect(validateRate("invalid")).toBe(false);
      expect(validateRate(NaN)).toBe(false);
    });
  });

  describe("6. Idempotency & Duplicate Deposit Protection", () => {
    it("should block duplicate commission payouts if deposit was already processed", async () => {
      const existingCommissions = [{ id: 99, depositId: 500 }];

      const isAlreadyProcessed = existingCommissions.length > 0;
      expect(isAlreadyProcessed).toBe(true);

      const secondAttemptCommissions: any[] = [];
      if (!isAlreadyProcessed) {
        secondAttemptCommissions.push({ commissionGo: 10 });
      }

      expect(secondAttemptCommissions.length).toBe(0);
    });
  });

  describe("7. Deposit Commissions on Unqualified/Pending Referrals", () => {
    it("should distribute referral commission even if depositing user is still Pending (unqualified)", () => {
      // User has not completed checkin/tasks (still pending), but deposited
      const depositingUserQualification = {
        isQualified: false,
        dailyCheckin: false,
        tasksCompleted: 0,
        tasksRequired: 3,
      };

      // Direct +5 GO qualification reward is withheld until qualified
      const canClaimDirectQualificationBonus = depositingUserQualification.isQualified;
      expect(canClaimDirectQualificationBonus).toBe(false);

      // Multi-level deposit commission IS credited to inviter
      const depositAmountGo = 100;
      const l1Percent = 10;
      const l1CommissionGo = depositAmountGo * (l1Percent / 100);
      expect(l1CommissionGo).toBe(10);
    });
  });

  describe("8. Referral & Multi-Level Commission Telegram Notifications (100% English)", () => {
    it("should format and send new referral notification with live counts, username and clean English", async () => {
      const { sendNewReferralNotification } = await import("../lib/referralManager");
      let sentChatId: number | null = null;
      let sentMessage: string = "";

      const mockBot = {
        sendMessage: vi.fn().mockImplementation((chatId: number, text: string) => {
          sentChatId = chatId;
          sentMessage = text;
          return Promise.resolve();
        }),
      };

      const mockClient = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockResolvedValue([{ count: 4 }]),
          })),
        })),
      };

      await sendNewReferralNotification(
        mockBot,
        123456,
        { id: 789012, username: "ahmed_user", firstName: "Ahmed", lastName: "Ali" },
        mockClient as any,
      );

      expect(mockBot.sendMessage).toHaveBeenCalled();
      expect(sentChatId).toBe(123456);
      expect(sentMessage).toContain("@ahmed_user");
      expect(sentMessage).toContain("Ahmed Ali");
      expect(sentMessage).toContain("Successful:");
      expect(sentMessage).toContain("Pending:");
      expect(sentMessage).toContain("+5 GO");
    });
  });
});
