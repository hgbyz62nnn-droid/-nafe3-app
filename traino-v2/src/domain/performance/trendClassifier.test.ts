import { describe, expect, it } from 'vitest';
import { classifyTrend, directionBetween } from './trendClassifier';

describe('classifyTrend', () => {
  it('A/G: empty series is insufficient_data', () => {
    const result = classifyTrend([]);
    expect(result.state).toBe('insufficient_data');
    expect(result.confidence).toBe('insufficient');
    expect(result.sampleSize).toBe(0);
  });

  it('B: a single point never creates a trend (spec §31 invariant #2)', () => {
    const result = classifyTrend([100]);
    expect(result.state).toBe('insufficient_data');
  });

  it('D: two points, clearly increasing -> improving', () => {
    const result = classifyTrend([70, 80]);
    expect(result.state).toBe('improving');
    expect(result.confidence).toBe('limited');
  });

  it('F: two points, clearly decreasing -> declining', () => {
    const result = classifyTrend([80, 70]);
    expect(result.state).toBe('declining');
  });

  it('E: identical values -> stable', () => {
    const result = classifyTrend([70, 70, 70, 70]);
    expect(result.state).toBe('stable');
  });

  it('E: a change within the stable tolerance band stays stable', () => {
    const result = classifyTrend([100, 100, 101]); // < 2% change
    expect(result.state).toBe('stable');
  });

  it('C/D: sufficient confidence at >=4 comparable points', () => {
    const result = classifyTrend([60, 65, 70, 75]);
    expect(result.state).toBe('improving');
    expect(result.confidence).toBe('sufficient');
  });

  it('Y: outlier protection — one bad session does not flip an otherwise improving trend', () => {
    // Mostly climbing, one low outlier in the middle.
    const result = classifyTrend([60, 65, 40, 75, 80]);
    expect(result.state).toBe('improving');
  });

  it('Y: outlier protection — one great session does not flip an otherwise declining trend', () => {
    const result = classifyTrend([80, 75, 95, 65, 60]);
    expect(result.state).toBe('declining');
  });

  it('higherIsBetter:false flips the direction (e.g. stress/soreness going down is improving)', () => {
    const result = classifyTrend([4, 4, 2, 2], { higherIsBetter: false });
    expect(result.state).toBe('improving');
  });

  it('only bounds to the trailing window (ancient history does not dominate "recent")', () => {
    const ancient = new Array(10).fill(1000);
    const recent = [60, 65, 70, 75, 80, 85]; // exactly TREND_WINDOW_SIZE, fully replaces the window
    const a = classifyTrend([...ancient, ...recent]);
    const b = classifyTrend(recent);
    expect(a.state).toBe(b.state);
  });

  it('drops non-finite values rather than producing NaN/Infinity (spec §27)', () => {
    const result = classifyTrend([60, NaN, 70, Infinity, 80]);
    expect(Number.isFinite(result.sampleSize)).toBe(true);
    expect(['improving', 'stable', 'declining', 'insufficient_data']).toContain(result.state);
  });

  it('Z: determinism — same series always classifies the same', () => {
    const series = [60, 55, 70, 65, 80];
    expect(classifyTrend(series)).toEqual(classifyTrend([...series]));
  });
});

describe('directionBetween', () => {
  it('X: reports insufficient_data when either value is missing', () => {
    expect(directionBetween(null, 50)).toBe('insufficient_data');
    expect(directionBetween(50, null)).toBe('insufficient_data');
  });

  it('X: reports up/down/unchanged for real numbers', () => {
    expect(directionBetween(80, 70)).toBe('up');
    expect(directionBetween(70, 80)).toBe('down');
    expect(directionBetween(70, 70)).toBe('unchanged');
  });

  it('rejects non-finite inputs as insufficient_data', () => {
    expect(directionBetween(NaN, 50)).toBe('insufficient_data');
    expect(directionBetween(50, Infinity)).toBe('insufficient_data');
  });
});
