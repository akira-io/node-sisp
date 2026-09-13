import { describe, expect, it } from 'vitest';
import type { GetContractSubject } from './types';

export function runRateLimitsContract(getSubject: GetContractSubject): void {
  describe('rateLimits.hit', () => {
    it('counts the first hit on an identifier it has never seen', async () => {
      const { storage } = getSubject();
      const blocked = await storage.rateLimits.hit({
        identifier: '198.51.100.1',
        limitType: 'ip',
        limit: 3,
        windowSeconds: 60,
      });

      expect(blocked).toBe(false);
    });

    it('blocks once the hits pass the limit', async () => {
      const { storage } = getSubject();
      const params = {
        identifier: '198.51.100.2',
        limitType: 'ip',
        limit: 2,
        windowSeconds: 60,
      };

      expect(await storage.rateLimits.hit(params)).toBe(false);
      expect(await storage.rateLimits.hit(params)).toBe(false);
      expect(await storage.rateLimits.hit(params)).toBe(true);
    });

    it('counts identifiers and limit types separately', async () => {
      const { storage } = getSubject();
      const first = { identifier: '198.51.100.3', limitType: 'ip', limit: 1, windowSeconds: 60 };
      const second = { identifier: '198.51.100.3', limitType: 'user', limit: 1, windowSeconds: 60 };

      expect(await storage.rateLimits.hit(first)).toBe(false);
      expect(await storage.rateLimits.hit(second)).toBe(false);
      expect(await storage.rateLimits.hit(first)).toBe(true);
    });

    it('starts a fresh window once the previous one expires', async () => {
      const { storage } = getSubject();
      const params = {
        identifier: '198.51.100.4',
        limitType: 'ip',
        limit: 1,
        windowSeconds: -1,
      };

      expect(await storage.rateLimits.hit(params)).toBe(false);
      expect(await storage.rateLimits.hit(params)).toBe(false);
    });
  });
}
