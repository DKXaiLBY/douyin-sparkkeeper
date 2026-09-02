/** 类型化 API 客户端：统一 fetch 封装、统一错误与响应格式。 */

import type {
  AppConfig,
  DashboardSummary,
  Friend,
  HealthStatus,
  Notification,
  QrLoginState,
  SendReport,
} from './types.ts';

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

interface ApiEnvelope<T> {
  code: number | string;
  message: string;
  data: T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = (await res.json()) as ApiEnvelope<T>;
  if (json.code !== 0) {
    const detail = (json.data as { detail?: string } | null | undefined)?.detail;
    throw new ApiError(
      String(json.code),
      detail ? `${json.message || '请求失败'}\n\n错误详情：${detail}` : json.message || '请求失败',
    );
  }
  return json.data;
}

export const api = {
  health: () => request<HealthStatus>('/health'),

  dashboard: () => request<DashboardSummary>('/dashboard'),

  friends: {
    list: () => request<Friend[]>('/friends'),
    add: (body: Partial<Friend>) =>
      request<Friend>('/friends', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Friend>) =>
      request<Friend>(`/friends/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id: string) => request<null>(`/friends/${id}`, { method: 'DELETE' }),
    /** 从抖音拉取会话列表（登录后可用；未登录返回明确中文错误）。 */
    discover: () => request<{ items: string[] }>('/friends/discover'),
  },

  credentials: {
    status: () =>
      request<{ imported: boolean; unlocked: boolean; count: number }>('/credentials/status'),
    importCredential: (storageState: string, passphrase: string, expiresAt?: string) =>
      request<{ id: string }>('/credentials/import', {
        method: 'POST',
        body: JSON.stringify({ storageState, passphrase, expiresAt }),
      }),
    verify: (passphrase: string) =>
      request<{ ok: boolean }>('/credentials/verify', {
        method: 'POST',
        body: JSON.stringify({ passphrase }),
      }),
    relogin: () =>
      request<{ needed: boolean; message: string }>('/credentials/relogin', {
        method: 'POST',
      }),

    // ---- 扫码登录 ----
    /** 启动扫码会话。保险库未解锁时必须传 passphrase，否则返回 needsPassphrase:true。 */
    qrStart: (passphrase?: string) =>
      request<QrLoginState>('/credentials/qr/start', {
        method: 'POST',
        body: JSON.stringify({ passphrase }),
      }),
    /** 轮询状态（每次返回最新二维码与启动进度）。 */
    qrStatus: () => request<QrLoginState>('/credentials/qr/status'),
    /** 取消扫码会话并关闭浏览器。 */
    qrCancel: () => request<{ ok: boolean }>('/credentials/qr/cancel', { method: 'POST' }),
    /** 解锁保险库（配合前端「记住口令」：后端重启后用保存的口令自动解锁）。 */
    unlock: (passphrase: string) =>
      request<{ unlocked: boolean }>('/credentials/unlock', {
        method: 'POST',
        body: JSON.stringify({ passphrase }),
      }),
  },

  config: {
    get: () => request<AppConfig>('/config'),
    update: (patch: unknown) =>
      request<AppConfig>('/config', { method: 'PUT', body: JSON.stringify(patch) }),
  },

  run: {
    /**
     * Dry Run。传 friendId 只演练指定好友，不传则演练全部。
     * body 必须始终是合法 JSON：后端用 `body ?? {}` 兜底，传 undefined 会被 fetch 丢成空 body。
     */
    dry: (friendId?: string) =>
      request<SendReport>('/run/dry', {
        method: 'POST',
        body: JSON.stringify(friendId ? { friendId } : {}),
      }),
    /** 立即执行。传 friendId 只发给指定好友，不传则发给全部待续好友；force 跳过错峰窗口。 */
    now: (friendId?: string, force = false) =>
      request<SendReport>('/run/now', {
        method: 'POST',
        body: JSON.stringify({ ...(friendId ? { friendId } : {}), ...(force ? { force: true } : {}) }),
      }),
    pause: () => request<{ paused: boolean }>('/run/pause', { method: 'POST' }),
    resume: () => request<{ paused: boolean }>('/run/resume', { method: 'POST' }),
  },

  notifications: {
    list: (limit = 50) =>
      request<{ items: Notification[]; unread: number }>(
        `/notifications?limit=${limit}`,
      ),
    readAll: () => request<null>('/notifications/read-all', { method: 'POST' }),
    /** 发一条测试通知，验证当前通道配置是否有效。 */
    test: () =>
      request<{ sent: boolean; channel: string; note?: string }>('/notifications/test', {
        method: 'POST',
      }),
  },

  settings: {
    /** 查询开机自启是否已启用。 */
    autostart: () => request<{ enabled: boolean }>('/settings/autostart'),
    /** 启用/关闭开机自启（仅 Windows）。 */
    setAutostart: (enabled: boolean) =>
      request<{ enabled: boolean }>('/settings/autostart', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }),
  },
};
