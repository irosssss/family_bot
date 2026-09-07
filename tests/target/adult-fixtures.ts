import type { AdultSecurityConfig } from '../../src/target/access/adultPolicy';
import { familyConfig } from './family-access-fixtures';

// Synthetic fixture policies and pepper; never production credentials.
export const syntheticPepper = () => new Uint8Array(32).fill(7);
export const syntheticPin = '001234';
export const adultConfig = (now: () => number): AdultSecurityConfig => ({
  family:familyConfig(now),pepperKeyId:'fixture_pepper',setupSeconds:600,adultGrantSeconds:1800,adultIdleSeconds:300,freshSeconds:120,
  failedShortMax:5,shortWindowSeconds:900,pauseSeconds:900,failedDailyMax:20,dailyWindowSeconds:86400,
  sourceAttemptMax:10,sourceWindowSeconds:600,revokePairSeconds:300,
});
