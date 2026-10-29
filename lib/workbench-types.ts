export const JOB_KINDS = ["paper_reader", "paper_card", "paper_translation_pdf", "reference_verification", "paper2ppt", "idea_feasibility", "weekly_report"] as const;
export type JobKind = (typeof JOB_KINDS)[number];
export type JobStatus = "draft" | "ready" | "running" | "needs_input" | "completed" | "failed" | "cancelled";
export type ScheduleKind = "course" | "ddl" | "todo";
export const SKILL_BY_JOB: Record<JobKind, string> = {
  paper_reader: "nature-reader", paper_card: "nature-paper-card", paper_translation_pdf: "nature-paper-trans",
  reference_verification: "nature-ref-verifier", paper2ppt: "nature-paper2ppt",
  idea_feasibility: "nature-academic-search + nature-reviewer", weekly_report: "workbench-weekly-report",
};
export const WEEKLY_REPORT_TEMPLATE = `#### 一、本周进展概述\n\n本周无\n\n#### 二、论文阅读\n\n本周无\n\n#### 三、Our Method 设计/改进\n\n本周无\n\n#### 四、实验进展\n\n本周无\n\n#### 五、其他工作进展\n\n本周无\n\n#### 六、下周计划\n\n本周无\n`;
export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
