/**
 * 一键导出抖音登录态（storage_state.json）。
 *
 * 用法（在项目根目录执行）：
 *   1) npm --prefix server install playwright
 *   2) npm --prefix server exec playwright install chromium
 *   3) node server/scripts/export-storage-state.mjs
 *
 * 流程：弹出有头 Chromium → 打开抖音聊天页 → 你手动扫码登录 → 脚本检测到登录成功后
 *       自动把登录态写入项目根 storage_state.json，然后自动关闭。
 *
 * ⚠️ 安全提醒：storage_state.json 等同于你的账号登录凭证，仅保存在本机、
 *    严禁提交到 Git 仓库或分享给任何人。已加入 .gitignore。
 */

import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_FILE = join(ROOT, 'storage_state.json');
const CHAT_URL = 'https://www.douyin.com/chat';
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟内完成扫码

async function isLoggedIn(context, page) {
  const url = page.url();
  if (url.includes('passport') || url.includes('login')) return false;
  // 可靠判定：Cookie 中出现抖音登录态凭证 sessionid / sessionid_ss
  try {
    const cookies = await context.cookies('https://www.douyin.com');
    return cookies.some((c) => c.name === 'sessionid' || c.name === 'sessionid_ss');
  } catch {
    return false;
  }
}

async function main() {
  console.log('正在启动浏览器（会弹出窗口，请勿关闭）...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' });

  console.log(`请在弹出的浏览器窗口中扫码登录抖音（限时 ${LOGIN_TIMEOUT_MS / 60000} 分钟）...`);
  console.log('判定依据：Cookie 中出现 sessionid（登录态凭证），比页面元素更可靠。');
  const start = Date.now();
  let ok = false;
  while (Date.now() - start < LOGIN_TIMEOUT_MS) {
    if (await isLoggedIn(context, page)) {
      ok = true;
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (!ok) {
    console.error('超时未检测到登录成功，未写入任何文件。请重新运行再试。');
    await browser.close();
    process.exit(1);
  }

  // 登录成功后停留几秒，让 Cookie/本地存储完全落定
  await page.waitForTimeout(4000);
  const state = await context.storageState();
  writeFileSync(OUT_FILE, JSON.stringify(state, null, 2), 'utf8');

  const size = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8').length : 0;
  console.log('------------------------------------------');
  console.log(`✅ 登录态已导出：${OUT_FILE}（${(size / 1024).toFixed(1)} KB）`);
  console.log('下一步：');
  console.log('  1. 打开仪表盘 http://localhost:5173 → 设置 → 凭证保险库');
  console.log('  2. 用记事本打开 storage_state.json，全选复制内容粘贴进去');
  console.log('  3. 设置一个强口令（≥8 位，务必牢记，丢失需重新导出）');
  console.log('  4. 把平台切到 douyin，先用 1 个好友 Dry Run 验证');
  console.log('⚠️  该文件等同账号凭证：不要提交 Git、不要发给别人；导入成功后建议删除。');
  console.log('------------------------------------------');
  await browser.close();
}

main().catch((e) => {
  console.error('导出失败：', e?.message ?? e);
  process.exit(1);
});
