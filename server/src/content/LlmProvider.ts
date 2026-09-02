/**
 * 可选 LLM 内容源（用户自带 key，默认 DeepSeek，OpenAI 兼容协议）。
 * 使用 Node 原生 fetch，不引入 SDK，避免绑定。
 *
 * 合规与安全：apiKey 由调用方解密后注入（内存态），绝不明文落盘；
 * 任何失败都应由上层回退到本地模板，不阻断发送。
 */

import type { LlmConfig } from '../lib/types.ts';
import { withModule } from '../lib/logger.ts';

const log = withModule('llm');

export class LlmProvider {
  private readonly config: LlmConfig;
  private readonly apiKey: string;

  constructor(config: LlmConfig, decryptedApiKey: string) {
    this.config = config;
    this.apiKey = decryptedApiKey;
  }

  get enabled(): boolean {
    return this.config.enabled && this.apiKey.length > 0;
  }

  /**
   * 调用 LLM 生成文案。失败抛出，由调用方回退到模板。
   */
  async generate(prompt: string, system?: string): Promise<string> {
    if (!this.enabled) {
      throw new Error('LLM 未启用或无 apiKey');
    }
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            ...(system
              ? [{ role: 'system' as const, content: system }]
              : []),
            { role: 'user' as const, content: prompt },
          ],
          temperature: 0.9,
          max_tokens: 80,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`LLM HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('LLM 返回为空');
      return text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn({ err: msg }, 'llm generate failed, caller should fallback');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
