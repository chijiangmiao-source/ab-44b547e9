// 草稿输入解析与校验。非法时返回全部错误信息，调用方保留原始草稿。

export interface ParsedInput {
  times: number[];
  prfs: number[];
  maxMissed: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  parsed?: ParsedInput;
}

const MAX_SAFE_TIME = Number.MAX_SAFE_INTEGER;

export function validateInput(
  timesText: string,
  prfsText: string,
  maxMissedText: string,
): ValidationResult {
  const errors: string[] = [];

  const timeTokens = tokenize(timesText);
  const prfTokens = tokenize(prfsText);
  const maxMissedTokens = tokenize(maxMissedText);

  const times: number[] = [];
  timeTokens.forEach((tok, i) => {
    const value = Number(tok);
    if (!Number.isInteger(value) || value < 0 || value > MAX_SAFE_TIME) {
      errors.push(`脉冲时刻第 ${i + 1} 项「${tok}」不是非负整数微秒`);
      return;
    }
    times.push(value);
  });
  if (timeTokens.length > 0 && errors.length === 0) {
    for (let i = 1; i < times.length; i++) {
      if (times[i] <= times[i - 1]) {
        errors.push(
          `脉冲时刻必须严格递增：第 ${i} 项 ${times[i - 1]} 之后应为更大值`,
        );
        break;
      }
    }
  }
  if (timeTokens.length < 6) {
    errors.push(`脉冲时刻至少需要 6 个（当前 ${timeTokens.length} 个）`);
  }
  if (timeTokens.length > 28) {
    errors.push(`脉冲时刻至多 28 个（当前 ${timeTokens.length} 个）`);
  }

  const prfs: number[] = [];
  prfTokens.forEach((tok, i) => {
    const value = Number(tok);
    if (!Number.isInteger(value) || value <= 0 || value > MAX_SAFE_TIME) {
      errors.push(`候选重频第 ${i + 1} 项「${tok}」不是正整数`);
      return;
    }
    prfs.push(value);
  });
  if (prfs.length !== new Set(prfs).size) {
    errors.push('候选重频必须互异（不能重复）');
  }
  if (prfTokens.length < 1) errors.push('至少需要 1 个候选重频');
  if (prfTokens.length > 6) {
    errors.push(`候选重频至多 6 个（当前 ${prfTokens.length} 个）`);
  }

  let maxMissed = 0;
  if (maxMissedTokens.length !== 1) {
    errors.push('漏发上限必须是单个整数 0、1 或 2');
  } else {
    const value = Number(maxMissedTokens[0]);
    if (!Number.isInteger(value) || value < 0 || value > 2) {
      errors.push(`漏发上限「${maxMissedTokens[0]}」必须是 0、1 或 2`);
    } else {
      maxMissed = value;
    }
  }

  return errors.length === 0
    ? { ok: true, errors: [], parsed: { times, prfs, maxMissed } }
    : { ok: false, errors };
}

function tokenize(text: string): string[] {
  return text
    .split(/[\s,，;；、]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
