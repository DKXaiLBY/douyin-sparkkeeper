/**
 * 抖音聊天页结构诊断（排障用）：打开 douyin.com/chat，把真实 DOM 结构 dump 出来，
 * 用于校准 DouyinWebAdapter 的选择器（输入框 / 发送按钮 / 会话项）。
 *
 * 用法（项目根目录执行）：
 *   node server/scripts/diagnose-page.mjs
 *
 * 产出：
 *   1) 终端打印关键信息（URL / iframe / 输入框候选 / 按钮候选 / 会话项候选）
 *   2) 完整结果写入 data/page-diagnose.txt
 *   3) 整页截图 data/page-diagnose.png
 *
 * ⚠️ 需要本机已安装 chromium 且存在项目根 storage_state.json（有效登录态）。
 *    这些文件仅供本机排障，切勿提交仓库。
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE_FILE = join(ROOT, 'storage_state.json');
const OUT_DIR = join(ROOT, 'server', 'data');
const TXT_OUT = join(OUT_DIR, 'page-diagnose.txt');
const PNG_OUT = join(OUT_DIR, 'page-diagnose.png');
const CHAT_URL = 'https://www.douyin.com/chat';

if (!existsSync(STATE_FILE)) {
  console.error(`未找到登录态文件：${STATE_FILE}\n请先运行导出脚本：node server/scripts/export-storage-state.mjs`);
  process.exit(1);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const lines = [];
  const say = (s) => {
    lines.push(s);
    console.log(s);
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.on('console', (m) => say(`[console:${m.type()}] ${m.text().slice(0, 200)}`));

  // 昵称参数：传入后会尝试点开对应会话，再 dump 输入框/发送按钮（这两者只在选中会话后渲染）
  const targetName = process.argv[2];

  say('正在打开聊天页…');
  await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000); // 等前端渲染

  // 关闭可能存在的「是否保存登录信息」对话框（trust-login-dialog），它会遮挡后续点击
  try {
    const confirmBtn = page.locator('.trust-login-dialog-button-confirm');
    if ((await confirmBtn.count()) > 0 && (await confirmBtn.first().isVisible())) {
      await confirmBtn.first().click();
      say('已关闭 trust-login-dialog（保存登录信息对话框）');
      await page.waitForTimeout(1200);
    }
  } catch (e) {
    say(`关闭对话框失败（忽略）：${e?.message ?? e}`);
  }

  say(`\n=== URL ===\n${page.url()}`);
  say(`\n=== TITLE ===\n${await page.title()}`);

  const cookies = await context.cookies('https://www.douyin.com');
  const hasSession = cookies.some((c) => c.name === 'sessionid' || c.name === 'sessionid_ss');
  say(`\n=== 登录态 ===\nCookie 数 ${cookies.length} · sessionid 存在：${hasSession}`);

  const info = await page.evaluate(() => {
    const brief = (el, max = 160) => {
      const cls = typeof el.className === 'string' ? el.className : '';
      const id = el.id ? `#${el.id}` : '';
      const txt = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      return `${el.tagName.toLowerCase()}${id}${cls ? '.' + cls.trim().split(/\s+/).slice(0, 4).join('.') : ''} | "${txt}" | ${el.outerHTML.slice(0, max).replace(/\s+/g, ' ')}`;
    };
    const q = (sel) => Array.from(document.querySelectorAll(sel));

    // 输入框候选
    const inputs = [
      ...q('textarea'),
      ...q('[contenteditable="true"]'),
      ...q('input[type="text"]'),
    ].map((el) => brief(el));

    // 按钮候选（优先取含“发送”或位于底部区域的）
    const buttons = q('button, [role="button"]')
      .map((el) => brief(el, 120))
      .slice(0, 60);

    // iframe（聊天区可能在 iframe 内）
    const iframes = q('iframe').map((el) => `${el.src || '(no src)'} | ${el.className || ''}`);

    // 会话列表候选：先找常见的容器类名，再兜底取左侧栏可点击元素
    const sessionSelectors = [
      '[data-im-id]',
      '.conversation-item',
      '.chat-list-item',
      '.im-list-item',
      '[class*="conversation"]',
      '[class*="chatItem"]',
      '[class*="chat-item"]',
    ];
    const sessions = {};
    for (const sel of sessionSelectors) {
      const els = q(sel);
      if (els.length) sessions[sel] = els.slice(0, 10).map((el) => brief(el, 120));
    }

    // 兜底：body 的直接骨架（前 3 层），帮助判断整体结构
    const skeleton = (() => {
      const out = [];
      const walk = (el, depth) => {
        if (depth > 3 || out.length > 40) return;
        for (const child of el.children) {
          const cls = typeof child.className === 'string' ? child.className.trim() : '';
          if (cls || child.tagName === 'IFRAME') {
            out.push(`${'  '.repeat(depth)}${child.tagName.toLowerCase()}${cls ? '.' + cls.split(/\s+/).slice(0, 3).join('.') : ''}`);
          }
          walk(child, depth + 1);
        }
      };
      walk(document.body, 0);
      return out;
    })();

    return { inputs, buttons, iframes, sessions, skeleton };
  });

  say(`\n=== 输入框候选（${info.inputs.length}） ===`);
  info.inputs.forEach((s, i) => say(`\n[input ${i + 1}]\n${s}`));

  say(`\n=== 按钮候选（${info.buttons.length}，最多 60） ===`);
  info.buttons.forEach((s, i) => say(`[btn ${i + 1}] ${s}`));

  say(`\n=== iframe（${info.iframes.length}） ===`);
  info.iframes.forEach((s) => say(s));

  say('\n=== 会话项候选 ===');
  const selKeys = Object.keys(info.sessions);
  if (selKeys.length === 0) say('（未命中任何会话选择器）');
  for (const k of selKeys) {
    say(`\n-- ${k} --`);
    info.sessions[k].forEach((s) => say(s));
  }

  say('\n=== 页面骨架（前 3 层） ===');
  info.skeleton.forEach((s) => say(s));

  // ---------- 若传入好友昵称：点开会话后再 dump 输入框 / 发送按钮 ----------
  if (targetName) {
    say(`\n\n########## 尝试点开会话：${targetName} ##########`);
    try {
      const item = page
        .locator('[data-e2e="conversation-item"]')
        .filter({ has: page.locator(`.conversationConversationItemtitle`, { hasText: targetName }) })
        .first();
      const cnt = await item.count();
      say(`匹配到的会话项数量：${cnt}`);
      if (cnt > 0) {
        await item.click();
        say('已点击会话，等待聊天区渲染…');
        await page.waitForTimeout(4000);

        const after = await page.evaluate(() => {
          const brief = (el, max = 200) => {
            const cls = typeof el.className === 'string' ? el.className : '';
            const id = el.id ? `#${el.id}` : '';
            const ph = el.getAttribute?.('placeholder') || '';
            const txt = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
            return `${el.tagName.toLowerCase()}${id}${cls ? '.' + cls.trim().split(/\s+/).slice(0, 4).join('.') : ''}${ph ? ` [placeholder="${ph}"]` : ''} | "${txt}" | ${el.outerHTML.slice(0, max).replace(/\s+/g, ' ')}`;
          };
          const q = (sel) => Array.from(document.querySelectorAll(sel));
          return {
            inputs: [
              ...q('textarea'),
              ...q('[contenteditable="true"]'),
              ...q('input[type="text"]'),
            ].map((el) => brief(el)),
            buttons: q('button, [role="button"], [class*="send"], [class*="Send"]')
              .map((el) => brief(el, 140))
              .slice(0, 80),
            editorHints: q('[class*="editor" i], [class*="input" i], [class*="Input"], [data-e2e*="input" i], [data-e2e*="send" i]')
              .map((el) => brief(el, 140))
              .slice(0, 40),
          };
        });

        say(`\n=== 点开会话后 · 输入框候选（${after.inputs.length}） ===`);
        after.inputs.forEach((s, i) => say(`\n[input ${i + 1}]\n${s}`));
        say(`\n=== 点开会话后 · 按钮候选（${after.buttons.length}） ===`);
        after.buttons.forEach((s, i) => say(`[btn ${i + 1}] ${s}`));
        say(`\n=== 点开会话后 · 编辑区线索（${after.editorHints.length}） ===`);
        after.editorHints.forEach((s, i) => say(`[hint ${i + 1}] ${s}`));
      } else {
        say('未匹配到会话项。请检查昵称是否与会话列表中的显示名完全一致（可先用部分关键词试试）。');
        const titles = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.conversationConversationItemtitle')).map((el) => el.innerText.trim()),
        );
        say(`\n当前会话列表中的全部标题（${titles.length}）：\n${titles.join(' | ')}`);
      }
    } catch (e) {
      say(`点开会话失败：${e?.message ?? e}`);
    }
  } else {
    say('\n提示：传入好友昵称可进一步 dump 聊天输入框与发送按钮，例如：');
    say('      node server/scripts/diagnose-page.mjs 杨');
  }

  await page.screenshot({ path: PNG_OUT, fullPage: true });
  writeFileSync(TXT_OUT, lines.join('\n'), 'utf8');

  say('\n----------------------------------------');
  say(`✅ 诊断完成`);
  say(`文本结果：${TXT_OUT}`);
  say(`整页截图：${PNG_OUT}`);
  say('请把 page-diagnose.txt 的内容（或至少“输入框候选/按钮候选/会话项候选/页面骨架”四节）发给开发者。');
  say('----------------------------------------');

  await browser.close();
}

main().catch((e) => {
  console.error('诊断失败：', e?.message ?? e);
  process.exit(1);
});
