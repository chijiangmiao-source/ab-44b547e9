import type { AuditResult } from '../lib/solver';

const COLORS = [
  '#2563eb',
  '#d97706',
  '#059669',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#9333ea',
  '#0d9488',
];

const MARGIN_LEFT = 70;
const MARGIN_RIGHT = 30;
const LANE_H = 76;
const TOP_PAD = 28;
const BOTTOM_PAD = 30;
const MIN_PLOT_W = 900;
const UNIT_W = 34; // 每个脉冲至少占的宽度

// 时间轴：有解时每条序列一条泳道，圆点为实际脉冲，空心红圈为漏发位置；
// 无解时单泳道按每脉冲候选数着色。
export default function Timeline({ result }: { result: AuditResult }) {
  const allTimes =
    result.status === 'feasible'
      ? [
          ...result.times,
          ...result.sequences.flatMap((s) => s.missedTimes),
        ]
      : result.times;
  const tMin = Math.min(...allTimes);
  const tMax = Math.max(...allTimes);
  const span = Math.max(1, tMax - tMin);

  const lanes =
    result.status === 'feasible' ? result.sequences.length : 1;
  const countBasis = Math.max(result.times.length, 1);
  const plotW = Math.max(MIN_PLOT_W, countBasis * UNIT_W);
  const height = TOP_PAD + lanes * LANE_H + BOTTOM_PAD;

  const x = (t: number) =>
    MARGIN_LEFT + ((t - tMin) / span) * (plotW - MARGIN_LEFT - MARGIN_RIGHT);
  const y = (lane: number) => TOP_PAD + lane * LANE_H + LANE_H / 2;

  return (
    <div className="timeline-scroll">
      <svg
        viewBox={`0 0 ${plotW} ${height}`}
        width={plotW}
        height={height}
        role="img"
        aria-label="脉冲归属时间轴"
      >
        {/* 时间刻度 */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const tx = MARGIN_LEFT + f * (plotW - MARGIN_LEFT - MARGIN_RIGHT);
          const tv = Math.round(tMin + f * span);
          return (
            <g key={f}>
              <line
                x1={tx}
                x2={tx}
                y1={TOP_PAD - 8}
                y2={height - BOTTOM_PAD + 6}
                stroke="#e5e7eb"
              />
              <text x={tx} y={height - 8} textAnchor="middle" className="tick">
                {tv} μs
              </text>
            </g>
          );
        })}

        {result.status === 'feasible' ? (
          result.sequences.map((seq, lane) => {
            const color = COLORS[lane % COLORS.length];
            const cy = y(lane);
            return (
              <g key={lane}>
                <text x={8} y={cy + 4} className="lane-label">
                  序列 {lane + 1}
                  <tspan x={8} dy={15} fill={color}>
                    PRF {seq.prf}
                  </tspan>
                </text>
                <line
                  x1={MARGIN_LEFT}
                  x2={plotW - MARGIN_RIGHT}
                  y1={cy}
                  y2={cy}
                  stroke="#f3f4f6"
                  strokeWidth={2}
                />
                {/* 实际脉冲连线 */}
                <polyline
                  points={seq.pulseIndexes
                    .map((idx) => `${x(result.times[idx])},${cy}`)
                    .join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                />
                {/* 漏发位置 */}
                {seq.missedTimes.map((mt, k) => (
                  <g key={`m-${k}`}>
                    <line
                      x1={x(mt)}
                      x2={x(mt)}
                      y1={cy - 12}
                      y2={cy + 12}
                      stroke="#dc2626"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                    />
                    <circle
                      cx={x(mt)}
                      cy={cy}
                      r={5.5}
                      fill="#fff"
                      stroke="#dc2626"
                      strokeWidth={2}
                    >
                      <title>漏发位置：{mt} μs（重频 {seq.prf}）</title>
                    </circle>
                    <text
                      x={x(mt)}
                      y={cy - 16}
                      textAnchor="middle"
                      className="miss-label"
                    >
                      漏 {mt}
                    </text>
                  </g>
                ))}
                {/* 实际脉冲 */}
                {seq.pulseIndexes.map((idx, k) => {
                  const t = result.times[idx];
                  const above = k % 2 === 0;
                  return (
                    <g key={`p-${idx}`}>
                      <circle cx={x(t)} cy={cy} r={6} fill={color}>
                        <title>
                          脉冲 #{idx + 1}：{t} μs ｜ 序列 {lane + 1}（重频{' '}
                          {seq.prf}）
                        </title>
                      </circle>
                      <text
                        x={x(t)}
                        y={above ? cy - 14 : cy + 22}
                        textAnchor="middle"
                        className="pulse-label"
                      >
                        {t}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })
        ) : (
          <g>
            <text x={8} y={y(0) + 4} className="lane-label">
              脉冲
            </text>
            <line
              x1={MARGIN_LEFT}
              x2={plotW - MARGIN_RIGHT}
              y1={y(0)}
              y2={y(0)}
              stroke="#f3f4f6"
              strokeWidth={2}
            />
            {result.times.map((t, idx) => {
              const c = result.candidateCounts[idx];
              const fill = c === 0 ? '#dc2626' : c === 1 ? '#d97706' : '#059669';
              return (
                <g key={idx}>
                  <circle cx={x(t)} cy={y(0)} r={7} fill={fill}>
                    <title>
                      脉冲 #{idx + 1}：{t} μs ｜ 可参与候选链 {c} 条
                    </title>
                  </circle>
                  <text
                    x={x(t)}
                    y={y(0) - 14}
                    textAnchor="middle"
                    className="pulse-label"
                  >
                    {t}
                  </text>
                  <text
                    x={x(t)}
                    y={y(0) + 24}
                    textAnchor="middle"
                    className="cand-label"
                    fill={fill}
                  >
                    {c} 候选
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
