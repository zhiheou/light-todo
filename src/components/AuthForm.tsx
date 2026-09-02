import { useState } from "react";
import { ShieldCheck } from "lucide-react";

interface AuthFormProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
}

export default function AuthForm({ onLogin, onRegister }: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!username.trim() || !password) {
      setError("请填写用户名和密码");
      return;
    }
    if (mode === "register" && password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "login") await onLogin(username.trim(), password);
      else await onRegister(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-form">
      <div className="segmented account-tabs">
        <button
          type="button"
          className={mode === "login" ? "active" : ""}
          onClick={() => {
            setMode("login");
            setError("");
          }}
        >
          登录
        </button>
        <button
          type="button"
          className={mode === "register" ? "active" : ""}
          onClick={() => {
            setMode("register");
            setError("");
          }}
        >
          注册
        </button>
      </div>

      <div className="field account-field">
        <label htmlFor="auth-username">用户名</label>
        <input
          id="auth-username"
          autoFocus
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="3-32 个字符"
        />
      </div>

      <div className="field account-field">
        <label htmlFor="auth-password">密码</label>
        <input
          id="auth-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          placeholder={mode === "register" ? "至少 6 位" : "密码"}
        />
      </div>

      {mode === "register" && (
        <div className="field account-field">
          <label htmlFor="auth-confirm">确认密码</label>
          <input
            id="auth-confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="再次输入密码"
          />
        </div>
      )}

      <div className="account-note">
        <ShieldCheck size={14} />
        数据使用账号密码端到端加密，服务器只保存密文；忘记密码将无法找回数据。
      </div>

      {error && <div className="sync-status error">{error}</div>}

      <div className="modal-actions">
        <button
          type="button"
          className="primary-button auth-submit"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? "处理中..." : mode === "login" ? "登录" : "注册"}
        </button>
      </div>
    </div>
  );
}
