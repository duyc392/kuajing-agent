// 用途：工具注册表：构建当前对话可用的业务工具列表（shopId 由对话上下文注入，模型生成函数由 Agent 层提供，实现 tools → services/lib 的合规方向）。
import { createCopywritingTool, type CopywritingToolDeps } from "@/agent/tools/copywriting";
import { createVideoScriptTool } from "@/agent/tools/script";
import { createLiveScriptTool } from "@/agent/tools/live-script";
import { createCompetitorTool, createMarketTool, createRecommendTool } from "@/agent/tools/selection";
import { createImageVariantTool, createProductImageTool } from "@/agent/tools/image";
import { createProposeSkillTool } from "@/agent/tools/skill";
import { createDatabaseTool } from "@/agent/tools/database";

export function buildAgentTools(deps: CopywritingToolDeps) {
  return [
    createCopywritingTool(deps),
    createVideoScriptTool(deps),
    createLiveScriptTool(deps),
    createMarketTool(deps),
    createRecommendTool(deps),
    createCompetitorTool(deps),
    createProductImageTool(deps),
    createImageVariantTool(deps),
    createProposeSkillTool(),
    createDatabaseTool(deps),
  ];
}
