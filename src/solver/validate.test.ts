import { describe, expect, it } from 'vitest';
import { countTokens, parseDraft, type Draft } from './validate';

const goodDraft: Draft = {
  timesText: '0 40 100 200 290 300 400 500 540',
  prisText: '100 250',
  maxMissed: 0,
};

describe('parseDraft', () => {
  it('合法输入通过并给出审计输入', () => {
    const r = parseDraft(goodDraft);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.times).toEqual([0, 40, 100, 200, 290, 300, 400, 500, 540]);
    expect(r.input.pris).toEqual([100, 250]);
    expect(r.input.maxMissed).toBe(0);
  });

  it('支持逗号、中文逗号、顿号、分号分隔', () => {
    const r = parseDraft({ ...goodDraft, timesText: '0，40、100;200，290 300,400 500 540' });
    expect(r.ok).toBe(true);
  });

  it('脉冲时刻少于 6 个被拒绝', () => {
    const r = parseDraft({ ...goodDraft, timesText: '0 10 20 30 40' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('6–28'))).toBe(true);
  });

  it('脉冲时刻多于 28 个被拒绝', () => {
    const times = Array.from({ length: 29 }, (_, i) => i * 10).join(' ');
    const r = parseDraft({ ...goodDraft, timesText: times });
    expect(r.ok).toBe(false);
  });

  it('非整数项被拒绝并指出位置', () => {
    const r = parseDraft({ ...goodDraft, timesText: '0 10 abc 30 40 50' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('abc') && e.includes('第 3 项'))).toBe(true);
  });

  it('负数时刻被拒绝', () => {
    const r = parseDraft({ ...goodDraft, timesText: '0 10 -5 30 40 50' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('负数'))).toBe(true);
  });

  it('非严格递增被拒绝（含相等）', () => {
    const r = parseDraft({ ...goodDraft, timesText: '0 10 10 30 40 50' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('严格递增'))).toBe(true);
  });

  it('空输入被拒绝', () => {
    const r = parseDraft({ timesText: '   ', prisText: '', maxMissed: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('不能为空'))).toBe(true);
  });

  it('重频重复被拒绝', () => {
    const r = parseDraft({ ...goodDraft, prisText: '100 250 100' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('重复'))).toBe(true);
  });

  it('重频非正整数被拒绝', () => {
    const r = parseDraft({ ...goodDraft, prisText: '100 0' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('正整数'))).toBe(true);
  });

  it('重频超过 6 个被拒绝', () => {
    const r = parseDraft({ ...goodDraft, prisText: '10 20 30 40 50 60 70' });
    expect(r.ok).toBe(false);
  });

  it('漏发上限非法被拒绝', () => {
    const r = parseDraft({ ...goodDraft, maxMissed: 3 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('漏发上限'))).toBe(true);
  });

  it('多个问题一次性汇总', () => {
    const r = parseDraft({ timesText: '0 5 5', prisText: '0 0', maxMissed: 9 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe('countTokens', () => {
  it('统计已识别项数', () => {
    expect(countTokens('0 10 20')).toBe(3);
    expect(countTokens('  ')).toBe(0);
    expect(countTokens('0,10，20、30;40')).toBe(5);
  });
});
