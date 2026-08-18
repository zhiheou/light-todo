import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";

interface PinGateProps {
  kind: "setup" | "enter";
  error: string;
  onCancel: () => void;
  onSubmit: (pin: string) => void;
}

export default function PinGate({ kind, error, onCancel, onSubmit }: PinGateProps) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");

  const valid = /^\d{4,6}$/.test(pin) && (kind === "enter" || pin === confirm);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "Enter" && valid) onSubmit(pin);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pin, confirm, valid, kind, onCancel, onSubmit]);

  return (
    <div className="pin-overlay">
      <div className="pin-box">
        <h2>{kind === "setup" ? "设置访问码" : "输入访问码"}</h2>
        <p>{kind === "setup" ? "设置 4 至 6 位数字访问码" : "输入访问码"}</p>

        <div className="pin-inputs">
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            placeholder="访问码"
            onChange={(event) => {
              setPin(event.target.value.replace(/\D/g, ""));
              setConfirm("");
            }}
          />
          {kind === "setup" && (
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={confirm}
              placeholder="确认访问码"
              onChange={(event) => setConfirm(event.target.value.replace(/\D/g, ""))}
            />
          )}
        </div>

        {error && <div className="pin-error">{error}</div>}

        <div className="pin-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!valid}
            onClick={() => onSubmit(pin)}
          >
            <LockKeyhole size={14} />
            解锁
          </button>
        </div>
      </div>
    </div>
  );
}
