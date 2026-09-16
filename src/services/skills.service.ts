// 用途：Agent 技能业务逻辑（PRD 故事 46-47）：技能正文存于根目录 skills/<filename>.md 文件，名称/文件名/启用状态等管理信息存于 Prisma Skill 表（schema.prisma 既定约定）。
// 技能不属于特定店铺（Skill 表无 shopId），故无 shopId 隔离；写文件用临时文件 + 原子改名并在失败时清理临时文件，文件写入失败时回滚已建元数据，杜绝出现指向缺失文件的技能。
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Skill } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { MAX_ENABLED_SKILLS, MAX_SKILLS, SKILL_DESCRIPTION_MAX, SKILL_FILE_MAX_BYTES, SKILL_NAME_MAX, SKILL_PROMPT_MAX } from "@/config/skills";
import type { SkillCreateInput, SkillUpdateInput, SkillView } from "@/types";

const SKILLS_DIR = path.join(process.cwd(), "skills");

function skillPath(filename: string): string {
  return path.join(SKILLS_DIR, filename);
}

// 文件名只允许单个安全文件名（无路径分隔符、不以点开头、不含 ..），来自数据库的 filename 同样按不可信处理，防路径穿越。
function isSafeFilename(filename: string): boolean {
  if (!filename.endsWith(".md")) return false;
  if (filename.length < 4 || filename.length > 200) return false;
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) return false;
  if (filename.startsWith(".")) return false;
  return true;
}

// 读取技能 .md 正文：文件缺失、超限或读取失败一律返回空串（不静默丢弃记录，列表侧仍显示该技能供删除；注入侧按空正文跳过）。
async function readSkillContent(filename: string): Promise<string> {
  if (!isSafeFilename(filename)) return "";
  const filePath = skillPath(filename);
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > SKILL_FILE_MAX_BYTES) {
      console.error(`[skills] 技能文件 ${filename} 超过大小上限 ${SKILL_FILE_MAX_BYTES} 字节，跳过正文加载`);
      return "";
    }
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    console.error(`[skills] 技能文件 ${filename} 读取失败:`, error);
    return "";
  }
}

async function toView(skill: Skill): Promise<SkillView> {
  return {
    id: skill.id,
    name: skill.name,
    filename: skill.filename,
    description: skill.description ?? "",
    content: await readSkillContent(skill.filename),
    alwaysApply: skill.alwaysApply,
    enabled: skill.enabled,
    createdAt: skill.createdAt.toISOString(),
    updatedAt: skill.updatedAt.toISOString(),
  };
}

export async function listSkills(): Promise<SkillView[]> {
  const rows = await prisma.skill.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return Promise.all(rows.map(toView));
}

export async function listEnabledSkills(): Promise<SkillView[]> {
  const rows = await prisma.skill.findMany({ where: { enabled: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const views = await Promise.all(rows.map(toView));
  // 正文为空（文件缺失/不可读）的技能无内容可注入，跳过；但仍会出现在 listSkills 中供设置页查看删除。
  return views.filter((view) => view.content.trim() !== "");
}

function normalize(input: SkillCreateInput): SkillCreateInput {
  const name = input.name.trim();
  const description = input.description.trim();
  const prompt = input.prompt.trim();
  if (name === "" || name.length > SKILL_NAME_MAX) {
    throw new ValidationError(`技能名称不能为空且不能超过 ${SKILL_NAME_MAX} 字`);
  }
  if (description.length > SKILL_DESCRIPTION_MAX) {
    throw new ValidationError(`技能说明不能超过 ${SKILL_DESCRIPTION_MAX} 字`);
  }
  if (prompt === "" || prompt.length > SKILL_PROMPT_MAX) {
    throw new ValidationError(`技能规则不能为空且不能超过 ${SKILL_PROMPT_MAX} 字`);
  }
  return { name, description, prompt };
}

// 技能正文规范化格式（与 seed 的 skills/ 示例一致）：H1 名称 + 用途 + 规则；作为幂等比较的确定性正文。
function buildSkillContent(name: string, description: string, prompt: string): string {
  const lines = [`# ${name}`, ""];
  if (description !== "") lines.push("## 用途", description, "");
  lines.push("## 规则", prompt);
  return `${lines.join("\n").trimEnd()}\n`;
}

// 由技能名称净化出安全文件名：去掉路径分隔符与不可见字符，防止经名称构造出危险文件名。
function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\r\n\t\u0000-\u001f]/g, "")
    .replace(/^\.+/, "")
    .trim();
  return (cleaned === "" ? "skill" : cleaned).slice(0, 60);
}

async function writeSkillFile(filename: string, content: string): Promise<void> {
  const filePath = skillPath(filename);
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.mkdir(SKILLS_DIR, { recursive: true });
  try {
    await fs.writeFile(tmpPath, content, "utf-8");
    await fs.chmod(tmpPath, 0o644).catch(() => undefined);
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    // 原子写失败时清理残留临时文件（忽略 ENOENT），再抛统一错误。
    await fs.unlink(tmpPath).catch(() => undefined);
    console.error(`[skills] 技能文件 ${filename} 写入失败:`, error);
    throw new AppError("技能文件保存失败，请检查 skills 目录是否可写", "SKILL_WRITE_ERROR", 500);
  }
}

// 创建：同名且正文完全一致时幂等返回既有条目（防止确认卡片重复点击/刷新重复创建）；同名但内容不同返回 409 冲突；
// 新技能默认启用，超过已启用上限则拒绝，保证「已启用」与「实际注入生效」数量一致。
export async function createSkill(input: SkillCreateInput): Promise<SkillView> {
  const { name, description, prompt } = normalize(input);
  const alwaysApply = input.alwaysApply ?? true;
  const existingRows = await prisma.skill.findMany({
    select: { id: true, name: true, description: true, filename: true, enabled: true, alwaysApply: true },
  });
  if (existingRows.length >= MAX_SKILLS) {
    throw new ValidationError(`技能总数已达上限（${MAX_SKILLS} 个），请先删除不用的技能`);
  }
  if (existingRows.filter((row) => row.enabled).length >= MAX_ENABLED_SKILLS) {
    throw new ValidationError(`已启用技能已达上限（${MAX_ENABLED_SKILLS} 个），请先禁用或删除后再创建`);
  }
  const lower = name.toLowerCase();
  const content = buildSkillContent(name, description, prompt);
  const existing = existingRows.find((row) => row.name.toLowerCase() === lower);
  if (existing) {
    const existingContent = await readSkillContent(existing.filename);
    // 幂等条件含加载模式：模式不同不静默返回旧记录，提示到设置页切换，保证卖家选择不被忽略。
    if ((existing.description ?? "") === description && existingContent === content && existing.alwaysApply === alwaysApply) {
      const row = await prisma.skill.findUniqueOrThrow({ where: { id: existing.id } });
      return toView(row);
    }
    if ((existing.description ?? "") === description && existingContent === content) {
      throw new ConflictError(`已存在同名且内容相同的技能「${name}」，仅加载模式不同；请在设置页直接切换常驻开关`);
    }
    throw new ConflictError(`已存在同名技能「${name}」，请修改名称或先在设置页删除旧技能`);
  }
  const used = new Set(existingRows.map((row) => row.filename));
  const base = sanitizeFilename(name);
  let filename = `${base}.md`;
  let suffix = 0;
  while (used.has(filename)) {
    suffix += 1;
    filename = `${base}-${suffix}.md`;
  }
  const row = await prisma.skill.create({
    data: { name, description: description === "" ? null : description, filename, enabled: true, alwaysApply },
  });
  try {
    await writeSkillFile(filename, content);
  } catch (error) {
    // 文件写入失败做补偿清理：回滚刚创建的元数据记录，避免技能指向缺失文件。
    await prisma.skill.delete({ where: { id: row.id } }).catch(() => undefined);
    throw error;
  }
  return toView(row);
}

// 更新启用状态与常驻开关：两个字段都可选但至少传一个（API 层已校验）；启用受已启用上限约束，常驻开关切换不影响上限计数。
export async function updateSkill(id: string, input: SkillUpdateInput): Promise<SkillView> {
  if (input.enabled === undefined && input.alwaysApply === undefined) {
    throw new ValidationError("至少提供 enabled 或 alwaysApply 之一");
  }
  const row = await prisma.skill.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("技能不存在");
  if (input.enabled === true && !row.enabled) {
    const enabledCount = await prisma.skill.count({ where: { enabled: true } });
    if (enabledCount >= MAX_ENABLED_SKILLS) {
      throw new ValidationError(`已启用技能已达上限（${MAX_ENABLED_SKILLS} 个），请先禁用其他技能`);
    }
  }
  const updated = await prisma.skill.update({
    where: { id },
    data: {
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.alwaysApply === undefined ? {} : { alwaysApply: input.alwaysApply }),
    },
  });
  return toView(updated);
}

export async function deleteSkill(id: string): Promise<void> {
  const row = await prisma.skill.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("技能不存在");
  await prisma.skill.delete({ where: { id } });
  // 元数据删除后清理正文文件（尽力而为：文件缺失/删除失败不影响已删除，残留 .md 无引用无害）。
  await fs.unlink(skillPath(row.filename)).catch(() => undefined);
}
