// 雷达脉冲序列归类求解器（纯离线、可重算、无副作用）
//
// 模型：把每个脉冲看作顶点。重频 p 下若 times[j]-times[i] 是 p 的 q 倍
// 且 1 <= q <= maxMissed+1，则存在一条颜色为 p 的有向边 i->j
// （q-1 即该相邻对之间的漏发数）。
// 一次合法分组 = 所有顶点的一个两两不交、同色路径覆盖，且每条路径至少含
// 两个顶点；目标依次为最小化路径数、最小化漏发总数。
//
// 为避免“等差时刻 + 允许漏发”时完整片段数量指数爆炸，这里不枚举片段，
// 而是按下标顺序逐个分派脉冲：延伸某条开放路径，或开启新路径。每个最终
// 划分在该过程中对应唯一的决策序列，便于计数与字典序规范化。

export interface AuditInput {
  times: number[];
  prfs: number[];
  maxMissed: number;
}

export interface SequenceResult {
  prf: number;
  /** 落入该序列的脉冲在 times 中的下标（升序） */
  pulseIndexes: number[];
  /** 相邻脉冲之间每个漏发槽位对应的绝对时刻（微秒） */
  missedTimes: number[];
  missedCount: number;
}

export interface AuditResult {
  status: 'feasible' | 'infeasible';
  times: number[];
  prfs: number[];
  maxMissed: number;
  /** 最优（序列数, 漏发总数） */
  sequenceCount: number;
  missedTotal: number;
  /** 不限制序列数时，全局可达的最小漏发总数；无解为 null */
  globalMinMissed: number | null;
  /** 取得全局最小漏发时所需的最少序列数；无解为 null */
  globalMinMissedSequences: number | null;
  /** 两项目标（最小序列数 / 最小漏发）的最优分组是否不同 */
  objectivesDiverge: boolean;
  /** 合并目标（序列数优先，漏发次之）下是否存在多个不同的最优分组 */
  tieUnderCombined: boolean;
  sequences: SequenceResult[];
  /** 每个脉冲可参与的候选同余链数量（重频 × 同余链） */
  candidateCounts: number[];
  stats: { nodes: number; elapsedMs: number };
}

export class AuditTimeoutError extends Error {
  constructor(public readonly nodes: number) {
    super('搜索节点数超出预算，输入规模可能产生过多分组');
    this.name = 'AuditTimeoutError';
  }
}

interface Edge {
  p: number;
  q: number;
}

interface OpenPath {
  /** 0 表示仅含一个脉冲、重频尚未定型的新路径 */
  prf: number;
  members: number[];
}

export interface RawSequence {
  prf: number;
  members: number[];
}

interface SearchContext {
  n: number;
  times: number[];
  prfs: number[];
  maxMissed: number;
  /** edge[t][i]：尾 t 连向脉冲 i 的全部合法边，按 (q, p) 升序 */
  edge: Edge[][][];
  /** nextPartner[t][i]：t 的可连脉冲中不小于 i 的最小下标，无则 n */
  nextPartner: number[][];
  nodes: number;
  aborted: boolean;
}

const METRIC_NODE_LIMIT = 6_000_000;

export function audit(input: AuditInput): AuditResult {
  const startedAt = Date.now();
  const ctx = buildContext(input);

  const metrics = searchMetrics(ctx);
  if (metrics.aborted) throw new AuditTimeoutError(metrics.nodes);

  const candidateCounts = computeCandidateCounts(
    ctx.times,
    ctx.prfs,
    ctx.maxMissed,
  );

  if (!metrics.feasible) {
    return {
      status: 'infeasible',
      times: ctx.times,
      prfs: ctx.prfs,
      maxMissed: ctx.maxMissed,
      sequenceCount: 0,
      missedTotal: 0,
      globalMinMissed: null,
      globalMinMissedSequences: null,
      objectivesDiverge: false,
      tieUnderCombined: false,
      sequences: [],
      candidateCounts,
      stats: { nodes: metrics.nodes, elapsedMs: Date.now() - startedAt },
    };
  }

  const canonical = searchCanonical(ctx, metrics.bestPaths, metrics.bestMiss);
  if (canonical.aborted) {
    throw new AuditTimeoutError(metrics.nodes + canonical.nodes);
  }

  const sequences = canonical.sequences.map((raw) =>
    buildSequence(ctx.times, raw),
  );

  return {
    status: 'feasible',
    times: ctx.times,
    prfs: ctx.prfs,
    maxMissed: ctx.maxMissed,
    sequenceCount: metrics.bestPaths,
    missedTotal: metrics.bestMiss,
    globalMinMissed: metrics.globalMinMiss,
    globalMinMissedSequences: metrics.globalMinMissPaths,
    objectivesDiverge: metrics.globalMinMiss < metrics.bestMiss,
    tieUnderCombined: canonical.solutionCount >= 2,
    sequences,
    candidateCounts,
    stats: {
      nodes: metrics.nodes + canonical.nodes,
      elapsedMs: Date.now() - startedAt,
    },
  };
}

function buildContext(input: AuditInput): SearchContext {
  const times = input.times.slice();
  const prfs = input.prfs.slice().sort((v, w) => v - w);
  const n = times.length;

  const edge: Edge[][][] = [];
  for (let t = 0; t < n; t++) {
    const row: Edge[][] = [];
    for (let i = 0; i < n; i++) {
      const list: Edge[] = [];
      if (i > t) {
        const d = times[i] - times[t];
        for (const p of prfs) {
          if (d % p === 0) {
            const q = d / p;
            if (q >= 1 && q <= input.maxMissed + 1) list.push({ p, q });
          }
        }
        list.sort((a, b) => a.q - b.q || a.p - b.p);
      }
      row.push(list);
    }
    edge.push(row);
  }

  /** nextPartner[t][i]：t 的可连脉冲中不小于 i 的最小下标，无则 n */
  const nextPartner: number[][] = new Array(n);
  for (let t = 0; t < n; t++) {
    nextPartner[t] = new Array(n + 1).fill(n);
    for (let i = n - 1; i >= 0; i--) {
      nextPartner[t][i] =
        i > t && edge[t][i].length > 0 ? i : nextPartner[t][i + 1];
    }
  }

  return {
    n,
    times,
    prfs,
    maxMissed: input.maxMissed,
    edge,
    nextPartner,
    nodes: 0,
    aborted: false,
  };
}

interface MetricsResult {
  feasible: boolean;
  bestPaths: number;
  bestMiss: number;
  globalMinMiss: number;
  globalMinMissPaths: number;
  nodes: number;
  aborted: boolean;
}

/**
 * 第一阶段：只算指标。
 * 状态记忆 (i, 各路径尾及其重频的多重集)：后续可延伸性只取决于尾，成员
 * 归属不影响任何指标，因此同一状态被不更差的 (路径数, 漏发) 到达过时可剪枝。
 */
function searchMetrics(ctx: SearchContext): MetricsResult {
  const { n } = ctx;
  const paths: OpenPath[] = [];

  let bestPaths = Infinity;
  let bestMiss = Infinity;
  let globalMinMiss = Infinity;
  let globalMinMissPaths = Infinity;

  // 同一状态保留互相不支配的 (路径数, 漏发) Pareto 点集：新到达者若被任一
  // 点分量支配则剪枝；否则加入并移除被它支配的旧点。
  const memo = new Map<string, Array<[number, number]>>();

  function dfs(i: number, pathCount: number, miss: number) {
    if (ctx.aborted) return;
    if ((++ctx.nodes & 0x3fff) === 0 && ctx.nodes > METRIC_NODE_LIMIT) {
      ctx.aborted = true;
      return;
    }

    let fresh = 0;
    for (const path of paths) {
      if (path.prf === 0) {
        fresh++;
        // i 及之后若再无可连脉冲，该单脉冲永远无法定型
        if (ctx.nextPartner[path.members[0]][i] >= n) return;
      }
    }
    if (fresh > n - i) return; // 每个剩余脉冲至多救活一条新路径

    if (i === n) {
      if (fresh === 0) {
        if (
          pathCount < bestPaths ||
          (pathCount === bestPaths && miss < bestMiss)
        ) {
          bestPaths = pathCount;
          bestMiss = miss;
        }
        if (
          miss < globalMinMiss ||
          (miss === globalMinMiss && pathCount < globalMinMissPaths)
        ) {
          globalMinMiss = miss;
          globalMinMissPaths = pathCount;
        }
      }
      return;
    }

    const canImproveCombined =
      pathCount < bestPaths || (pathCount === bestPaths && miss <= bestMiss);
    const canImproveGlobal =
      miss < globalMinMiss ||
      (miss === globalMinMiss && pathCount < globalMinMissPaths);
    if (!canImproveCombined && !canImproveGlobal) return;

    const stateKey =
      i +
      '|' +
      paths
        .map((path) => path.members[path.members.length - 1] + ':' + path.prf)
        .sort()
        .join(',');
    const prev = memo.get(stateKey);
    if (prev !== undefined) {
      if (prev.some(([pp, pm]) => pp <= pathCount && pm <= miss)) return;
      // 移除被当前点支配的旧点
      for (let k = prev.length - 1; k >= 0; k--) {
        const [pp, pm] = prev[k];
        if (pathCount <= pp && miss <= pm) prev.splice(k, 1);
      }
      prev.push([pathCount, miss]);
    } else {
      memo.set(stateKey, [[pathCount, miss]]);
    }

    // 延伸动作优先：少漏发、小重频，尽快拿到高质量在位解
    type Move = { pathIdx: number; p: number; add: number };
    const moves: Move[] = [];
    for (let pi = 0; pi < paths.length; pi++) {
      const path = paths[pi];
      const tail = path.members[path.members.length - 1];
      for (const e of ctx.edge[tail][i]) {
        if (path.prf !== 0 && path.prf !== e.p) continue;
        moves.push({ pathIdx: pi, p: e.p, add: e.q - 1 });
      }
    }
    moves.sort((a, b) => a.add - b.add || a.p - b.p || a.pathIdx - b.pathIdx);

    for (const move of moves) {
      const path = paths[move.pathIdx];
      const oldPrf = path.prf;
      path.prf = move.p;
      path.members.push(i);
      dfs(i + 1, pathCount, miss + move.add);
      path.members.pop();
      path.prf = oldPrf;
      if (ctx.aborted) return;
    }

    paths.push({ prf: 0, members: [i] });
    dfs(i + 1, pathCount + 1, miss);
    paths.pop();
  }

  dfs(0, 0, 0);

  return {
    feasible: Number.isFinite(bestPaths),
    bestPaths,
    bestMiss,
    globalMinMiss,
    globalMinMissPaths,
    nodes: ctx.nodes,
    aborted: ctx.aborted,
  };
}

interface Segment {
  mask: number;
  first: number;
  prf: number;
  miss: number;
  members: number[];
}

interface CanonicalResult {
  sequences: RawSequence[];
  /** 取得目标指标的不同分组数（封顶为 2，仅用于判断并列） */
  solutionCount: number;
  nodes: number;
  aborted: boolean;
}

const SEG_NODE_LIMIT = 2_000_000;
const DP_STATE_LIMIT = 1_500_000;

/**
 * 第二阶段：枚举所有合法序列片段（同色、相邻间距合法、漏发不超过目标 M），
 * 再用按位掩码的记忆化计数 DP 求精确分组数，并贪心重建规范解。
 *
 * 去重：当前未覆盖的最小下标 s 必须是下一序列的首脉冲，因此只在 first=s
 * 的片段里选择，每个分组恰好被走一次。重建时片段按 (重频, 脉冲下标元组)
 * 字典序尝试，第一个能走向完成的片段即规范解的对应序列。
 */
function searchCanonical(
  ctx: SearchContext,
  targetPaths: number,
  targetMiss: number,
): CanonicalResult {
  const { n, prfs } = ctx;
  let nodes = 0;
  let aborted = false;

  // ---- 枚举片段：每个片段至少两个脉冲，首脉冲为其最小下标 ----
  const segments: Segment[] = [];
  const members: number[] = [];

  function recurse(first: number, prf: number, miss: number) {
    if (aborted) return;
    if (++nodes > SEG_NODE_LIMIT) {
      aborted = true;
      return;
    }
    if (members.length >= 2) {
      let mask = 0;
      for (const i of members) mask |= 1 << i;
      segments.push({
        mask,
        first,
        prf,
        miss,
        members: members.slice(),
      });
    }
    const tail = members[members.length - 1];
    for (let j = tail + 1; j < n; j++) {
      const e = ctx.edge[tail][j].find((edge) => edge.p === prf);
      if (e !== undefined && miss + e.q - 1 <= targetMiss) {
        members.push(j);
        recurse(first, prf, miss + e.q - 1);
        members.pop();
      }
    }
  }

  for (let first = 0; first < n - 1; first++) {
    for (const p of prfs) {
      members.length = 0;
      members.push(first);
      recurse(first, p, 0);
      if (aborted) break;
    }
    if (aborted) break;
  }

  if (aborted) return { sequences: [], solutionCount: 0, nodes, aborted };

  // 按首脉冲分组，组内按 (重频, 下标元组) 字典序排序
  const byFirst: Segment[][] = Array.from({ length: n }, () => []);
  for (const seg of segments) byFirst[seg.first].push(seg);
  for (const list of byFirst) {
    list.sort(
      (a, b) => a.prf - b.prf || compareIndexTuple(a.members, b.members),
    );
  }

  const fullMask = (1 << n) - 1;
  // 状态键：掩码 + 已用序列数 + 已计漏发
  const keyOf = (mask: number, k: number, m: number) =>
    mask * 4096 + k * 64 + m;
  const memo = new Map<number, number>();
  let stateCount = 0;

  function countWays(mask: number, k: number, m: number): number {
    if (aborted) return 0;

    const key = keyOf(mask, k, m);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (++stateCount > DP_STATE_LIMIT) {
      aborted = true;
      return 0;
    }

    let result = 0;
    if (k > targetPaths || m > targetMiss) {
      result = 0;
    } else {
      const free = fullMask ^ mask;
      const freeCount = popcount(free);
      if (freeCount === 0) {
        result = k === targetPaths && m === targetMiss ? 1 : 0;
      } else {
        const blocksLeft = targetPaths - k;
        // 每条剩余序列至少占两个脉冲
        if (blocksLeft > 0 && (blocksLeft << 1) <= freeCount) {
          const s = ctz(free);
          for (const seg of byFirst[s]) {
            if (seg.mask & mask) continue;
            const w = countWays(mask | seg.mask, k + 1, m + seg.miss);
            if (w > 0) {
              result += w;
              if (result >= 2) {
                result = 2;
                break;
              }
            }
          }
        }
      }
    }
    memo.set(key, result);
    return result;
  }

  const solutionCount = countWays(0, 0, 0);
  if (aborted) return { sequences: [], solutionCount: 0, nodes, aborted };

  // ---- 贪心重建规范解 ----
  const chosen: RawSequence[] = [];
  let mask = 0;
  let k = 0;
  let m = 0;
  while (mask !== fullMask) {
    const s = ctz(fullMask ^ mask);
    let picked: Segment | null = null;
    for (const seg of byFirst[s]) {
      if (seg.mask & mask) continue;
      const w = memo.get(keyOf(mask | seg.mask, k + 1, m + seg.miss));
      if (w !== undefined && w > 0) {
        picked = seg;
        break;
      }
    }
    if (picked === null) {
      aborted = true;
      break;
    }
    chosen.push({ prf: picked.prf, members: picked.members.slice() });
    mask |= picked.mask;
    k++;
    m += picked.miss;
  }

  return {
    sequences: chosen,
    solutionCount,
    nodes,
    aborted,
  };
}

function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function ctz(x: number): number {
  // 仅对非零值调用
  return 31 - Math.clz32(x & -x);
}

function buildSequence(times: number[], raw: RawSequence): SequenceResult {
  const missedTimes: number[] = [];
  for (let k = 1; k < raw.members.length; k++) {
    const a = raw.members[k - 1];
    const b = raw.members[k];
    const q = (times[b] - times[a]) / raw.prf;
    for (let s = 1; s < q; s++) {
      missedTimes.push(times[a] + s * raw.prf);
    }
  }
  return {
    prf: raw.prf,
    pulseIndexes: raw.members.slice(),
    missedTimes,
    missedCount: missedTimes.length,
  };
}

/**
 * 候选链计数：对每条重频 p，把脉冲按 times mod p 分入同余槽位 k=t/p
 * （余数 r 相同）；相邻槽位差不超过 maxMissed+1 的连续段构成一条候选链，
 * 链长至少 2 时，链内每个脉冲获得 1 个候选。
 */
export function computeCandidateCounts(
  times: number[],
  prfs: number[],
  maxMissed: number,
): number[] {
  const counts = new Array(times.length).fill(0);
  for (const p of prfs) {
    const groups = new Map<number, number[]>();
    for (let i = 0; i < times.length; i++) {
      const r = times[i] % p;
      const group = groups.get(r);
      if (group) group.push(i);
      else groups.set(r, [i]);
    }
    for (const group of groups.values()) {
      let runStart = 0;
      for (let k = 1; k <= group.length; k++) {
        const gapBroken =
          k === group.length ||
          (times[group[k]] - times[group[k - 1]]) / p > maxMissed + 1;
        if (gapBroken) {
          if (k - runStart >= 2) {
            for (let x = runStart; x < k; x++) counts[group[x]]++;
          }
          runStart = k;
        }
      }
    }
  }
  return counts;
}

function compareIndexTuple(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}
