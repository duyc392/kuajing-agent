// 用途：工具注册表：构建当前对话可用的原子工具列表。
// 约定：每个工具只做一件事（取数 / 计算 / 执行 / 写入 / 校验），execute 里不调用模型、不写 prisma 查询；
// 业务判断由主 Agent 按 load_skill 取回的 SOP 完成。shopId 由对话上下文注入，工具不接受来自模型的店铺参数。
import { createFetchMarketDataTool, createCompetitorShopTool } from "@/agent/tools/market";
import { createFetchCommentsTool, createFetchReviewsTool } from "@/agent/tools/reviews";
import { createCutRhythmTool, createExtractFramesTool, createFetchVideoSourceTool, createTranscribeVideoTool } from "@/agent/tools/video";
import { createScoreCandidateTool, createUnitEconomicsTool } from "@/agent/tools/finance";
import { createComplianceTool } from "@/agent/tools/compliance";
import { createValidateStoryboardTool, createVerifyCitationsTool } from "@/agent/tools/validate";
import { createShopKnowledgeTool } from "@/agent/tools/knowledge";
import { createListSnapshotsTool, createLoadSnapshotTool, createSaveSnapshotTool } from "@/agent/tools/snapshot";
import { createExportTool } from "@/agent/tools/export";
import { createTtsTool } from "@/agent/tools/media";
import { createRenderImageTool, createRunImageWorkflowTool, createSaveImageRecordTool } from "@/agent/tools/image";
import { createSaveCopyTool, createSaveLiveScriptTool, createSaveScriptTool } from "@/agent/tools/persist";
import { createPresentReportTool } from "@/agent/tools/present";
import { createGetAsyncTaskTool } from "@/agent/tools/task";
import { createProposeSkillTool } from "@/agent/tools/skill";
import { createLoadSkillTool } from "@/agent/tools/load-skill";
import { createDatabaseTool } from "@/agent/tools/database";
import { createSelectionWorkbenchTool } from "@/agent/tools/selection-workbench";

export interface AgentToolDeps {
  shopId: string;
}

export function buildAgentTools(deps: AgentToolDeps) {
  return [
    // 一、外部情报与数据抓取
    createFetchMarketDataTool(),
    createCompetitorShopTool(),
    createFetchReviewsTool(),
    createFetchCommentsTool(),
    createFetchVideoSourceTool(),
    createTranscribeVideoTool(),
    createExtractFramesTool(),
    createCutRhythmTool(),
    // 二、确定性计算与风控校验
    createUnitEconomicsTool(),
    createScoreCandidateTool(),
    createComplianceTool(),
    createVerifyCitationsTool(),
    createValidateStoryboardTool(),
    // 三、多模态素材生产
    createRenderImageTool(),
    createRunImageWorkflowTool(),
    createSaveImageRecordTool(deps),
    createTtsTool(),
    // 四、状态、记忆与归档
    createShopKnowledgeTool(deps),
    createSaveSnapshotTool(deps),
    createLoadSnapshotTool(deps),
    createListSnapshotsTool(deps),
    createExportTool(),
    createDatabaseTool(deps),
    // 五、落库与展示
    createSaveCopyTool(deps),
    createSaveScriptTool(deps),
    createSaveLiveScriptTool(deps),
    createPresentReportTool(),
    // 六、长任务与元工具
    createGetAsyncTaskTool(),
    createProposeSkillTool(),
    createLoadSkillTool(),
    createSelectionWorkbenchTool(),
  ];
}
