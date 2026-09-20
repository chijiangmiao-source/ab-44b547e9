#!/usr/bin/env node
/**
 * 验收服务（Compose 中的 verify 服务入口）。
 *
 * 验收内容：
 *  1. 等待 web 服务健康检查端点 /healthz 就绪；
 *  2. 校验首页可访问且包含应用挂载点与标题、静态资源可加载；
 *  3. 运行求解器验收测试（vitest，覆盖最优性、多解判定、规范解、无解候选数等）。
 *
 * 全部通过时退出码为 0，否则非 0。
 */
import { spawn } from 'node:child_process';

const WEB_URL = (process.env.WEB_URL || 'http://web:80').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 90000);

const log = (...args) => console.log('[verify]', ...args);
const fail = (...args) => {
  console.error('[verify] ✗', ...args);
  process.exit(1);
};

async function waitHealthy() {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError = '未知错误';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${WEB_URL}/healthz`);
      if (res.ok) {
        const body = (await res.text()).trim();
        if (body === 'ok') {
          log(`✓ 健康检查通过：GET ${WEB_URL}/healthz -> ${res.status} "ok"`);
          return;
        }
        lastError = `响应内容异常：${JSON.stringify(body)}`;
      } else {
        lastError = `状态码 ${res.status}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  fail(`健康检查超时（${TIMEOUT_MS}ms）：${lastError}`);
}

async function checkPage() {
  const res = await fetch(`${WEB_URL}/`);
  if (!res.ok) fail(`首页不可访问：状态码 ${res.status}`);
  const html = await res.text();
  if (!html.includes('<div id="root">')) fail('首页缺少 #root 挂载点');
  if (!html.includes('雷达脉冲')) fail('首页标题不符合预期');
  log('✓ 首页内容与挂载点检查通过');

  const asset = html.match(/(?:src|href)="(\/assets\/[^"]+)"/);
  if (asset) {
    const r = await fetch(`${WEB_URL}${asset[1]}`);
    if (!r.ok) fail(`静态资源不可访问：${asset[1]} -> ${r.status}`);
    log(`✓ 静态资源检查通过：${asset[1]}`);
  }

  // 单页应用回退：任意路径应返回 index.html
  const spa = await fetch(`${WEB_URL}/some/deep/route`);
  if (!spa.ok) fail('SPA 回退失效：深层路径未返回页面');
  log('✓ SPA 路由回退检查通过');
}

function runTests() {
  log('运行求解器验收测试（vitest）…');
  return new Promise((resolve) => {
    const child = spawn('npx', ['vitest', 'run', '--reporter=dot'], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

log(`验收目标：${WEB_URL}`);
await waitHealthy();
await checkPage();
const testCode = await runTests();
if (testCode !== 0) fail(`求解器验收测试失败（退出码 ${testCode}）`);
log('✓ 全部验收通过');
process.exit(0);
