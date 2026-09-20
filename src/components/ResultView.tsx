import type { AuditInput, AuditOutcome } from '../solver/types';
import { Timeline } from './Timeline';
import { NoSolutionView } from './NoSolutionView';

interface ResultViewProps {
  input: AuditInput;
  outcome: AuditOutcome;
  elapsedMs: number;
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ResultView({ input, outcome, elapsedMs }: ResultViewProps) {
  const exportData = {
    tool: 'radar-pulse-audit',
    input,
    outcome,
  };

  const copyResult = () => {
    void navigator.clipboard?.writeText(JSON.stringify(exportData, null, 2));
  };

  return (
    <div className="result">
      <div className="result-head">
        <h2>审计结果</h2>
        <span className="elapsed">耗时 {elapsedMs.toFixed(1)} ms · 可离线重算</span>
      </div>

      <div className="input-echo">
        <div>
          <strong>脉冲时刻（{input.times.length}）：</strong>
          <code>{input.times.join(' ')}</code>
        </div>
        <div>
          <strong>候选重频：</strong>
          <code>{input.pris.join(' ')}</code>
          <strong>　漏发上限：</strong>
          <code>{input.maxMissed}</code>
        </div>
      </div>

      {outcome.kind === 'no-solution' ? (
        <NoSolutionView times={input.times} candidates={outcome.candidates} />
      ) : (
        <>
          <div className="cards">
            <div className="card">
              <div className="card-value">{outcome.sequenceCount}</div>
              <div className="card-label">序列数（目标一 · 最小）</div>
            </div>
            <div className="card">
              <div className="card-value">{outcome.totalMissed}</div>
              <div className="card-label">漏发总数（目标二 · 最小）</div>
            </div>
            <div className={`card ${outcome.hasMultiple ? 'warn-card' : ''}`}>
              <div className="card-value">{outcome.hasMultiple ? '是' : '否'}</div>
              <div className="card-label">
                两项目标下是否存在不同分组
              </div>
            </div>
          </div>

          {outcome.hasMultiple && (
            <p className="note">
              存在多个同时达到两项目标最优的分组；下方展示规范解
              （各序列按首脉冲时刻、重频、脉冲下标排序后的整体字典序最小者）。
            </p>
          )}

          <h3>归属时间轴</h3>
          <Timeline times={input.times} sequences={outcome.sequences} />

          <h3>规范解明细</h3>
          <table className="seq-table">
            <thead>
              <tr>
                <th>序列</th>
                <th>重频 (µs)</th>
                <th>脉冲下标</th>
                <th>脉冲时刻 (µs)</th>
                <th>漏发数</th>
              </tr>
            </thead>
            <tbody>
              {outcome.sequences.map((seq, s) => {
                let missed = 0;
                for (let k = 1; k < seq.members.length; k++) {
                  missed +=
                    (input.times[seq.members[k]] - input.times[seq.members[k - 1]]) /
                      seq.pri -
                    1;
                }
                return (
                  <tr key={s}>
                    <td>序列 {s + 1}</td>
                    <td>{seq.pri}</td>
                    <td>
                      <code>{seq.members.join(' → ')}</code>
                    </td>
                    <td>
                      <code>{seq.members.map((m) => input.times[m]).join(' → ')}</code>
                    </td>
                    <td>{missed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => downloadJson(exportData, 'audit-result.json')}
        >
          导出结果 JSON
        </button>
        <button type="button" className="btn" onClick={copyResult}>
          复制结果到剪贴板
        </button>
      </div>
    </div>
  );
}
