import { describe, expect, it } from 'vitest';
import { audit, candidateInfo } from './solve';
import type { AuditInput, PulseSequence } from './types';

/* ---------------- 暴力对照实现（仅测试用） ---------------- */

/** 枚举所有合法分组：每条序列 ≥ 2 个脉冲、同一重频、相邻时差 ≤ (漏发上限+1)×重频。 */
function enumerateAll(
  times: number[],
  pris: number[],
  maxMissed: number,
): PulseSequence[][] {
  const n = times.length;
  const used = new Array<boolean>(n).fill(false);
  const solutions: PulseSequence[][] = [];

  const chainsFrom = (start: number, pri: number): number[][] => {
    const out: number[][] = [];
    const rec = (chain: number[]): void => {
      if (chain.length >= 2) out.push([...chain]);
      const last = chain[chain.length - 1];
      for (let j = last + 1; j < n; j++) {
        if (used[j]) continue;
        const d = times[j] - times[last];
        if (d % pri === 0 && d / pri <= maxMissed + 1) {
          chain.push(j);
          rec(chain);
          chain.pop();
        }
      }
    };
    rec([start]);
    return out;
  };

  const rec = (cur: PulseSequence[]): void => {
    let i = 0;
    while (i < n && used[i]) i++;
    if (i === n) {
      solutions.push(cur.map((s) => ({ pri: s.pri, members: [...s.members] })));
      return;
    }
    for (const pri of pris) {
      for (const chain of chainsFrom(i, pri)) {
        for (const v of chain) used[v] = true;
        cur.push({ pri, members: chain });
        rec(cur);
        cur.pop();
        for (const v of chain) used[v] = false;
      }
    }
  };
  rec([]);
  return solutions;
}

function missedOf(times: number[], s: PulseSequence): number {
  let c = 0;
  for (let k = 1; k < s.members.length; k++) {
    c += (times[s.members[k]] - times[s.members[k - 1]]) / s.pri - 1;
  }
  return c;
}

function compareSeq(a: PulseSequence, b: PulseSequence, times: number[]): number {
  const fa = times[a.members[0]];
  const fb = times[b.members[0]];
  if (fa !== fb) return fa - fb;
  if (a.pri !== b.pri) return a.pri - b.pri;
  const len = Math.min(a.members.length, b.members.length);
  for (let i = 0; i < len; i++) {
    if (a.members[i] !== b.members[i]) return a.members[i] - b.members[i];
  }
  return a.members.length - b.members.length;
}

function sortedSeqs(sol: PulseSequence[], times: number[]): PulseSequence[] {
  return [...sol].sort((x, y) => compareSeq(x, y, times));
}

function compareSol(a: PulseSequence[], b: PulseSequence[], times: number[]): number {
  const sa = sortedSeqs(a, times);
  const sb = sortedSeqs(b, times);
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    const c = compareSeq(sa[i], sb[i], times);
    if (c !== 0) return c;
  }
  return sa.length - sb.length;
}

interface BruteResult {
  sequenceCount: number;
  totalMissed: number;
  optimalCount: number;
  canonical: PulseSequence[];
}

function bruteForce(times: number[], pris: number[], maxMissed: number): BruteResult | null {
  const all = enumerateAll(times, pris, maxMissed);
  if (all.length === 0) return null;
  let bestSeq = Infinity;
  let bestMissed = Infinity;
  const scored = all.map((sol) => ({
    sol,
    sc: sol.length,
    mc: sol.reduce((a, s) => a + missedOf(times, s), 0),
  }));
  for (const { sc, mc } of scored) {
    if (sc < bestSeq || (sc === bestSeq && mc < bestMissed)) {
      bestSeq = sc;
      bestMissed = mc;
    }
  }
  const optima = scored
    .filter(({ sc, mc }) => sc === bestSeq && mc === bestMissed)
    .map(({ sol }) => sol);
  let canonical = optima[0];
  for (const sol of optima) {
    if (compareSol(sol, canonical, times) < 0) canonical = sol;
  }
  return {
    sequenceCount: bestSeq,
    totalMissed: bestMissed,
    optimalCount: optima.length,
    canonical: sortedSeqs(canonical, times),
  };
}

/* ---------------- 随机用例生成 ---------------- */

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randomInput(rng: () => number, n: number, span: number): AuditInput {
  const set = new Set<number>();
  while (set.size < n) set.add(Math.floor(rng() * span));
  const times = [...set].sort((a, b) => a - b);
  const priPool = [2, 3, 5, 7, 11];
  const priCount = 1 + Math.floor(rng() * 3);
  const pris: number[] = [];
  while (pris.length < priCount) {
    const p = priPool[Math.floor(rng() * priPool.length)];
    if (!pris.includes(p)) pris.push(p);
  }
  const maxMissed = Math.floor(rng() * 3) as 0 | 1 | 2;
  return { times, pris, maxMissed };
}

/* ---------------- 定向用例 ---------------- */

describe('audit：定向用例', () => {
  it('双雷达无漏发：2 条序列、0 漏发、唯一解', () => {
    const outcome = audit({
      times: [0, 40, 100, 200, 290, 300, 400, 500, 540],
      pris: [100, 250],
      maxMissed: 0,
    });
    expect(outcome.kind).toBe('solved');
    if (outcome.kind !== 'solved') return;
    expect(outcome.sequenceCount).toBe(2);
    expect(outcome.totalMissed).toBe(0);
    expect(outcome.hasMultiple).toBe(false);
    expect(outcome.sequences).toEqual([
      { pri: 100, members: [0, 2, 3, 5, 6, 7] },
      { pri: 250, members: [1, 4, 8] },
    ]);
  });

  it('含漏发：漏发总数最小化', () => {
    const outcome = audit({
      times: [0, 60, 200, 210, 300, 360, 500],
      pris: [100, 150],
      maxMissed: 2,
    });
    expect(outcome.kind).toBe('solved');
    if (outcome.kind !== 'solved') return;
    expect(outcome.sequenceCount).toBe(2);
    expect(outcome.totalMissed).toBe(2);
    expect(outcome.hasMultiple).toBe(false);
    expect(outcome.sequences).toEqual([
      { pri: 100, members: [0, 2, 4, 6] },
      { pri: 150, members: [1, 3, 5] },
    ]);
  });

  it('孤立脉冲：无解并给出各脉冲候选数', () => {
    const input: AuditInput = {
      times: [0, 10, 20, 30, 40, 77],
      pris: [10],
      maxMissed: 0,
    };
    const outcome = audit(input);
    expect(outcome.kind).toBe('no-solution');
    if (outcome.kind !== 'no-solution') return;
    expect(outcome.candidates.total).toEqual([1, 2, 2, 2, 1, 0]);
    expect(outcome.candidates.total[5]).toBe(0);
  });

  it('多解情形：两项目标下存在不同分组，规范解取字典序最小', () => {
    const outcome = audit({
      times: [0, 15, 25, 40, 100, 110],
      pris: [10, 25, 40],
      maxMissed: 2,
    });
    expect(outcome.kind).toBe('solved');
    if (outcome.kind !== 'solved') return;
    expect(outcome.sequenceCount).toBe(3);
    expect(outcome.totalMissed).toBe(0);
    expect(outcome.hasMultiple).toBe(true);
    // 两个最优分组：{[0,25]~25,[15,40]~25,[100,110]~10} 与 {[0,40]~40,[15,25]~10,[100,110]~10}
    // 规范解为重频 25 < 40 的前者
    expect(outcome.sequences).toEqual([
      { pri: 25, members: [0, 2] },
      { pri: 25, members: [1, 3] },
      { pri: 10, members: [4, 5] },
    ]);
  });

  it('每条序列至少两个脉冲：不允许单脉冲序列', () => {
    // 若允许单脉冲，55 可自成一列；规则要求 ≥ 2，故无解
    const outcome = audit({
      times: [0, 10, 20, 30, 40, 55],
      pris: [10],
      maxMissed: 0,
    });
    expect(outcome.kind).toBe('no-solution');
  });

  it('恰好两个脉冲的序列合法', () => {
    const outcome = audit({
      times: [0, 10, 100, 110, 200, 210],
      pris: [10],
      maxMissed: 0,
    });
    expect(outcome.kind).toBe('solved');
    if (outcome.kind !== 'solved') return;
    expect(outcome.sequenceCount).toBe(3);
    expect(outcome.sequences.every((s) => s.members.length === 2)).toBe(true);
  });

  it('漏发上限约束：k 超过上限+1 的间隔不可用', () => {
    // 时差 40 = 4×10，漏发 3 > 上限 2，该边不可用 → 无解
    const outcome = audit({
      times: [0, 10, 20, 30, 40, 80],
      pris: [10],
      maxMissed: 2,
    });
    expect(outcome.kind).toBe('no-solution');
    // 上限放宽到 3 则有解：一条序列，漏发 3
    const ok = audit({
      times: [0, 10, 20, 30, 40, 80],
      pris: [10],
      maxMissed: 3 as 2, // 仅测试用，绕过输入约束
    });
    expect(ok.kind).toBe('solved');
    if (ok.kind !== 'solved') return;
    expect(ok.sequenceCount).toBe(1);
    expect(ok.totalMissed).toBe(3);
  });

  it('规范解按首脉冲时刻排序，且同首时重频小者优先', () => {
    // 0,30,60,90 既可按重频 30（漏 0）也可按重频 10（漏 2/段）覆盖；
    // 目标二使重频 30 胜出，规范解唯一
    const outcome = audit({
      times: [0, 30, 60, 90, 120, 150],
      pris: [10, 30],
      maxMissed: 2,
    });
    expect(outcome.kind).toBe('solved');
    if (outcome.kind !== 'solved') return;
    expect(outcome.sequenceCount).toBe(1);
    expect(outcome.totalMissed).toBe(0);
    expect(outcome.sequences).toEqual([{ pri: 30, members: [0, 1, 2, 3, 4, 5] }]);
  });

  it('candidateInfo 统计出向与入向候选', () => {
    const info = candidateInfo([0, 10, 20, 30, 40, 50], [10], 0);
    expect(info.outgoing).toEqual([1, 1, 1, 1, 1, 0]);
    expect(info.incoming).toEqual([0, 1, 1, 1, 1, 1]);
    expect(info.total).toEqual([1, 2, 2, 2, 2, 1]);
  });
});

/* ---------------- 暴力对照 ---------------- */

describe('audit：与暴力枚举对照', () => {
  it('300 组小规模随机用例的最优值、多解判定与规范解一致', () => {
    const rng = makeRng(20260920);
    for (let t = 0; t < 300; t++) {
      const n = 6 + Math.floor(rng() * 4); // 6–9
      const input = randomInput(rng, n, 8 * n);
      const brute = bruteForce(input.times, input.pris, input.maxMissed);
      const outcome = audit(input);
      if (brute === null) {
        expect(outcome.kind, `用例 ${t} 应为无解`).toBe('no-solution');
        continue;
      }
      expect(outcome.kind, `用例 ${t} 应有解`).toBe('solved');
      if (outcome.kind !== 'solved') continue;
      expect(outcome.sequenceCount, `用例 ${t} 序列数`).toBe(brute.sequenceCount);
      expect(outcome.totalMissed, `用例 ${t} 漏发总数`).toBe(brute.totalMissed);
      expect(outcome.hasMultiple, `用例 ${t} 多解判定`).toBe(brute.optimalCount >= 2);
      expect(outcome.sequences, `用例 ${t} 规范解`).toEqual(brute.canonical);
    }
  });

  it('规范解自身满足全部约束', () => {
    const rng = makeRng(777);
    for (let t = 0; t < 120; t++) {
      const n = 6 + Math.floor(rng() * 5);
      const input = randomInput(rng, n, 10 * n);
      const outcome = audit(input);
      if (outcome.kind !== 'solved') continue;
      const covered = new Array(n).fill(false);
      for (const seq of outcome.sequences) {
        expect(seq.members.length).toBeGreaterThanOrEqual(2);
        for (let k = 1; k < seq.members.length; k++) {
          const d = input.times[seq.members[k]] - input.times[seq.members[k - 1]];
          expect(d % seq.pri).toBe(0);
          expect(d / seq.pri - 1).toBeLessThanOrEqual(input.maxMissed);
        }
        for (const m of seq.members) {
          expect(covered[m]).toBe(false);
          covered[m] = true;
        }
      }
      expect(covered.every(Boolean)).toBe(true);
    }
  });
});

/* ---------------- 规模与性能 ---------------- */

describe('audit：规模边界', () => {
  it('28 个脉冲全连接：快速得到唯一解', () => {
    const times = Array.from({ length: 28 }, (_, i) => i * 10);
    const start = performance.now();
    const outcome = audit({ times, pris: [10], maxMissed: 2 });
    const elapsed = performance.now() - start;
    expect(outcome.kind).toBe('solved');
    if (outcome.kind !== 'solved') return;
    expect(outcome.sequenceCount).toBe(1);
    expect(outcome.totalMissed).toBe(0);
    expect(outcome.hasMultiple).toBe(false);
    expect(elapsed).toBeLessThan(3000);
  });

  it('28 个脉冲含孤立点：快速判定无解', () => {
    const times = [...Array.from({ length: 27 }, (_, i) => i * 10), 5000];
    const start = performance.now();
    const outcome = audit({ times, pris: [10], maxMissed: 0 });
    const elapsed = performance.now() - start;
    expect(outcome.kind).toBe('no-solution');
    expect(elapsed).toBeLessThan(3000);
  });

  it('多候选重频的 28 脉冲用例', () => {
    // 三部雷达：重频 40（0..400）、重频 70（13..433）、重频 110（27..467）
    const a = Array.from({ length: 11 }, (_, i) => i * 40);
    const b = Array.from({ length: 7 }, (_, i) => 13 + i * 70);
    const c = Array.from({ length: 5 }, (_, i) => 27 + i * 110);
    const times = [...a, ...b, ...c].sort((x, y) => x - y);
    expect(times.length).toBe(23);
    const outcome = audit({ times, pris: [40, 70, 110], maxMissed: 0 });
    expect(outcome.kind).toBe('solved');
    if (outcome.kind !== 'solved') return;
    expect(outcome.sequenceCount).toBe(3);
    expect(outcome.totalMissed).toBe(0);
  });
});
