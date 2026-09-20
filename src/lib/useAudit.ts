import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuditInput, AuditResult } from './solver';
import type { AuditResponse } from './auditWorker';

// 全应用共享一个 Worker；每条审计带递增 id，过期响应直接丢弃，
// 因此“新审计不会被旧结果覆盖”。
let workerSingleton: Worker | null = null;

function getWorker(): Worker | null {
  if (workerSingleton !== null) return workerSingleton;
  try {
    workerSingleton = new Worker(
      new URL('./auditWorker.ts', import.meta.url),
      { type: 'module' },
    );
    return workerSingleton;
  } catch {
    return null;
  }
}

export type AuditState =
  | { kind: 'idle' }
  | {
      kind: 'done';
      runId: number;
      startedAt: number;
      finishedAt: number;
      result: AuditResult;
    }
  | { kind: 'failed'; runId: number; error: string };

export function useAudit() {
  const [state, setState] = useState<AuditState>({ kind: 'idle' });
  const [pendingId, setPendingId] = useState<number | null>(null);
  const runIdRef = useRef(0);
  const stateRef = useRef<AuditState>({ kind: 'idle' });
  stateRef.current = state;

  useEffect(() => {
    const worker = getWorker();
    if (!worker) return;
    const onMessage = (ev: MessageEvent<AuditResponse>) => {
      const msg = ev.data;
      // 过期或未知的运行结果一律忽略
      if (msg.id !== runIdRef.current) return;
      setPendingId(null);
      if (msg.ok) {
        setState({
          kind: 'done',
          runId: msg.id,
          startedAt: 0,
          finishedAt: Date.now(),
          result: msg.result,
        });
      } else {
        setState({ kind: 'failed', runId: msg.id, error: msg.error });
      }
    };
    worker.addEventListener('message', onMessage);
    return () => worker.removeEventListener('message', onMessage);
  }, []);

  const runAudit = useCallback((input: AuditInput) => {
    const id = ++runIdRef.current;
    const startedAt = Date.now();
    setPendingId(id);
    const worker = getWorker();
    if (worker) {
      worker.postMessage({ id, input });
    } else {
      // 极端环境下 Worker 不可用时退回主线程异步执行
      setTimeout(() => {
        if (id !== runIdRef.current) return;
        import('./solver').then(({ audit }) => {
          if (id !== runIdRef.current) return;
          try {
            const result = audit(input);
            setPendingId(null);
            setState({
              kind: 'done',
              runId: id,
              startedAt,
              finishedAt: Date.now(),
              result,
            });
          } catch (err) {
            setPendingId(null);
            setState({
              kind: 'failed',
              runId: id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });
      }, 0);
    }
  }, []);

  return { state, pendingId, runAudit };
}
