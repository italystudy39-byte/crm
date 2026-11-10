import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/org";
import { localYmd, zonedMidnight } from "@/lib/period";
import { searchKnowledge } from "./knowledge";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AgentCtx = {
  supabase: Supabase;
  userId: string;
  org: { id: string; name: string; slug: string; currency: string; timezone: string };
  canEdit: boolean;
  /** Plain-text transcript saved with an escalation ticket. */
  transcript: { role: "user" | "assistant"; content: string }[];
};

export type ToolEvent = { type: "ticket"; id: string } | { type: "task"; id: string; title: string };

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_deals_summary",
    description:
      "Сводка по сделкам текущего пространства: количество и сумма по каждому этапу каждой воронки (kind: open — в работе, won — выиграна, lost — проиграна). Если указан stage, дополнительно возвращает до 15 крупнейших сделок этого этапа (название, сумма, id, дата создания). Используй для вопросов о воронке, пайплайне, «сколько сделок на этапе X».",
    input_schema: {
      type: "object",
      properties: {
        stage: { type: "string", description: "Название этапа (без учёта регистра, можно часть названия). Не указывай, чтобы получить сводку по всем этапам." },
      },
    },
    eager_input_streaming: true,
  },
  {
    name: "create_task",
    description:
      "Создаёт задачу текущему пользователю. Вызывай только когда пользователь явно попросил создать задачу или согласился с предложенной. due_date в формате YYYY-MM-DD (часовой пояс пространства, время 10:00). deal_id указывай, если задача относится к сделке.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Короткая формулировка задачи" },
        due_date: { type: "string", description: "Срок в формате YYYY-MM-DD" },
        deal_id: { type: "string", description: "UUID сделки, к которой относится задача" },
      },
      required: ["title"],
    },
    eager_input_streaming: true,
  },
  {
    name: "search_knowledge_base",
    description:
      "Ищет в базе знаний инструкции по интерфейсу CRM (как создать сделку, импортировать контакты, настроить воронку, пригласить сотрудника и т.п.). Используй перед ответом на любой вопрос «как сделать … в CRM», чтобы не выдумывать названия кнопок.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Поисковый запрос на русском" } },
      required: ["query"],
    },
    eager_input_streaming: true,
  },
  {
    name: "escalate_to_human",
    description:
      "Создаёт тикет в поддержку для живого специалиста. Используй, если: пользователь просит человека; проблема похожа на ошибку системы, оплату, потерю данных или доступ; база знаний не помогла после попытки. Опиши проблему так, чтобы специалисту не пришлось переспрашивать.",
    input_schema: {
      type: "object",
      properties: { issue_description: { type: "string", description: "Подробное описание проблемы и что уже пробовали" } },
      required: ["issue_description"],
    },
    eager_input_streaming: true,
  },
];

export const TOOL_LABELS: Record<string, string> = {
  get_deals_summary: "Смотрю сделки",
  create_task: "Создаю задачу",
  search_knowledge_base: "Ищу в базе знаний",
  escalate_to_human: "Передаю специалисту",
};

const schemas = {
  get_deals_summary: z.object({ stage: z.string().max(100).optional() }),
  create_task: z.object({
    title: z.string().trim().min(1).max(300),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "due_date должен быть в формате YYYY-MM-DD").optional(),
    deal_id: z.uuid().optional(),
  }),
  search_knowledge_base: z.object({ query: z.string().trim().min(1).max(300) }),
  escalate_to_human: z.object({ issue_description: z.string().trim().min(10).max(4000) }),
};

type Result = { content: string; isError?: boolean; event?: ToolEvent };
const err = (content: string): Result => ({ content, isError: true });

export async function runTool(name: string, input: unknown, c: AgentCtx): Promise<Result> {
  if (!(name in schemas)) return err(`Неизвестный инструмент ${name}`);
  const parsed = schemas[name as keyof typeof schemas].safeParse(input);
  if (!parsed.success) return err(`Неверные параметры: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const args = parsed.data as Record<string, string | undefined>;
  try {
    switch (name) {
      case "get_deals_summary":
        return await dealsSummary(c, args.stage);
      case "create_task":
        return await createTask(c, args.title!, args.due_date, args.deal_id);
      case "search_knowledge_base": {
        const hits = searchKnowledge(args.query!);
        return { content: hits.length ? JSON.stringify(hits) : "Ничего не найдено. Не выдумывай инструкцию: уточни вопрос или предложи передать специалисту." };
      }
      case "escalate_to_human":
        return await escalate(c, args.issue_description!);
    }
  } catch (e) {
    console.error("tool failed", name, e);
    return err("Внутренняя ошибка инструмента");
  }
  return err("Инструмент не реализован");
}

const publicRow = (r: { pipeline: string; stage: string; kind: string; deals: number; total: string }) => ({ pipeline: r.pipeline, stage: r.stage, kind: r.kind, deals: r.deals, total: r.total });

async function dealsSummary(c: AgentCtx, stage?: string): Promise<Result> {
  const { data: stages, error } = await c.supabase
    .from("stages")
    .select("id, name, kind, position, pipelines(name)")
    .eq("organization_id", c.org.id)
    .order("position");
  if (error) return err(error.message);
  const { data: deals } = await c.supabase.from("deals").select("id, title, amount, stage_id, created_at").eq("organization_id", c.org.id).limit(5000);
  const byStage = new Map<string, { count: number; sum: number }>();
  for (const d of deals ?? []) {
    const s = byStage.get(d.stage_id) ?? { count: 0, sum: 0 };
    s.count++;
    s.sum += Number(d.amount) || 0;
    byStage.set(d.stage_id, s);
  }
  const rows = (stages ?? []).map((s) => {
    const agg = byStage.get(s.id) ?? { count: 0, sum: 0 };
    const p = s.pipelines as unknown as { name: string };
    return { pipeline: p.name, stage: s.name, kind: s.kind, deals: agg.count, total: formatMoney(agg.sum, c.org.currency), id: s.id };
  });
  if (!stage) return { content: JSON.stringify({ currency: c.org.currency, stages: rows.map(publicRow) }) };
  const q = stage.toLowerCase();
  const matched = rows.filter((r) => r.stage.toLowerCase().includes(q));
  if (!matched.length) return err(`Этап «${stage}» не найден. Доступные этапы: ${[...new Set(rows.map((r) => r.stage))].join(", ")}`);
  const ids = new Set(matched.map((m) => m.id));
  const top = (deals ?? [])
    .filter((d) => ids.has(d.stage_id))
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 15)
    .map((d) => ({ id: d.id, title: d.title, amount: formatMoney(d.amount, c.org.currency), created_at: d.created_at.slice(0, 10) }));
  return { content: JSON.stringify({ stages: matched.map(publicRow), top_deals: top }) };
}

async function createTask(c: AgentCtx, title: string, due?: string, dealId?: string): Promise<Result> {
  if (!c.canEdit) return err("У пользователя роль «Только просмотр», создавать задачи нельзя.");
  if (dealId) {
    const { data } = await c.supabase.from("deals").select("id").eq("id", dealId).eq("organization_id", c.org.id).maybeSingle();
    if (!data) return err("Сделка с таким deal_id не найдена в этом пространстве.");
  }
  let dueAt: string | null = null;
  if (due) {
    const [y, m, d] = due.split("-").map(Number);
    const t = zonedMidnight(c.org.timezone, y, m, d);
    if (Number.isNaN(t.getTime())) return err("Некорректная дата");
    dueAt = new Date(t.getTime() + 10 * 3600_000).toISOString();
  }
  const { data, error } = await c.supabase
    .from("tasks")
    .insert({ organization_id: c.org.id, title, due_at: dueAt, deal_id: dealId ?? null, assignee_id: c.userId })
    .select("id")
    .single();
  if (error) return err(error.message);
  return { content: JSON.stringify({ ok: true, task_id: data.id, due_at: dueAt }), event: { type: "task", id: data.id, title } };
}

async function escalate(c: AgentCtx, issue: string): Promise<Result> {
  const { data, error } = await c.supabase
    .from("support_tickets")
    .insert({ organization_id: c.org.id, user_id: c.userId, issue_description: issue, conversation: c.transcript.slice(-30) })
    .select("id")
    .single();
  if (error) return err(error.message);
  return {
    content: JSON.stringify({ ok: true, ticket_id: data.id, note: "Тикет создан. Скажи пользователю, что статус виден в разделе «Поддержка»." }),
    event: { type: "ticket", id: data.id },
  };
}

export function todayLine(tz: string, now: Date) {
  const t = localYmd(tz, now);
  return `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
}
