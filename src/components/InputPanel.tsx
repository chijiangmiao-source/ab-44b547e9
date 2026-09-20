import { EXAMPLES } from '../solver/examples';
import { countTokens, type Draft } from '../solver/validate';

interface InputPanelProps {
  draft: Draft;
  errors: string[];
  running: boolean;
  onChange: (draft: Draft) => void;
  onRun: () => void;
  onCancel: () => void;
  onLoadExample: (key: string) => void;
  onSortTimes: () => void;
}

export function InputPanel({
  draft,
  errors,
  running,
  onChange,
  onRun,
  onCancel,
  onLoadExample,
  onSortTimes,
}: InputPanelProps) {
  const timeCount = countTokens(draft.timesText);
  const priCount = countTokens(draft.prisText);

  return (
    <section className="panel input-panel">
      <h2>审计输入</h2>

      <label className="field">
        <span className="field-label">
          脉冲时刻（微秒）
          <em>6–28 个严格递增的非负整数，空格或逗号分隔</em>
        </span>
        <textarea
          rows={5}
          value={draft.timesText}
          spellCheck={false}
          placeholder="例如：0 40 100 200 290 300 400 500 540"
          onChange={(e) => onChange({ ...draft, timesText: e.target.value })}
        />
        <span className={`field-hint ${timeCount < 6 || timeCount > 28 ? 'warn' : ''}`}>
          已识别 {timeCount} 个时刻
        </span>
      </label>

      <label className="field">
        <span className="field-label">
          候选重频（微秒）
          <em>1–6 个互异正整数</em>
        </span>
        <input
          type="text"
          value={draft.prisText}
          spellCheck={false}
          placeholder="例如：100 250"
          onChange={(e) => onChange({ ...draft, prisText: e.target.value })}
        />
        <span className={`field-hint ${priCount < 1 || priCount > 6 ? 'warn' : ''}`}>
          已识别 {priCount} 个重频
        </span>
      </label>

      <label className="field">
        <span className="field-label">
          漏发上限
          <em>相邻时差 ≤（漏发上限 + 1）× 重频</em>
        </span>
        <select
          value={draft.maxMissed}
          onChange={(e) => onChange({ ...draft, maxMissed: Number(e.target.value) })}
        >
          <option value={0}>0（不允许漏发）</option>
          <option value={1}>1（至多漏发 1 个）</option>
          <option value={2}>2（至多漏发 2 个）</option>
        </select>
      </label>

      <div className="btn-row">
        <button type="button" className="btn primary" onClick={onRun}>
          {running ? '重新发起审计' : '发起审计'}
        </button>
        {running && (
          <button type="button" className="btn" onClick={onCancel}>
            取消计算
          </button>
        )}
        <button type="button" className="btn" onClick={onSortTimes} title="将已识别的整数时刻按升序整理">
          整理时刻升序
        </button>
      </div>

      <div className="examples">
        <span className="examples-label">快速示例：</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.key}
            type="button"
            className="btn link"
            onClick={() => onLoadExample(ex.key)}
          >
            {ex.label}
          </button>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="errors" role="alert">
          <strong>输入不合法（草稿已保留，请修正后重新审计）：</strong>
          <ul>
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
