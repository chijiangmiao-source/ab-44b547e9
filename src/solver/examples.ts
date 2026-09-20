import type { Draft } from './validate';

/** 预置示例，便于复核员快速体验各类情形。 */
export interface Example {
  key: string;
  label: string;
  draft: Draft;
}

export const EXAMPLES: Example[] = [
  {
    key: 'clean',
    label: '双雷达无漏发',
    draft: {
      timesText: '0 40 100 200 290 300 400 500 540',
      prisText: '100 250',
      maxMissed: 0,
    },
  },
  {
    key: 'missed',
    label: '含漏发脉冲',
    draft: {
      timesText: '0 60 200 210 300 360 500',
      prisText: '100 150',
      maxMissed: 2,
    },
  },
  {
    key: 'multi',
    label: '多解情形',
    draft: {
      timesText: '0 15 25 40 100 110',
      prisText: '10 25 40',
      maxMissed: 2,
    },
  },
  {
    key: 'nosol',
    label: '无解（孤立脉冲）',
    draft: {
      timesText: '0 10 20 30 40 77',
      prisText: '10',
      maxMissed: 0,
    },
  },
];
