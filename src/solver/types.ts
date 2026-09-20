/**
 * 审计领域类型定义。
 *
 * 业务背景：海岸监测站把多部雷达的脉冲时刻混入同一通道，
 * 审计目标是在离线环境下把混合时刻重新分组为可重算的发射序列。
 */

/** 一次审计的合法输入（已通过 validate.ts 校验）。 */
export interface AuditInput {
  /** 脉冲时刻（微秒）：6–28 个严格递增的非负整数。 */
  times: number[];
  /** 候选重频（微秒）：1–6 个互异正整数。 */
  pris: number[];
  /** 漏发上限：相邻时差 = (漏发数 + 1) × 重频，漏发数 ≤ maxMissed（0–2）。 */
  maxMissed: 0 | 1 | 2;
}

/** 一条发射序列：同一重频下、按时间升序的脉冲下标（至少 2 个）。 */
export interface PulseSequence {
  /** 该序列使用的重频（微秒）。 */
  pri: number;
  /** 脉冲下标（指向输入 times 的位置），严格递增，长度 ≥ 2。 */
  members: number[];
}

/** 每个脉冲可参与的候选连接统计（无解时向复核员展示）。 */
export interface CandidateInfo {
  /** 每个脉冲可参与的候选连接总数（作为前驱 + 作为后继）。 */
  total: number[];
  /** 每个脉冲作为前驱（指向更晚脉冲）的候选数。 */
  outgoing: number[];
  /** 每个脉冲作为后继（被更早脉冲指向）的候选数。 */
  incoming: number[];
}

/** 审计成功：存在全覆盖分组。 */
export interface SolvedOutcome {
  kind: 'solved';
  /** 目标一：最小序列数。 */
  sequenceCount: number;
  /** 目标二：最小漏发总数。 */
  totalMissed: number;
  /** 在两项目标均最优的前提下，是否存在不同的分组。 */
  hasMultiple: boolean;
  /** 规范解：各序列按（首脉冲时刻、重频、脉冲下标）排序后，整体字典序最小者。 */
  sequences: PulseSequence[];
  /** 每个脉冲可参与的候选连接数（供参考）。 */
  candidates: CandidateInfo;
}

/** 审计失败：不存在全覆盖分组。 */
export interface NoSolutionOutcome {
  kind: 'no-solution';
  /** 每个脉冲可参与的候选连接数。 */
  candidates: CandidateInfo;
}

export type AuditOutcome = SolvedOutcome | NoSolutionOutcome;
