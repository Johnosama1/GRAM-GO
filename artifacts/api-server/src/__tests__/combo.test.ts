import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import comboRouter, { getTodayDateString } from '../routes/combo';
import { db } from '@workspace/db';

// Mock dependencies
vi.mock('@workspace/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    transaction: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn(),
  },
}));

vi.mock('../middlewares/requireSession', () => ({
  requireSession: (req: any, res: any, next: any) => {
    req.sessionUserId = 1;
    next();
  },
}));

vi.mock('../middlewares/verifyAccess', () => ({
  verifyAccessMiddleware: (req: any, res: any, next: any) => {
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/api/combo', comboRouter);

describe('Daily Combo API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/combo/status', () => {
    it('returns no attempt state when user has not attempted', async () => {
      // Mock db responses
      const mockLimit = vi.fn().mockResolvedValue([]); // No attempt found

      // Override db.select chaining
      (db as any).select = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                  limit: mockLimit
              })
          })
      });

      const response = await request(app).get('/api/combo/status');

      expect(response.status).toBe(200);
      expect(response.body.attempted).toBe(false);
      expect(response.body.selectedItems).toEqual([]);
      // Should not leak correct combo
      expect(response.body).not.toHaveProperty('correctCombo');
      expect(response.body).not.toHaveProperty('item1');
    });

    it('returns attempted state with correct parsing for string JSON selectedItems', async () => {
      const mockLimit = vi.fn().mockResolvedValue([{
        userId: 1,
        comboDate: getTodayDateString(),
        selectedItems: "[3, 2, 1]",
        isSuccess: true,
      }]);

      (db as any).select = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                  limit: mockLimit
              })
          })
      });

      const response = await request(app).get('/api/combo/status');

      expect(response.status).toBe(200);
      expect(response.body.attempted).toBe(true);
      expect(response.body.selectedItems).toEqual([3, 2, 1]);
      expect(response.body.isSuccess).toBe(true);
    });

    it('returns attempted state with correct parsing for array selectedItems', async () => {
      const mockLimit = vi.fn().mockResolvedValue([{
        userId: 1,
        comboDate: getTodayDateString(),
        selectedItems: [1, 2, 3],
        isSuccess: false,
      }]);

      (db as any).select = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                  limit: mockLimit
              })
          })
      });

      const response = await request(app).get('/api/combo/status');

      expect(response.status).toBe(200);
      expect(response.body.attempted).toBe(true);
      expect(response.body.selectedItems).toEqual([1, 2, 3]);
      expect(response.body.isSuccess).toBe(false);
    });
  });

  describe('POST /api/combo/check', () => {
    it('persists exact selected order without converting to Set (attempted + correct)', async () => {
      const mockComboLimit = vi.fn().mockResolvedValue([{
        item1: 3, item2: 2, item3: 1
      }]);
      (db as any).select = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                  limit: mockComboLimit
              })
          })
      });

      // Mock transaction
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]), // no existing attempt
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };
      // Mock catch on transaction log
      (mockTx.values as any).mockImplementation(() => ({
        catch: vi.fn()
      }));

      (db.transaction as any).mockImplementation(async (cb: any) => {
        return await cb(mockTx);
      });

      const response = await request(app)
        .post('/api/combo/check')
        .send({ selectedItems: [3, 2, 1] });

      expect(response.status).toBe(200);
      expect(response.body.isSuccess).toBe(true);
      expect(response.body.selectedItems).toEqual([3, 2, 1]); // exact order preserved

      // Verify insert was called with exact order
      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockTx.values).toHaveBeenCalledWith(expect.objectContaining({
        selectedItems: [3, 2, 1]
      }));
    });

    it('persists exact selected order without converting to Set (attempted + incorrect)', async () => {
      const mockComboLimit = vi.fn().mockResolvedValue([{
        item1: 1, item2: 2, item3: 3
      }]);
      (db as any).select = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                  limit: mockComboLimit
              })
          })
      });

      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };
      (mockTx.values as any).mockImplementation(() => ({
        catch: vi.fn()
      }));
      (db.transaction as any).mockImplementation(async (cb: any) => {
        return await cb(mockTx);
      });

      const response = await request(app)
        .post('/api/combo/check')
        .send({ selectedItems: [1, 2, 4] });

      expect(response.status).toBe(200);
      expect(response.body.isSuccess).toBe(false);
      expect(response.body.selectedItems).toEqual([1, 2, 4]); // exact order preserved

      expect(mockTx.values).toHaveBeenCalledWith(expect.objectContaining({
        selectedItems: [1, 2, 4],
        isSuccess: false
      }));
    });
  });
});
