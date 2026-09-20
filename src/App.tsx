import { useMemo, useState } from 'react';
import Timeline from './components/Timeline';
import { PRESETS } from './lib/presets';
import { validateInput } from './lib/validation';
import { useAudit } from './lib/useAudit';
import type { AuditResult } from './lib/solver';

export default function App() {
  // 草稿永远保留：非法输入只提示、不清空
  const [timesText, setTimesText] = useState(PRESETS[0].times);
  const [prfsText, setPrfsText] = useState(PRESETS[0].prfs);
  const [maxMissedText, setMaxMissedText] = useState(PRESETS[0].maxMissed);
  const [errors, setErrors] = useState<string[]>([]);

  const { state, pendingId, runAudit } = useAudit();

  const liveValidation = useMemo(
    () => validateInput(timesText, prfsText, maxMissedText),
    [timesText, prfsText, maxMissedText],
  );

  function handleAudit() {
    const v = validateInput(timesText, prfsText, maxMissedText);
    if (!v.ok || !v.parsed) {
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    runAudit(v.parsed);
  }

  function loadPreset(idx: number) {
    const p = PRESETS[idx];
    setTimesText(p.times);
    setPrfsText(p.prfs);
    setMaxMissedText(p.maxMissed);
    setErrors([]);
  }

  const pending = pendingId !== null;
  const result = state.kind === 'done' ? state.result : null;
  // 结果是否对应当前草稿（编辑后旧结果仍显示，但标记为已过期）
  const resultStale =
    result !== null &&
    (result.times.join(',') !== tokenSnapshot(timesText) ||
      result.prfs.join(',') !== tokenSnapshot(prfsText) ||
      String(result.maxMissed) !== tokenSnapshot(maxMissedText));

  return (
    <div className="app">
      <header className="app-header">
        <h1>雷达脉冲序列审计台</h1>
        <p className="subtitle">
          纯前端离线重算 ｜ 先最小化序列数，再最小化漏发总数 ｜
          每个脉冲恰好归属一条序列
        </p>
      </header>

      <section className="panel">
        <h2>1. 编辑审计输入</h2>
        <div className="preset-row">
          {PRESETS.map((p, i) => (
            <button
              key={p.name}
              type="button"
              className="preset-btn"
              onClick={() => loadPreset(i)}
              title={p.description}
            >
              {p.name}
            </button>
          ))}
        </div>

        <label className="field">
          <span>
            脉冲时刻（微秒，6–28 个严格递增非负整数，逗号或空白分隔）
          </span>
          <textarea
            rows={2}
            value={timesText}
            onChange={(e) => setTimesText(e.target.value)}
            spellCheck={false}
            placeholder="例如：0, 3, 10, 13, 20, 23"
          />
        </label>

        <label className="field">
          <span>候选重频（1–6 个互异正整数）</span>
          <input
            value={prfsText}
            onChange={(e) => setPrfsText(e.target.value)}
            spellCheck={false}
            placeholder="例如：10, 13"
          />
        </label>

        <label className="field field-inline">
          <span>漏发上限（0–2）</span>
          <input
            className="small-input"
            value={maxMissedText}
            onChange={(e) => setMaxMissedText(e.target.value)}
            spellCheck={false}
          />
        </label>

        {errors.length > 0 && (
          <div className="error-box" role="alert">
            <strong>输入不合法，草稿已保留：</strong>
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="action-row">
          <button
            type="button"
            className="audit-btn"
            onClick={handleAudit}
            disabled={pending || !liveValidation.ok}
            title={liveValidation.ok ? '' : '请先修正输入'}
          >
            {pending ? '审计计算中…（页面仍可编辑）' : '发起审计'}
          </button>
          {pending && (
            <span className="hint">
              可继续修改输入或再次发起，过期结果不会覆盖新审计
            </span>
          )}
        </div>
      </section>

      {result && (
        <section className="panel">
          <h2>2. 审计结果</h2>
          {resultStale && (
            <div className="warn-box">
              以下结果来自上一次审计，输入草稿已被修改；再次发起审计后才会刷新。
            </div>
          )}

          {result.status === 'feasible' ? (
            <FeasibleView result={result} />
          ) : (
            <InfeasibleView result={result} />
          )}

          <details className="meta-details">
            <summary>计算元信息</summary>
            <ul>
              <li>搜索节点数：{result.stats.nodes.toLocaleString()}</li>
              <li>耗时：{result.stats.elapsedMs} ms</li>
              <li>
                审计输入快照：时刻 [{result.times.join(', ')}]，重频 [
                {result.prfs.join(', ')}]，漏发上限 {result.maxMissed}
              </li>
            </ul>
          </details>
        </section>
      )}

      {state.kind === 'failed' && (
        <section className="panel">
          <div className="error-box" role="alert">
            <strong>审计未能完成：</strong> {state.error}
          </div>
        </section>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'accent' | 'warn';
}) {
  return (
    <div className={`metric-card${tone ? ` metric-${tone}` : ''}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function FeasibleView({ result }: { result: AuditResult }) {
  return (
    <>
      <div className="verdict verdict-ok">
        ✓ 存在全覆盖分组：每个脉冲都已恰好归属一条合法序列
      </div>

      <div className="metric-row">
        <MetricCard label="序列数（首要目标，已最小）" value={result.sequenceCount} tone="accent" />
        <MetricCard label="漏发总数（次要目标，已最小）" value={result.missedTotal} tone="accent" />
        <MetricCard
          label="若只追求最少漏发所需序列数"
          value={result.globalMinMissedSequences ?? '—'}
        />
        <MetricCard label="该口径下漏发总数" value={result.globalMinMissed ?? '—'} />
      </div>

      <div className="note-box">
        {result.objectivesDiverge ? (
          <>
            <strong>两项目标存在不同分组：</strong>
            最小化序列数时最优为 {result.sequenceCount} 条序列 /{' '}
            {result.missedTotal} 个漏发；若改为只最小化漏发，可达到{' '}
            {result.globalMinMissed} 个漏发，但需要{' '}
            {result.globalMinMissedSequences} 条序列。上方展示按题设字典序
            规范化后的首要目标解。
          </>
        ) : (
          <>
            两项目标下最优分组一致：{result.sequenceCount} 条序列、
            {result.missedTotal} 个漏发同时让两个目标最优。
          </>
        )}
        {result.tieUnderCombined && (
          <div className="tie-note">
            此外，合并目标下存在多个并列最优的不同分组；当前展示的是规范解
            （各序列按首脉冲时刻、重频、脉冲下标排序后整体字典序最小者）。
          </div>
        )}
      </div>

      <h3 className="timeline-title">归属时间轴（实心圆＝实际脉冲，红圈＝漏发位置）</h3>
      <Timeline result={result} />

      <h3>序列明细</h3>
      <div className="seq-list">
        {result.sequences.map((seq, lane) => (
          <div className="seq-card" key={lane}>
            <div className="seq-head">
              序列 {lane + 1} ｜ 重频 {seq.prf} μs ｜ 脉冲{' '}
              {seq.pulseIndexes.length} 个 ｜ 漏发 {seq.missedCount} 个
            </div>
            <div className="seq-body">
              <div>
                <span className="seq-field-label">脉冲下标：</span>
                {seq.pulseIndexes.map((i) => i + 1).join(', ')}
              </div>
              <div>
                <span className="seq-field-label">脉冲时刻：</span>
                {seq.pulseIndexes.map((i) => result.times[i]).join(' → ')}
              </div>
              {seq.missedTimes.length > 0 && (
                <div className="seq-missed">
                  <span className="seq-field-label">漏发时刻：</span>
                  {seq.missedTimes.join(', ')} μs
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function InfeasibleView({ result }: { result: AuditResult }) {
  const isolated = result.candidateCounts
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c === 0);

  return (
    <>
      <div className="verdict verdict-bad">
    ✗ 没有全覆盖分组：不存在让每个脉冲都恰好属于一条合法序列的归类
      </div>
      <div className="note-box">
        候选重频与漏发上限下，至少有脉冲无法和任何其他脉冲同链（每条序列至少
        需两个脉冲，相邻时差须为同一重频的整数倍且不超漏发限制）。
      </div>

      <h3 className="timeline-title">
        各脉冲可参与的候选链数（红＝0 条，注定孤立；橙＝1 条；绿＝多条）
      </h3>
      <Timeline result={result} />

      <table className="candidate-table">
        <thead>
          <tr>
            <th>脉冲序号</th>
            <th>时刻（μs）</th>
            <th>可参与候选链数</th>
          </tr>
        </thead>
        <tbody>
          {result.times.map((t, i) => (
            <tr key={i} className={result.candidateCounts[i] === 0 ? 'row-zero' : ''}>
              <td>#{i + 1}</td>
              <td>{t}</td>
              <td>{result.candidateCounts[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {isolated.length > 0 && (
        <div className="note-box">
          其中 {isolated.length} 个脉冲候选数为 0：
          {isolated.map((x) => ` #${x.i + 1}(${result.times[x.i]}μs)`).join('，')}
          。它们与任何其他脉冲的时差都不是候选重频（在漏发上限内）的整数倍。
        </div>
      )}
    </>
  );
}

function tokenSnapshot(text: string): string {
  return text
    .split(/[\s,，;；、]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');
}
