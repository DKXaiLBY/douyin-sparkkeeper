import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/layout/GlassPanel.tsx';
import type { AppConfig } from '@/api/types.ts';

interface TemplatePanelProps {
  config: AppConfig;
  update: (patch: unknown) => Promise<unknown>;
}

/** 文案模板面板：自定义发送文案（本地模板引擎，零外部依赖）。
 *  原「内容引擎（可选 LLM）」已按用户要求移除——需要 AI 生成时自己找 AI 写好贴进来即可。 */
export function TemplatePanel({ config, update }: TemplatePanelProps) {
  const [templatesText, setTemplatesText] = useState(
    (config.content?.templates ?? []).join('\n'),
  );
  const [tplSaving, setTplSaving] = useState(false);
  const [tplMsg, setTplMsg] = useState('');

  useEffect(() => {
    setTemplatesText((config.content?.templates ?? []).join('\n'));
  }, [config.content?.templates]);

  const saveTemplates = async () => {
    const lines = templatesText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 50) {
      setTplMsg('最多 50 条模板');
      return;
    }
    for (const l of lines) {
      if (l.length > 120) {
        setTplMsg(`模板超长（>120 字）：${l.slice(0, 20)}…`);
        return;
      }
    }
    setTplSaving(true);
    setTplMsg('');
    try {
      await update({ content: { templates: lines } });
      setTplMsg(lines.length ? `✅ 已保存 ${lines.length} 条自定义模板` : '✅ 已保存（将使用内置模板）');
    } catch (e) {
      setTplMsg(`❌ ${e instanceof Error ? e.message : '保存失败'}`);
    } finally {
      setTplSaving(false);
    }
  };

  return (
    <GlassPanel title="✍️ 发送文案" icon="✍️">
      <div className="field">
        <label>
          自定义模板（每行一条）
          <span
            className="help"
            data-tip="可用变量：{nickname} 昵称 · {weekday} 星期 · {weather} 天气 · {mood} 随机语气。每条一行，随机选用；不填则用内置模板。"
            style={{ marginLeft: 6 }}
          >
            ?
          </span>
        </label>
        <textarea
          className="textarea"
          rows={7}
          style={{ width: '100%', boxSizing: 'border-box' }}
          placeholder={`示例：\n{nickname}，{weekday}也要开开心心的哦，{mood}的我们说好不断火花😊\n在吗在吗，{nickname}？{weekday}的火花我替你记着呢～`}
          value={templatesText}
          onChange={(e) => setTemplatesText(e.target.value)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <button className="btn btn-primary" disabled={tplSaving} onClick={saveTemplates}>
            {tplSaving ? '保存中…' : '保存文案模板'}
          </button>
          {tplMsg && <span style={{ fontSize: 12, color: 'var(--txt-dim)' }}>{tplMsg}</span>}
        </div>
      </div>
    </GlassPanel>
  );
}
