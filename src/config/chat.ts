// 用途：聊天流专用等待预算，不改变普通 apiRequest 的默认 15 秒。
export const CHAT_STREAM_TIMEOUTS = {
  connectionMs: 30_000,
  idleMs: 180_000,
};
