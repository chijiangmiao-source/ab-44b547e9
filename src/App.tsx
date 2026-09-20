import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuditInput, AuditOutcome } from './solver/types';
import { parseDraft, type Draft } from './solver/validate';
import { EXAMPLES } from './solver/examples';
import type { AuditResponse } from './worker/auditWorker';
import { InputPanel } from './components/InputPanel';
import { ResultView } from './components/ResultView';

type AuditStatus =
  | { status: 'idle' }
  | { status: 'running'; id: number; startedAt: number }
  | {
      status: 'done';
      id: number;
      input: AuditInput;
      outcome: AuditOutcome;
      elapsedMs: number;
    }
  | { status: 'error'; message: string };

const INITIAL_DRAFT: Draft = {
  timesText: EXAMPLES[0].draft.timesText,
  prisText: EXAMPLES[0].draft.prisText,
  maxMissed: EXAMPLES[0].draft.maxMissed,
};

export default function App() {
  // 草稿始终保留在本地状态中，非法输入不会被清空
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [errors, setErrors] = useState<string[]>([]);
  const [auditState, setAuditState] = useState<AuditStatus>({ status: 'idle' });

  // 单调递增的请求号：只有最新一次审计的结果允许写回页面
  const requestRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => stopWorker, [stopWorker]);

  const runAudit = useCallback(() => {
    const parsed = parseDraft(draft);
    if (!parsed.ok) {
      // 非法输入：仅提示问题，草稿原样保留
      setErrors(parsed.errors);
      return;
    }
    setErrors([]);

    // 发起新审计：终止旧计算，旧结果不得覆盖新审计
    stopWorker();
    const id = ++requestRef.current;
    const worker = new Worker(new URL('./worker/auditWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    const startedAt = performance.now();
    setAuditState({ status: 'running', id, startedAt });

    worker.onmessage = (ev: MessageEvent<AuditResponse>) => {
      const { id: rid, outcome } = ev.data;
      if (rid !== requestRef.current) return; // 过期结果，丢弃
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      setAuditState({
        status: 'done',
        id: rid,
        input: parsed.input,
        outcome,
        elapsedMs: performance.now() - startedAt,
      });
    };
    worker.onerror = (ev) => {
      if (id !== requestRef.current) return;
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      setAuditState({ status: 'error', message: ev.message || '计算过程发生未知错误' });
    };
    worker.postMessage({ id, input: parsed.input } );
  }, [draft, stopWorker]);

  const cancelAudit = useCallback(() => {
    // 取消当前计算；作废旧请求号，结果到达也会被丢弃
    requestRef.current++;
    stopWorker();
    setAuditState({ status: 'idle' });
  }, [stopWorker]);

  const loadExample = useCallback((key: string) => {
    const ex = EXAMPLES.find((e) => e.key === key);
    if (!ex) return;
    setDraft({ ...ex.draft });
    setErrors([]);
  }, []);

  const sortTimes = useCallback(() => {
    const tokens = draft.timesText
      .split(/[\s,，、;；]+/)
      .filter((t) => t.length > 0 && /^[+-]?\d+$/.test(t))
      .map(Number)
      .filter((v) => Number.isSafeInteger(v));
    if (tokens.length === 0) return;
    tokens.sort((a, b) => a - b);
    setDraft((d) => ({ ...d, timesText: tokens.join(' ') }));
  }, [draft.timesText]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>雷达脉冲序列审计</h1>
        <p className="subtitle">
          海岸监测站 · 多部雷达脉冲混入同一通道 · 离线可重算的发射序列恢复（纯前端计算，不依赖任何后端或在线服务）
        </p>
      </header>

      <main className="layout">
        <InputPanel
          draft={draft}
          errors={errors}
          running={auditState.status === 'running'}
          onChange={setDraft}
          onRun={runAudit}
          onCancel={cancelAudit}
          onLoadExample={loadExample}
          onSortTimes={sortTimes}
        />

        <section className="panel result-panel">
          {auditState.status === 'idle' && (
            <div className="placeholder">
              <p>编辑左侧脉冲时刻与候选重频，点击「发起审计」。</p>
              <p className="muted">
                审计目标：先最小化序列数，再最小化漏发总数；同时判断两项目标下是否存在不同分组，并给出规范解。
              </p>
            </div>
          )}

          {auditState.status === 'running' && (
            <div className="placeholder running">
              <div className="spinner" aria-hidden="true" />
              <p>正在计算最优分组…</p>
              <p className="muted">
                计算在后台线程进行，页面仍可操作；再次发起审计将自动放弃本次计算。
              </p>
              <button type="button" className="btn" onClick={cancelAudit}>
                取消本次计算
              </button>
            </div>
          )}

          {auditState.status === 'error' && (
            <div className="placeholder error">
              <p>计算失败：{auditState.message}</p>
            </div>
          )}

          {auditState.status === 'done' && (
            <ResultView
              input={auditState.input}
              outcome={auditState.outcome}
              elapsedMs={auditState.elapsedMs}
            />
          )}
        </section>
      </main>

      <footer className="app-footer">
        <span>离线审计工具 · 全部计算在本机完成 · 结果可导出 JSON 复核</span>
      </footer>
    </div>
  );
}
