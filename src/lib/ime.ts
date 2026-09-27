/**
 * v3.9.23：输入法（拼音/日文/韩文）组字期间，回车不是"提交"。
 *
 * 用户反馈的原话是「拼音打一半按回车，半成品就被提交了」。
 * 中文输入时：敲 `kaihui` 还没选字，那串字母在输入法里是**候选状态**，
 * 此时按回车是「选中第一个候选」，而不是「确认这条待办」——
 * 但 keydown 照样会到达我们的处理函数，于是一条叫「kaihui」的待办就被建出来了。
 *
 * 判据有两个，都要看：
 *   · `isComposing`：标准属性，新浏览器/Chromium 都给
 *   · `keyCode === 229`：老浏览器和部分输入法只给这个（"正在组字"的约定值）
 *
 * React 的合成事件把原生事件藏在 `nativeEvent` 里，两个都读一下。
 */
interface ComposableKeyLike {
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
}

export function isImeComposing(e: ComposableKeyLike): boolean {
  const native = e.nativeEvent ?? e;
  if (native.isComposing) return true;
  return native.keyCode === 229;
}
