// 用途：本土化配音工具：把目标语言文案交给 TTS 合成，返回 taskId（异步任务，用 get_async_task 轮询）。
// 工具只执行合成，不翻译、不改写文案；文案由主 Agent 按分镜 SOP 写好。
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { startTask } from "@/services/async-task.service";
import { generateLocalizedTts } from "@/services/tts.service";
import type { AsyncTaskHandleDetails, TtsRunDetails } from "@/types";

const ttsSchema = Type.Object({
  text: Type.String({ description: "要合成的目标语言文案（口语化，不要中文）", minLength: 1, maxLength: 5000, pattern: "\\S" }),
  language: Type.String({ description: "文案语言代码，如 en / id / th / vi / es", minLength: 2, maxLength: 8 }),
  voiceId: Type.Optional(Type.String({ description: "音色 ID，不填用配置里的默认音色", maxLength: 100 })),
});

type TtsParams = Static<typeof ttsSchema>;

export function createTtsTool(): AgentTool<typeof ttsSchema, AsyncTaskHandleDetails> {
  return {
    name: "generate_localized_tts",
    label: "生成本土化配音",
    description:
      "把目标语言文案合成带情绪的配音，并生成对应时间轴的 SRT，返回 taskId。文案必须先由你按分镜 SOP 写好（地道口语，不要中式英语）；本工具不翻译、不改写。完成后用 get_async_task 拿音频与字幕路径。",
    parameters: ttsSchema,
    async execute(_toolCallId, params: TtsParams): Promise<AgentToolResult<AsyncTaskHandleDetails>> {
      const { taskId } = startTask<TtsRunDetails>("tts", () => generateLocalizedTts({
        text: params.text,
        language: params.language,
        voiceId: params.voiceId,
      }));
      return {
        content: [{ type: "text", text: `已提交语音合成（任务 ${taskId}），通常 5-30 秒，请用 get_async_task 轮询结果。` }],
        details: { taskId, kind: "tts", status: "running" },
      };
    },
  };
}
