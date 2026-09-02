/**
 * 内容引擎「纯 Node 直跑」验证脚本（无需安装任何依赖）。
 * 运行：node --experimental-strip-types tests/server/content.verify.mjs
 * 验证：变量注入（昵称/星期/天气/语气）、无天气回落、模板渲染。
 */
import { generateDraft } from '../../server/src/content/TemplateEngine.ts';
import { renderTemplate } from '../../server/src/content/templates.ts';

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('  ✗ FAIL:', msg);
  }
}

const d = generateDraft(
  { nickname: '小雨同学' },
  { weekday: '周六', weather: '晴空万里', mood: '元气满满' },
);
assert(d.content.includes('小雨同学'), '注入昵称');
assert(d.content.includes('周六'), '注入星期');
assert(d.content.includes('晴空万里'), '注入天气');
assert(d.content.includes('元气满满'), '注入语气');
assert(d.vars.nickname === '小雨同学', 'vars 暴露昵称');

const d2 = generateDraft({ nickname: '阿杰' }, { weekday: '周一', mood: '摸鱼中' });
assert(!d2.content.includes('{'), '无残留占位符');
assert(!d2.content.includes('undefined'), '无 undefined');

assert(renderTemplate('hi {name}', { name: 'x' }) === 'hi x', 'renderTemplate 替换');
assert(renderTemplate('a {m} b', {}) === 'a {m} b', 'renderTemplate 保留未知占位符');

console.log(`\n[content.verify] 通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
