import type { AuditInput } from './types';

/** 用户在页面上编辑的草稿（非法输入时原样保留，不清空）。 */
export interface Draft {
  /** 脉冲时刻文本：空白 / 逗号分隔的整数列表。 */
  timesText: string;
  /** 候选重频文本。 */
  prisText: string;
  /** 漏发上限（0、1、2）。 */
  maxMissed: number;
}

export type ParseResult =
  | { ok: true; input: AuditInput }
  | { ok: false; errors: string[] };

const TOKEN_SPLIT = /[\s,，、;；]+/;
const INTEGER_RE = /^[+-]?\d+$/;

/**
 * 解析整数列表文本。解析失败时向 errors 追加中文说明并返回 null。
 */
function parseIntegerList(text: string, label: string, errors: string[]): number[] | null {
  const tokens = text.split(TOKEN_SPLIT).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    errors.push(`${label}不能为空`);
    return null;
  }
  const values: number[] = [];
  let bad = false;
  tokens.forEach((tok, i) => {
    if (!INTEGER_RE.test(tok)) {
      errors.push(`${label}第 ${i + 1} 项“${tok}”不是整数`);
      bad = true;
      return;
    }
    const v = Number(tok);
    if (!Number.isSafeInteger(v)) {
      errors.push(`${label}第 ${i + 1} 项“${tok}”超出安全整数范围`);
      bad = true;
      return;
    }
    values.push(v);
  });
  return bad ? null : values;
}

/**
 * 校验并转换草稿为审计输入。
 * 规则：
 *  - 脉冲时刻：6–28 个、非负、严格递增的整数（微秒）；
 *  - 候选重频：1–6 个互异正整数（微秒）；
 *  - 漏发上限：0、1 或 2。
 * 所有问题一次性汇总返回，调用方保留草稿以便用户修正。
 */
export function parseDraft(draft: Draft): ParseResult {
  const errors: string[] = [];

  const times = parseIntegerList(draft.timesText, '脉冲时刻', errors);
  const pris = parseIntegerList(draft.prisText, '候选重频', errors);

  if (times) {
    if (times.length < 6 || times.length > 28) {
      errors.push(`脉冲时刻数量须为 6–28 个，当前为 ${times.length} 个`);
    }
    times.forEach((t, i) => {
      if (t < 0) errors.push(`第 ${i + 1} 个脉冲时刻 ${t} 为负数，须为非负整数`);
    });
    for (let i = 1; i < times.length; i++) {
      if (times[i] <= times[i - 1]) {
        errors.push(
          `脉冲时刻须严格递增：第 ${i} 项 ${times[i - 1]} 与第 ${i + 1} 项 ${times[i]} 不满足`,
        );
      }
    }
  }

  if (pris) {
    if (pris.length < 1 || pris.length > 6) {
      errors.push(`候选重频数量须为 1–6 个，当前为 ${pris.length} 个`);
    }
    pris.forEach((p, i) => {
      if (p <= 0) errors.push(`第 ${i + 1} 个候选重频 ${p} 须为正整数`);
    });
    const seen = new Set<number>();
    for (const p of pris) {
      if (seen.has(p)) {
        errors.push(`候选重频 ${p} 重复，须互不相同`);
        break;
      }
      seen.add(p);
    }
  }

  if (draft.maxMissed !== 0 && draft.maxMissed !== 1 && draft.maxMissed !== 2) {
    errors.push('漏发上限须为 0、1 或 2');
  }

  if (errors.length > 0 || times === null || pris === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: { times, pris, maxMissed: draft.maxMissed as 0 | 1 | 2 },
  };
}

/** 统计文本中已识别的整数项个数（用于输入框下方的即时提示，不做校验）。 */
export function countTokens(text: string): number {
  return text.split(TOKEN_SPLIT).filter((t) => t.length > 0).length;
}
