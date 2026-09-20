import { describe, expect, it } from 'vitest';
import {
  audit,
  computeCandidateCounts,
  type AuditInput,
  type RawSequence,
} from './solver';
import { validateInput } from './validation';

function expectCovered(result: ReturnType<typeof audit>) {
  if (result.status !== 'feasible') throw new Error('expected feasible');
  const n = result.times.length;
  const all: number[] = [];
  for (const seq of result.sequences) {
    expect(seq.pulseIndexes.length).toBeGreaterThanOrEqual(2);
    // 每条序列内部下标升序
    for (let k = 1; k < seq.pulseIndexes.length; k++) {
      expect(seq.pulseIndexes[k]).toBeGreaterThan(seq.pulseIndexes[k - 1]);
    }
    all.push(...seq.pulseIndexes);
  }
  all.sort((a, b) => a - b);
  expect(all).toEqual([...Array(n).keys()]);
}

describe('audit - 基础可行解', () => {
  it('双站交织：0,5 重频互串时仍正确分离', () => {
    const result = audit({
      times: [0, 3, 10, 13, 20, 23, 30, 33],
      prfs: [10, 13],
      maxMissed: 0,
    });
    expect(result.status).toBe('feasible');
    expectCovered(result);
    expect(result.sequenceCount).toBe(2);
    expect(result.missedTotal).toBe(0);
    const prfs = result.sequences.map((s) => s.prf).sort();
    expect(prfs).toEqual([10, 13]);
  });

  it('单条重频全覆盖', () => {
    const result = audit({
      times: [0, 7, 14, 21, 28, 35],
      prfs: [7],
      maxMissed: 0,
    });
    expect(result.status).toBe('feasible');
    expectCovered(result);
    expect(result.sequenceCount).toBe(1);
    expect(result.missedTotal).toBe(0);
  });

  it('漏发位置被正确标出', () => {
    const result = audit({
      times: [0, 5, 10, 20, 25, 30],
      prfs: [5],
      maxMissed: 1,
    });
    expect(result.status).toBe('feasible');
    expectCovered(result);
    // 首要目标：1 条序列、1 个漏发
    expect(result.sequenceCount).toBe(1);
    expect(result.missedTotal).toBe(1);
    expect(result.sequences[0].missedTimes).toEqual([15]);
    // 次要口径：拆成 2 条可做到 0 漏发
    expect(result.globalMinMissed).toBe(0);
    expect(result.globalMinMissedSequences).toBe(2);
    expect(result.objectivesDiverge).toBe(true);
    expect(result.tieUnderCombined).toBe(false);
  });

  it('无解：孤立脉冲导致不能全覆盖，候选数为 0', () => {
    const result = audit({
      times: [0, 4, 8, 12, 17, 20, 24, 28],
      prfs: [4],
      maxMissed: 0,
    });
    expect(result.status).toBe('infeasible');
    expect(result.candidateCounts[4]).toBe(0); // 17
    for (const i of [0, 1, 2, 3, 5, 6, 7]) {
      expect(result.candidateCounts[i]).toBeGreaterThan(0);
    }
    expect(result.sequences).toEqual([]);
  });

  it('漏发上限 2：跨越两个空槽可连接', () => {
    const result = audit({
      times: [0, 10, 30, 40, 50, 60],
      prfs: [10],
      maxMissed: 2,
    });
    expect(result.status).toBe('feasible');
    expectCovered(result);
    expect(result.sequenceCount).toBe(1);
    expect(result.missedTotal).toBe(1);
    // 0→10 正常；10→30 差 20（q=2），漏发槽位为 20
    expect(result.sequences[0].missedTimes).toEqual([20]);
  });

  it('重频候选给结果带来选择：取可全覆盖者', () => {
    const result = audit({
      times: [0, 6, 12, 100, 106, 112],
      prfs: [6, 7],
      maxMissed: 0,
    });
    expect(result.status).toBe('feasible');
    expectCovered(result);
    expect(result.sequenceCount).toBe(2);
    expect(result.sequences.every((s) => s.prf === 6)).toBe(true);
  });

  it('结果可重算：同一输入两次运行完全一致', () => {
    const input: AuditInput = {
      times: [0, 3, 10, 13, 20, 23, 30, 33],
      prfs: [10, 13],
      maxMissed: 0,
    };
    const a = audit(input);
    const b = audit(input);
    expect(JSON.stringify(a.sequences)).toBe(JSON.stringify(b.sequences));
    expect(a.sequenceCount).toBe(b.sequenceCount);
    expect(a.missedTotal).toBe(b.missedTotal);
  });
});

describe('candidateCounts', () => {
  it('按同余链计数（漏发容差内）', () => {
    // p=5：0,5,10 一链；20,25 另一链（10->20 差 10，maxMissed=0 时断开）
    const counts = computeCandidateCounts(
      [0, 5, 10, 20, 25, 33],
      [5],
      0,
    );
    expect(counts).toEqual([1, 1, 1, 1, 1, 0]);
  });

  it('多个重频候选累加', () => {
    const counts = computeCandidateCounts([0, 5, 10, 15], [5, 10], 0);
    // p=5 链含全部 4 个；p=10：{0,10}、{5,15} 两链，每个脉冲再 +1
    expect(counts).toEqual([2, 2, 2, 2]);
  });
});

describe('validateInput', () => {
  it('合法输入', () => {
    const v = validateInput('0, 1, 2, 3, 4, 5', '2,3', '1');
    expect(v.ok).toBe(true);
    expect(v.parsed).toEqual({
      times: [0, 1, 2, 3, 4, 5],
      prfs: [2, 3],
      maxMissed: 1,
    });
  });

  it('各类非法输入全部报错且不清空（由 UI 层保留草稿）', () => {
    expect(validateInput('1,2,3', '5', '0').ok).toBe(false); // 少于 6
    expect(validateInput('0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28', '5', '0').ok).toBe(false); // 29
    expect(validateInput('0,1,3,3,4,5', '5', '0').ok).toBe(false); // 非严格递增
    expect(validateInput('-1,0,1,2,3,4', '5', '0').ok).toBe(false); // 负数
    expect(validateInput('0,1,2,3,4,5', '5,5', '0').ok).toBe(false); // 重频重复
    expect(validateInput('0,1,2,3,4,5', '0', '0').ok).toBe(false); // 重频非正
    expect(validateInput('0,1,2,3,4,5', '5', '3').ok).toBe(false); // 上限超 2
    expect(validateInput('0,1,2,3,4,5', '1 2 3 4 5 6 7', '0').ok).toBe(false); // 7 个重频
    expect(validateInput('0,1,2,3,4,5', '', '0').ok).toBe(false); // 无重频
    expect(validateInput('0,1,2,3,4,5', '5', '').ok).toBe(false); // 无上限
    expect(validateInput('0,1.5,2,3,4,5', '5', '0').ok).toBe(false); // 非整数
  });

  it('支持多种分隔符', () => {
    const v = validateInput('0 1；2，3、4\n5', '3 7', '2');
    expect(v.ok).toBe(true);
  });
});

// ---- 暴力参照实现：穷举所有集合划分 × 每块重频指派 ----
interface BruteBest {
  paths: number;
  miss: number;
  count: number;
  globalMiss: number;
  feasible: boolean;
  canonicalKey: number[] | null;
}

function bruteForce(times: number[], prfs: number[], L: number): BruteBest {
  const n = times.length;
  let best: BruteBest = {
    paths: Infinity,
    miss: Infinity,
    count: 0,
    globalMiss: Infinity,
    feasible: false,
    canonicalKey: null,
  };

  const consider = (
    blocks: { members: number[]; prf: number; miss: number }[],
  ) => {
    if (blocks.some((b) => b.members.length < 2)) return;
    best.feasible = true;
    const P = blocks.length;
    const M = blocks.reduce((s, b) => s + b.miss, 0);
    if (M < best.globalMiss) best.globalMiss = M;
    if (P < best.paths || (P === best.paths && M < best.miss)) {
      best.paths = P;
      best.miss = M;
      best.count = 1;
      best.canonicalKey = canonicalKey(blocks, times);
    } else if (P === best.paths && M === best.miss) {
      best.count++;
      const key = canonicalKey(blocks, times);
      if (best.canonicalKey === null || cmpNum(key, best.canonicalKey) < 0) {
        best.canonicalKey = key;
      }
    }
  };

  // 生成集合划分（受限增长串），叶子上对每块枚举合法重频指派
  const blockOf: number[] = new Array(n).fill(-1);

  const evaluate = () => {
    const blocksRaw: number[][] = [];
    for (let i = 0; i < n; i++) {
      (blocksRaw[blockOf[i]] ??= []).push(i);
    }
    if (blocksRaw.some((b) => b.length < 2)) return;

    const options: { prf: number; miss: number }[][] = blocksRaw.map(
      (members) => {
        const opts: { prf: number; miss: number }[] = [];
        for (const p of prfs) {
          let miss = 0;
          let ok = true;
          for (let k = 1; k < members.length; k++) {
            const d = times[members[k]] - times[members[k - 1]];
            if (d % p !== 0) {
              ok = false;
              break;
            }
            const q = d / p;
            if (q < 1 || q > L + 1) {
              ok = false;
              break;
            }
            miss += q - 1;
          }
          if (ok) opts.push({ prf: p, miss });
        }
        return opts;
      },
    );
    if (options.some((o) => o.length === 0)) return;

    const chosen: { members: number[]; prf: number; miss: number }[] = [];
    const assign = (bi: number) => {
      if (bi === blocksRaw.length) {
        consider(chosen.map((c, i) => ({ ...c, members: blocksRaw[i] })));
        return;
      }
      for (const opt of options[bi]) {
        chosen[bi] = { members: blocksRaw[bi], prf: opt.prf, miss: opt.miss };
        assign(bi + 1);
      }
    };
    assign(0);
  };

  const gen = (i: number, maxBlock: number) => {
    if (i === n) {
      evaluate();
      return;
    }
    for (let b = 0; b <= maxBlock + 1; b++) {
      blockOf[i] = b;
      gen(i + 1, Math.max(maxBlock, b));
    }
  };
  if (n > 0) {
    blockOf[0] = 0;
    gen(1, 0);
  }

  return best;
}

function canonicalKey(
  blocks: { members: number[]; prf: number }[],
  times: number[],
): number[] {
  const entries = blocks
    .map((b) => ({
      first: times[b.members[0]],
      prf: b.prf,
      members: b.members.slice(),
    }))
    .sort(
      (a, b) =>
        a.first - b.first ||
        a.prf - b.prf ||
        cmpNum(a.members, b.members),
    );
  const key: number[] = [];
  for (const e of entries) key.push(e.first, e.prf, ...e.members);
  return key;
}

function cmpNum(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function resultKey(raw: RawSequence[], times: number[]): number[] {
  return canonicalKey(
    raw.map((r) => ({ members: r.members, prf: r.prf })),
    times,
  );
}

// 确定性伪随机，保证测试可复现
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('随机小规模实例：与暴力枚举完全一致', () => {
  const cases: { times: number[]; prfs: number[]; L: number }[] = [];
  const rand = mulberry32(20260920);
  for (let trial = 0; trial < 220; trial++) {
    const n = 6 + Math.floor(rand() * 4); // 6..9
    const prfPool = [2, 3, 4, 5, 7, 10];
    const k = 1 + Math.floor(rand() * 3);
    const prfs = [...new Set(
      Array.from({ length: k }, () => prfPool[Math.floor(rand() * prfPool.length)]),
    )];
    const L = Math.floor(rand() * 3);
    const times: number[] = [];
    let t = Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      t += 1 + Math.floor(rand() * 12);
      times.push(t);
    }
    cases.push({ times, prfs, L });
  }

  cases.forEach((c, idx) => {
    it(`随机实例 #${idx + 1}: [${c.times}] prf[${c.prfs}] L=${c.L}`, () => {
      const expected = bruteForce(c.times, c.prfs, c.L);
      const result = audit({
        times: c.times,
        prfs: c.prfs,
        maxMissed: c.L,
      });

      if (!expected.feasible) {
        expect(result.status).toBe('infeasible');
        for (let i = 0; i < c.times.length; i++) {
          // 候选数为 0 ⇔ 不属于任何长度>=2 的合法块（孤立点）
          const canPair = c.times.some((_, j) => {
            if (j === i) return false;
            const d = Math.abs(c.times[i] - c.times[j]);
            return c.prfs.some(
              (p) => d % p === 0 && d / p >= 1 && d / p <= c.L + 1,
            );
          });
          expect(result.candidateCounts[i] === 0).toBe(!canPair);
        }
        return;
      }

      expect(result.status).toBe('feasible');
      expectCovered(result);
      expect(result.sequenceCount).toBe(expected.paths);
      expect(result.missedTotal).toBe(expected.miss);
      expect(result.globalMinMissed).toBe(expected.globalMiss);
      expect(result.objectivesDiverge).toBe(
        expected.globalMiss < expected.miss,
      );
      expect(result.tieUnderCombined).toBe(expected.count >= 2);

      const raw: RawSequence[] = result.sequences.map((s) => ({
        prf: s.prf,
        members: s.pulseIndexes,
      }));
      expect(resultKey(raw, c.times)).toEqual(expected.canonicalKey);
    });
  });

  it('手工冲突样例与暴力一致', () => {
    const c = { times: [0, 5, 10, 20, 25, 30], prfs: [5], L: 1 };
    const expected = bruteForce(c.times, c.prfs, c.L);
    const result = audit({
      times: c.times,
      prfs: c.prfs,
      maxMissed: c.L,
    });
    expect(expected.paths).toBe(1);
    expect(expected.miss).toBe(1);
    expect(expected.globalMiss).toBe(0);
    expect(result.objectivesDiverge).toBe(true);
    expect(result.tieUnderCombined).toBe(false);
  });
});
