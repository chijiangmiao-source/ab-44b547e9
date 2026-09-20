import type { PulseSequence } from '../solver/types';

interface TimelineProps {
  times: number[];
  sequences: PulseSequence[];
}

/** 序列配色（漏发标记固定使用红色，不在此列）。 */
const PALETTE = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#be185d',
  '#65a30d',
  '#9333ea',
  '#0284c7',
  '#b45309',
  '#4f46e5',
  '#0d9488',
  '#c2410c',
  '#6d28d9',
];

const W = 960;
const PAD_L = 118;
const PAD_R = 24;
const TOP_H = 64;
const LANE_H = 72;
const BOTTOM_H = 16;

interface MissedMark {
  t: number;
  fromIdx: number;
}

/**
 * 时间轴视图：
 *  - 顶部总览行：全部脉冲按所属序列着色；
 *  - 每条序列一条泳道：脉冲圆点 + 连线，漏发位置以红色虚线圈标出。
 */
export function Timeline({ times, sequences }: TimelineProps) {
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const span = Math.max(1, t1 - t0);
  const x = (t: number) => PAD_L + ((t - t0) / span) * (W - PAD_L - PAD_R);

  const assign = new Array<number>(times.length).fill(-1);
  sequences.forEach((seq, s) => {
    for (const m of seq.members) assign[m] = s;
  });

  const H = TOP_H + sequences.length * LANE_H + BOTTOM_H;
  const overviewY = 40;

  // 总览行下标标签：避免重叠，仅当与上一个标签间距足够时绘制
  const labelEvery = Math.max(1, Math.ceil(times.length / 28));

  return (
    <div className="timeline">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="脉冲归属时间轴">
        {/* 时间轴 */}
        <line x1={PAD_L} y1={18} x2={W - PAD_R} y2={18} className="axis" />
        <text x={PAD_L} y={12} className="axis-label" textAnchor="start">
          {t0} µs
        </text>
        <text x={W - PAD_R} y={12} className="axis-label" textAnchor="end">
          {t1} µs
        </text>

        {/* 总览行 */}
        <text x={8} y={overviewY + 4} className="lane-label">
          总览
        </text>
        {times.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} y1={22} x2={x(t)} y2={30} className="tick" />
            <circle
              cx={x(t)}
              cy={overviewY}
              r={6}
              fill={assign[i] >= 0 ? PALETTE[assign[i] % PALETTE.length] : '#9ca3af'}
            >
              <title>{`脉冲 #${i} · t=${t} µs · ${assign[i] >= 0 ? `序列 ${assign[i] + 1}` : '未分配'}`}</title>
            </circle>
            {i % labelEvery === 0 && (
              <text x={x(t)} y={overviewY + 18} className="idx-label" textAnchor="middle">
                {i}
              </text>
            )}
          </g>
        ))}

        {/* 序列泳道 */}
        {sequences.map((seq, s) => {
          const y = TOP_H + s * LANE_H + LANE_H / 2;
          const color = PALETTE[s % PALETTE.length];
          const missed: MissedMark[] = [];
          for (let k = 1; k < seq.members.length; k++) {
            const a = seq.members[k - 1];
            const b = seq.members[k];
            const gap = times[b] - times[a];
            const mult = gap / seq.pri;
            for (let j = 1; j < mult; j++) {
              missed.push({ t: times[a] + seq.pri * j, fromIdx: a });
            }
          }
          const missedCount = missed.length;
          return (
            <g key={s}>
              <text x={8} y={y - 8} className="lane-label" fill={color}>
                {`序列 ${s + 1}`}
              </text>
              <text x={8} y={y + 8} className="lane-sub">
                {`重频 ${seq.pri} µs`}
              </text>
              <text x={8} y={y + 22} className="lane-sub">
                {missedCount > 0 ? `漏发 ${missedCount}` : '无漏发'}
              </text>

              {/* 连线 */}
              {seq.members.slice(1).map((m, k) => {
                const prev = seq.members[k];
                return (
                  <line
                    key={k}
                    x1={x(times[prev])}
                    y1={y}
                    x2={x(times[m])}
                    y2={y}
                    stroke={color}
                    strokeWidth={2}
                    opacity={0.55}
                  />
                );
              })}

              {/* 漏发位置 */}
              {missed.map((mk, j) => (
                <g key={`m${j}`}>
                  <circle
                    cx={x(mk.t)}
                    cy={y}
                    r={6}
                    fill="#fff"
                    stroke="#dc2626"
                    strokeWidth={1.6}
                    strokeDasharray="3 2"
                  >
                    <title>{`漏发位置 · 期望时刻 ${mk.t} µs（序列 ${s + 1}，重频 ${seq.pri} µs）`}</title>
                  </circle>
                  <text x={x(mk.t)} y={y - 10} className="missed-label" textAnchor="middle">
                    漏
                  </text>
                </g>
              ))}

              {/* 脉冲点 */}
              {seq.members.map((m) => (
                <g key={m}>
                  <circle cx={x(times[m])} cy={y} r={8} fill={color}>
                    <title>{`脉冲 #${m} · t=${times[m]} µs · 序列 ${s + 1}（重频 ${seq.pri} µs）`}</title>
                  </circle>
                  <text x={x(times[m])} y={y + 3} className="dot-idx" textAnchor="middle">
                    {m}
                  </text>
                  <text x={x(times[m])} y={y + 22} className="dot-time" textAnchor="middle">
                    {times[m]}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>

      <div className="legend">
        <span className="legend-item">
          <span className="legend-dot" /> 脉冲（颜色 = 所属序列）
        </span>
        <span className="legend-item">
          <span className="legend-missed" /> 漏发位置（期望时刻）
        </span>
      </div>
    </div>
  );
}
