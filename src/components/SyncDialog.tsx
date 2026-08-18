import { useEffect, useState } from "react";
import { Cloud, CloudDownload, CloudUpload, X } from "lucide-react";
import type { SyncConfig } from "../lib/sync";
import { getSyncConfig } from "../lib/sync";

interface SyncDialogProps {
  onClose: () => void;
  onPush: (config: SyncConfig, passphrase: string) => Promise<string>;
  onPull: (config: SyncConfig, passphrase: string) => Promise<string>;
}

export default function SyncDialog({ onClose, onPush, onPull }: SyncDialogProps) {
  const saved = getSyncConfig();
  const [url, setUrl] = useState(saved?.url ?? "");
  const [username, setUsername] = useState(saved?.username ?? "");
  const [password, setPassword] = useState(saved?.password ?? "");
  const [passphrase, setPassphrase] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(action: "push" | "pull") {
    if (!url.trim() || !passphrase) {
      setError("请填写同步地址与同步口令");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const config: SyncConfig = {
        url: url.trim(),
        username: username.trim(),
        password,
      };
      const message =
        action === "push"
          ? await onPush(config, passphrase)
          : await onPull(config, passphrase);
      setStatus(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" role="dialog" aria-label="同步设置">
        <div className="modal-head">
          <h2>
            <Cloud size={17} />
            同步
          </h2>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="field">
          <label htmlFor="sync-url">WebDAV 同步地址</label>
          <input
            id="sync-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/remote.php/dav/files/me/light-todo/sync.json"
          />
        </div>

        <div className="field">
          <label htmlFor="sync-user">用户名</label>
          <input
            id="sync-user"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="WebDAV 用户名"
          />
        </div>

        <div className="field">
          <label htmlFor="sync-password">密码</label>
          <input
            id="sync-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="WebDAV 密码"
          />
        </div>

        <div className="field">
          <label htmlFor="sync-passphrase">同步口令</label>
          <input
            id="sync-passphrase"
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="用于端到端加密，各设备必须一致"
          />
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void run("push")}
          >
            <CloudUpload size={14} />
            上传
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void run("pull")}
          >
            <CloudDownload size={14} />
            下载
          </button>
        </div>

        {busy && <div className="sync-status">同步中...</div>}
        {status && <div className="sync-status ok">{status}</div>}
        {error && <div className="sync-status error">{error}</div>}
      </div>
    </div>
  );
}
