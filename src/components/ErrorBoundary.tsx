import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * 全局错误边界（v3.9）
 *
 * 为什么需要：这是纯前端 SPA，任何渲染期异常（如数据格式意外、第三方库抛错）
 * 在 React 19 下会卸载整棵树 → **白屏**，用户完全不知道发生了什么。
 * 有了它：出问题时显示可操作的提示 + 一键复制错误 + 一键重载，而不是白屏。
 */
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  info: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 不上报服务器（隐私），只保留在内存 + 控制台，供用户复制反馈
    console.error("[轻待办] 渲染错误:", error, info.componentStack);
    this.setState({ info: String(info.componentStack || "") });
  }

  /** 出错时尽量不丢用户数据：清掉可能导致崩溃的本机缓存后重载 */
  handleReset = () => {
    try {
      // 只清"最后打开"这类非关键状态，不动任务数据
      sessionStorage.removeItem("lighttodo:last-error");
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  handleCopy = () => {
    const txt = `轻待办出错了\n${this.state.error?.message || ""}\n${this.state.error?.stack || ""}\n${this.state.info}`;
    void navigator.clipboard?.writeText(txt);
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          fontFamily: "system-ui, 'Microsoft YaHei', sans-serif",
          background: "#eef1f4",
          color: "#1a2430",
        }}
      >
        <div
          style={{
            maxWidth: 520,
            background: "#fff",
            border: "1px solid #d8dfe6",
            borderRadius: 14,
            padding: 24,
            boxShadow: "0 10px 40px rgba(16,24,40,.12)",
          }}
        >
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>😵 出了点小问题</h2>
          <p style={{ margin: "0 0 14px", color: "#5d6b7a", lineHeight: 1.7, fontSize: 14 }}>
            页面遇到一个意外错误，<b>你的数据还在</b>（存在本机/云端）。
            点下面按钮重新加载就能继续用。如果反复出现，把错误信息发我。
          </p>
          <pre
            style={{
              margin: "0 0 14px",
              padding: 10,
              background: "#f6f8fa",
              borderRadius: 8,
              fontSize: 11,
              color: "#5d6b7a",
              maxHeight: 120,
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {this.state.error.message}
          </pre>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: 0,
                background: "#0f766e",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              重新加载
            </button>
            <button
              type="button"
              onClick={this.handleCopy}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "1px solid #d8dfe6",
                background: "#fff",
                color: "#5d6b7a",
                cursor: "pointer",
              }}
            >
              复制错误信息
            </button>
          </div>
        </div>
      </div>
    );
  }
}
