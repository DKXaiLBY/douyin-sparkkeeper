import { useState } from 'react';

interface ConsentGateProps {
  children: React.ReactNode;
}

const CONSENT_KEY = 'sparkkeeper-consent';

/**
 * 首次使用协议确认（开源自托管工具的责任做法）：
 * 内容是 README 免责声明的网页版——本项目涉及「可能违反抖音用户协议」的客观风险，
 * 首次打开必须显式确认，挡住「不知道风险就用了」的人；同意后本地记住，不再打扰。
 */
export function ConsentGate({ children }: ConsentGateProps) {
  const [agreed, setAgreed] = useState(() => localStorage.getItem(CONSENT_KEY) === '1');
  const [refused, setRefused] = useState(false);

  if (agreed) return <>{children}</>;

  if (refused) {
    return (
      <div className="ob-mask">
        <div className="ob-card" style={{ textAlign: 'center' }}>
          <h2 className="ob-title">你选择了不同意</h2>
          <p className="ob-desc">
            在不接受上述风险的前提下，本工具无法继续使用。
            <br />
            你可以关闭此页面；随时重新打开可再次阅读条款。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ob-mask">
      <div className="ob-card">
        <div style={{ fontSize: 13, color: 'var(--txt-faint)', marginBottom: 10 }}>
          使用前必读 · 火花守护 SparkKeeper · v1.0.0
        </div>
        <h2 className="ob-title">⚠️ 风险与免责声明</h2>
        <div className="ob-desc" style={{ marginBottom: 16 }}>
          <b style={{ color: 'var(--txt)' }}>使用本工具前，请确认你了解并接受以下事实：</b>
          <ol style={{ margin: '10px 0 0', paddingLeft: 20, display: 'grid', gap: 8 }}>
            <li>
              自动发送私信<b>可能违反《抖音用户服务协议》及社区公约</b>（不违法，但属于违约行为），
              由此产生的账号风控、功能限制、<b>甚至封号</b>等一切风险，
              <b>由使用者自行承担，开发者不承担任何责任</b>。
            </li>
            <li>本项目仅用于<b>技术研究和个人自用</b>，严禁用于商业用途、批量营销、多账号矩阵运营、对外提供服务。</li>
            <li>本工具<b>不绕过验证码、不破解、不逆向</b>，只用浏览器自动化模拟人工操作官方网页版；检测到验证码会主动暂停并提醒。</li>
            <li>你的登录凭证与全部数据<b>只保存在本机</b>，不上传任何服务器。</li>
            <li>
              <b>使用即表示已阅读并同意本免责声明</b>；如不同意，请立即停止使用并删除本项目。
            </li>
          </ol>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--txt-faint)' }}>
            完整条款（含降低风险的具体做法、适用边界、商标说明）见项目根目录 <b>README.md</b>。
          </div>
        </div>
        <div className="ob-actions">
          <button className="ob-skip" onClick={() => setRefused(true)}>
            不同意，不使用
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              localStorage.setItem(CONSENT_KEY, '1');
              setAgreed(true);
            }}
          >
            我已阅读并同意，继续使用
          </button>
        </div>
      </div>
    </div>
  );
}
