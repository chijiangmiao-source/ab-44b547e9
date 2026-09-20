import { audit, type AuditInput, type AuditResult } from './solver';

// 审计在独立线程运行，期间输入、滚动、再次发起审计均不受阻塞。
export type AuditRequest = {
  id: number;
  input: AuditInput;
};

export type AuditResponse =
  | { id: number; ok: true; result: AuditResult }
  | { id: number; ok: false; error: string };

self.onmessage = (ev: MessageEvent<AuditRequest>) => {
  const { id, input } = ev.data;
  try {
    const result = audit(input);
    const response: AuditResponse = { id, ok: true, result };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: AuditResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
