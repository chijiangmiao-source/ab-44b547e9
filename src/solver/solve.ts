import type {
  AuditInput,
  AuditOutcome,
  CandidateInfo,
  PulseSequence,
} from './types';

/**
 * 求解模型
 * ----------
 * 把每个脉冲看作有向无环图（DAG）中的顶点，下标小的时刻更早。
 * 若 t[j] - t[i] = k × pri（1 ≤ k ≤ 漏发上限 + 1），则存在候选边 i → j，
 * 边带有重频标签 pri 与漏发代价 k - 1。
 *
 * 一个合法分组 = 一组顶点不相交的有向路径，满足：
 *  1. 每条路径内所有边使用同一重频（同一序列的相邻时差是同一重频的整数倍）；
 *  2. 每个顶点至少关联一条边（等价于每条序列至少含两个脉冲）；
 *  3. 全体顶点被恰好覆盖一次。
 *
 * 序列数 = n − 边数，漏发总数 = 边代价之和。
 * 目标：先最大化边数（= 最小化序列数），再最小化代价（= 最小化漏发总数）。
 *
 * 实现：按顶点下标顺序做分支限界深度搜索。
 *  - 处理到顶点 i 时，其入边已确定；若 i 没有入边，则它必须作为新序列的起点
 *    选择一条出边，否则成为孤立脉冲（非法）；
 *  - 若 i 已有重频为 q 的入边，则其出边必须沿用 q（同序列同重频），或结束序列。
 * 剪枝：
 *  - 边上界：剩余可连边数 ≤ min(未决定顶点数, 空闲入槽数)，且总边数 ≤ n − 1；
 *  - 代价下界：已产生代价超过当前最优即剪；
 *  - 前向检查：入边已无望的顶点必须还有可用出边，且数量不超过空闲入槽数。
 */

interface Edge {
  /** 后继顶点（在搜索顶点集中的局部下标）。 */
  to: number;
  /** 重频标签。 */
  pri: number;
  /** 漏发代价 k - 1。 */
  cost: number;
}

/**
 * 构建候选边。vertices 给出参与搜索的原始下标（升序）；缺省为全部顶点。
 * 返回每个（局部）顶点的出边列表（按代价、终点、重频升序）及每个顶点的最大前驱下标。
 */
function buildEdges(
  times: number[],
  pris: number[],
  maxMissed: number,
  vertices?: number[],
): { out: Edge[][]; maxPred: number[] } {
  const idx = vertices ?? times.map((_, i) => i);
  const m = idx.length;
  const kMax = maxMissed + 1;
  const out: Edge[][] = Array.from({ length: m }, () => []);
  for (let a = 0; a < m; a++) {
    for (let b = a + 1; b < m; b++) {
      const d = times[idx[b]] - times[idx[a]];
      for (const p of pris) {
        if (d >= p && d % p === 0) {
          const k = d / p;
          if (k <= kMax) out[a].push({ to: b, pri: p, cost: k - 1 });
        }
      }
    }
  }
  for (const list of out) {
    list.sort((x, y) => x.cost - y.cost || x.to - y.to || x.pri - y.pri);
  }
  const maxPred = new Array<number>(m).fill(-1);
  for (let a = 0; a < m; a++) {
    for (const e of out[a]) maxPred[e.to] = a; // a 升序，最后写入即最大前驱
  }
  return { out, maxPred };
}

/** 在一组顶点上执行分支限界搜索的上下文。 */
class CoverSearch {
  private readonly m: number;
  private readonly out: Edge[][];
  private readonly maxPred: number[];
  private readonly inFrom: Int32Array;
  private readonly inPri: Int32Array;
  private inAssigned = 0;

  constructor(
    times: number[],
    pris: number[],
    maxMissed: number,
    vertices?: number[],
  ) {
    const { out, maxPred } = buildEdges(times, pris, maxMissed, vertices);
    this.m = out.length;
    this.out = out;
    this.maxPred = maxPred;
    this.inFrom = new Int32Array(this.m).fill(-1);
    this.inPri = new Int32Array(this.m).fill(-1);
  }

  /** 存在既无入边也无出边的顶点时，必然无法全覆盖。 */
  private hasIsolated(): boolean {
    for (let i = 0; i < this.m; i++) {
      if (this.out[i].length === 0 && this.maxPred[i] === -1) return true;
    }
    return false;
  }

  /**
   * 前向检查：站在顶点 i 处，所有最大前驱 < i 且尚未获得入边的顶点 j
   * 已不可能再获得入边，必须还有指向空闲入槽的出边；
   * 这类顶点的数量也不能超过剩余空闲入槽数。
   */
  private viable(i: number): boolean {
    let need = 0;
    for (let j = i; j < this.m; j++) {
      if (this.inFrom[j] === -1 && this.maxPred[j] < i) {
        let ok = false;
        for (const e of this.out[j]) {
          if (this.inFrom[e.to] === -1) {
            ok = true;
            break;
          }
        }
        if (!ok) return false;
        need++;
      }
    }
    return need <= this.m - this.inAssigned;
  }

  /** 从顶点 i 起还能增加的边数上界（含已选 e 条）。 */
  private upperBound(i: number, e: number): number {
    // 仍可被填充的入槽：尚未获得入边、且最大前驱尚未越过（仍可能获得入边）的顶点
    let fillable = 0;
    for (let j = i; j < this.m; j++) {
      if (this.inFrom[j] === -1 && this.maxPred[j] >= i) fillable++;
    }
    const ub = e + Math.min(this.m - i, fillable);
    // DAG 上的匹配至多 m - 1 条边（每个顶点都有出边会形成环）。
    return Math.min(ub, this.m - 1);
  }

  private take(i: number, e: Edge): void {
    this.inFrom[e.to] = i;
    this.inPri[e.to] = e.pri;
    this.inAssigned++;
  }

  private untake(_i: number, e: Edge): void {
    this.inFrom[e.to] = -1;
    this.inPri[e.to] = -1;
    this.inAssigned--;
  }

  /**
   * 通用分支限界遍历。
   *  - shouldCut(i, e, c)：返回 true 时剪去当前分支；
   *  - onLeaf(e, c)：到达一个完整分组时调用，返回 true 表示提前终止整个遍历。
   * 分支顺序：优先尝试延续当前序列（更快收敛到高边数解，使上界剪枝尽早生效），
   * 其次才结束序列；新序列起点的出边按（代价、终点、重频）升序尝试。
   */
  private walk(
    shouldCut: (i: number, e: number, c: number) => boolean,
    onLeaf: (e: number, c: number) => boolean,
  ): void {
    const dfs = (i: number, e: number, c: number): boolean => {
      if (i === this.m) return onLeaf(e, c);
      if (shouldCut(i, e, c)) return false;
      if (!this.viable(i)) return false;
      if (this.inFrom[i] === -1) {
        // i 必须作为新序列起点，选择一条出边
        for (const ed of this.out[i]) {
          if (this.inFrom[ed.to] !== -1) continue;
          this.take(i, ed);
          const stop = dfs(i + 1, e + 1, c + ed.cost);
          this.untake(i, ed);
          if (stop) return true;
        }
        return false;
      }
      // 优先以同一重频延续当前序列
      const q = this.inPri[i];
      for (const ed of this.out[i]) {
        if (ed.pri !== q || this.inFrom[ed.to] !== -1) continue;
        this.take(i, ed);
        const stop = dfs(i + 1, e + 1, c + ed.cost);
        this.untake(i, ed);
        if (stop) return true;
      }
      // 再考虑结束当前序列（长度 ≥ 2 已由入边保证）
      return dfs(i + 1, e, c);
    };
    dfs(0, 0, 0);
  }

  /**
   * 第一目标最大化边数，第二目标最小化代价。
   * 返回最优 (E, C)；不存在全覆盖分组时返回 null。
   */
  optimize(): { E: number; C: number } | null {
    if (this.m === 0) return { E: 0, C: 0 };
    if (this.hasIsolated()) return null;
    let bestE = -1;
    let bestC = Number.POSITIVE_INFINITY;
    this.walk(
      (i, e, c) => {
        const ub = this.upperBound(i, e);
        return ub < bestE || (ub === bestE && c >= bestC);
      },
      (e, c) => {
        if (e > bestE || (e === bestE && c < bestC)) {
          bestE = e;
          bestC = c;
        }
        return false;
      },
    );
    return bestE < 0 ? null : { E: bestE, C: bestC };
  }

  /**
   * 统计达到 (E, C) 的不同分组数，达到 cap 即停止（用于判断是否多解）。
   */
  countOptimal(E: number, C: number, cap: number): number {
    if (this.m === 0) return E === 0 && C === 0 ? 1 : 0;
    if (this.hasIsolated()) return 0;
    let count = 0;
    this.walk(
      (i, e, c) => e > E || c > C || this.upperBound(i, e) < E,
      (e, c) => {
        if (e === E && c === C) count++;
        return count >= cap;
      },
    );
    return count;
  }

  /**
   * 判定是否至少存在一个恰好达到 (E, C) 的全覆盖分组（规范解构造的可行性预言机）。
   */
  existsExact(E: number, C: number): boolean {
    if (this.m === 0) return E === 0 && C === 0;
    if (this.hasIsolated()) return false;
    let found = false;
    this.walk(
      (i, e, c) => e > E || c > C || this.upperBound(i, e) < E,
      (e, c) => {
        if (e === E && c === C) found = true;
        return found;
      },
    );
    return found;
  }
}

/** 统计每个脉冲可参与的候选连接数（出向 + 入向）。 */
export function candidateInfo(
  times: number[],
  pris: number[],
  maxMissed: number,
): CandidateInfo {
  const { out } = buildEdges(times, pris, maxMissed);
  const n = times.length;
  const outgoing = new Array<number>(n).fill(0);
  const incoming = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    outgoing[i] = out[i].length;
    for (const e of out[i]) incoming[e.to]++;
  }
  return {
    total: outgoing.map((v, i) => v + incoming[i]),
    outgoing,
    incoming,
  };
}

/**
 * 审计入口。
 *  1. 先最小化序列数（= 最大化边数），再最小化漏发总数（= 最小化边代价）；
 *  2. 统计两项目标均最优的不同分组数，判断是否多解；
 *  3. 构造规范解（各序列按首脉冲时刻、重频、脉冲下标排序后的整体字典序最小者）；
 *  4. 无解时返回各脉冲可参与的候选数，供复核员定位问题脉冲。
 */
export function audit(input: AuditInput): AuditOutcome {
  const { times, pris, maxMissed } = input;
  const candidates = candidateInfo(times, pris, maxMissed);

  const search = new CoverSearch(times, pris, maxMissed);
  const opt = search.optimize();
  if (!opt) {
    return { kind: 'no-solution', candidates };
  }

  const { E, C } = opt;
  const n = times.length;
  const hasMultiple = search.countOptimal(E, C, 2) >= 2;
  const sequences = canonicalSolution(times, pris, maxMissed, E, C);

  return {
    kind: 'solved',
    sequenceCount: n - E,
    totalMissed: C,
    hasMultiple,
    sequences,
    candidates,
  };
}

/** 一条序列的漏发总数：Σ（相邻时差 / 重频 − 1）。 */
function sequenceMissed(times: number[], seq: PulseSequence): number {
  let s = 0;
  for (let t = 1; t < seq.members.length; t++) {
    s += (times[seq.members[t]] - times[seq.members[t - 1]]) / seq.pri - 1;
  }
  return s;
}

/**
 * 构造规范解：在所有达到 (E, C) 的分组中，
 * 将各序列按（首脉冲时刻、重频、脉冲下标）排序后，取整体字典序最小者。
 *
 * 由于各序列首脉冲时刻互不相同，排序后的序列顺序即按首顶点下标升序。
 * 因此可以逐段贪心：每次取尚未覆盖的最小下标顶点 i，
 * 按（重频升序、成员下标字典序）枚举从 i 出发的候选序列，
 * 第一个仍能与剩余脉冲组成最优解的候选即规范解中的下一段。
 */
function canonicalSolution(
  times: number[],
  pris: number[],
  maxMissed: number,
  E: number,
  C: number,
): PulseSequence[] {
  const n = times.length;
  const { out } = buildEdges(times, pris, maxMissed);
  const covered = new Array<boolean>(n).fill(false);
  const priList = [...new Set(pris)].sort((a, b) => a - b);
  const sequences: PulseSequence[] = [];
  let eUsed = 0;
  let cUsed = 0;

  /** 候选序列 chain（重频 p）提交后，剩余脉冲是否仍能凑齐最优目标。 */
  const feasibleWith = (chain: number[], p: number): boolean => {
    const inChain = new Set(chain);
    const rest: number[] = [];
    for (let v = 0; v < n; v++) {
      if (!covered[v] && !inChain.has(v)) rest.push(v);
    }
    let chainCost = 0;
    for (let t = 1; t < chain.length; t++) {
      chainCost += (times[chain[t]] - times[chain[t - 1]]) / p - 1;
    }
    const restE = E - eUsed - (chain.length - 1);
    const restC = C - cUsed - chainCost;
    if (restE < 0 || restC < 0) return false;
    const sub = new CoverSearch(times, pris, maxMissed, rest);
    return sub.existsExact(restE, restC);
  };

  /** 从 chain（重频 p）出发按成员字典序枚举：先“到此为止”，再按下标升序延长。 */
  const extend = (chain: number[], p: number): number[] | null => {
    if (chain.length >= 2 && feasibleWith(chain, p)) return [...chain];
    const last = chain[chain.length - 1];
    // 同一重频下，出边按代价升序即按终点下标升序（d = k·p 单调）
    for (const ed of out[last]) {
      if (ed.pri !== p || covered[ed.to]) continue;
      const r = extend([...chain, ed.to], p);
      if (r) return r;
    }
    return null;
  };

  for (;;) {
    let start = -1;
    for (let i = 0; i < n; i++) {
      if (!covered[i]) {
        start = i;
        break;
      }
    }
    if (start === -1) break;
    let chosen: PulseSequence | null = null;
    for (const p of priList) {
      const chain = extend([start], p);
      if (chain) {
        chosen = { pri: p, members: chain };
        break;
      }
    }
    if (!chosen) {
      // 理论上不可达：optimize 已保证存在最优解
      throw new Error('规范解构造失败：剩余脉冲无法组成最优分组');
    }
    sequences.push(chosen);
    eUsed += chosen.members.length - 1;
    cUsed += sequenceMissed(times, chosen);
    for (const v of chosen.members) covered[v] = true;
  }
  return sequences;
}
