// 内置示例：方便复核员一键填入并核对可重算结果。
export interface Preset {
  name: string;
  description: string;
  times: string;
  prfs: string;
  maxMissed: string;
}

export const PRESETS: Preset[] = [
  {
    name: '双站规整',
    description: '两条无漏发序列交织，最近间隔贪心会串错',
    times: '0, 3, 10, 13, 20, 23, 30, 33',
    prfs: '10, 13',
    maxMissed: '0',
  },
  {
    name: '含漏发',
    description:
      '同一重频中间缺一拍：并为 1 条序列（1 个漏发）或拆为 2 条（0 漏发），两项目标给出不同分组',
    times: '0, 5, 10, 20, 25, 30',
    prfs: '5',
    maxMissed: '1',
  },
  {
    name: '无解样例',
    description: '存在孤立脉冲，无法被任一候选同余链覆盖',
    times: '0, 4, 8, 12, 17, 20, 24, 28',
    prfs: '4',
    maxMissed: '0',
  },
];
