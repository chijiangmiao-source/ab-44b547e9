import type { CandidateInfo } from '../solver/types';

interface NoSolutionViewProps {
  times: number[];
  candidates: CandidateInfo;
}

/**
 * 无解视图：明确告知不存在全覆盖分组，
 * 并列出每个脉冲可参与的候选连接数，帮助复核员定位问题脉冲。
 */
export function NoSolutionView({ times, candidates }: NoSolutionViewProps) {
  const maxCount = Math.max(1, ...candidates.total);
  const isolated = candidates.total
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c === 0)
    .map(({ i }) => i);

  return (
    <div className="no-solution">
      <div className="alert">
        <strong>没有全覆盖分组。</strong>
        <p>
          在当前候选重频与漏发上限下，不存在满足全部约束（每条序列至少两个脉冲、
          相邻时差为同一重频的整数倍且不超漏发限制、每个脉冲恰属一条序列）的分组方案。
        </p>
        {isolated.length > 0 && (
          <p>
            其中脉冲 {isolated.map((i) => `#${i}`).join('、')}{' '}
            没有任何可参与的候选连接，必然无法被覆盖。
          </p>
        )}
      </div>

      <h3>各脉冲可参与的候选数</h3>
      <p className="muted">
        候选连接 = 与该脉冲相差（1 … 漏发上限+1）× 某候选重频的其他脉冲（含出向与入向）。
      </p>
      <table className="cand-table">
        <thead>
          <tr>
            <th>下标</th>
            <th>时刻 (µs)</th>
            <th>出向候选</th>
            <th>入向候选</th>
            <th>候选总数</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {times.map((t, i) => (
            <tr key={i} className={candidates.total[i] === 0 ? 'zero' : ''}>
              <td>#{i}</td>
              <td>
                <code>{t}</code>
              </td>
              <td>{candidates.outgoing[i]}</td>
              <td>{candidates.incoming[i]}</td>
              <td>{candidates.total[i]}</td>
              <td className="bar-cell">
                <span
                  className={`bar ${candidates.total[i] === 0 ? 'bar-zero' : ''}`}
                  style={{ width: `${(candidates.total[i] / maxCount) * 100}%` }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
