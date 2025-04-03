/**
 * Tests for the datetime utility functions
 */
import { generateTimestamp } from '../../src/utils/datetime-utils';

describe('DateTime Utils', () => {
  describe('generateTimestamp', () => {
    it('should generate a timestamp in the correct format', () => {
      const timestamp = generateTimestamp();
      
      // Verify timestamp has correct format (14 digits: YYYYMMDDHHMMSS)
      expect(timestamp).toMatch(/^\d{14}$/);
      
      // Parse the timestamp parts to verify valid date values
      const year = parseInt(timestamp.substring(0, 4));
      const month = parseInt(timestamp.substring(4, 6));
      const day = parseInt(timestamp.substring(6, 8));
      const hour = parseInt(timestamp.substring(8, 10));
      const minute = parseInt(timestamp.substring(10, 12));
      const second = parseInt(timestamp.substring(12, 14));
      
      // Verify the values are within valid ranges
      expect(year).toBeGreaterThanOrEqual(2020);
      expect(year).toBeLessThanOrEqual(2100);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(31);
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(23);
      expect(minute).toBeGreaterThanOrEqual(0);
      expect(minute).toBeLessThanOrEqual(59);
      expect(second).toBeGreaterThanOrEqual(0);
      expect(second).toBeLessThanOrEqual(59);
    });
    
    it('should generate timestamps based on UTC time', () => {
      // Mock Date.prototype.toISOString to return a fixed value
      const originalToISOString = Date.prototype.toISOString;
      Date.prototype.toISOString = jest.fn(() => '2025-04-03T04:05:06.789Z');
      
      const timestamp = generateTimestamp();
      
      // Restore the original function
      Date.prototype.toISOString = originalToISOString;
      
      // Expected timestamp from the mocked UTC time: 20250403040506
      expect(timestamp).toBe('20250403040506');
    });
    
    it('should be consistent when called multiple times within the same second', () => {
      // Lock the time for the duration of this test
      jest.useFakeTimers();
      const fixedDate = new Date('2025-04-03T04:05:06.789Z');
      jest.setSystemTime(fixedDate);
      
      const timestamp1 = generateTimestamp();
      const timestamp2 = generateTimestamp();
      
      expect(timestamp1).toBe(timestamp2);
      
      // Restore the real timers
      jest.useRealTimers();
    });
  });
});
