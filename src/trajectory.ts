import { summarizeToolResult, summarizeToolCall } from "./summaries.js";

/**
 * Minimal structural view of a DSH session-surface event, as returned by
 * `ctx.sessionQuery.readSurface(...).events`. Kept local and structural
 * instead of importing `SurfaceEvent` from `@deepseek-ai/dsh-session` so the
 * serializer does not depend on a specific published export surface.
 */
export interface TrajectoryEventLike {
  type: string;
  data: unknown;
}

interface BlockLike {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
  content?: unknown;
  isError?: boolean;
  toolCallId?: string;
}

interface MessageLike {
  role?: string;
  content?: unknown;
  source?: { kind?: string };
}

/**
 * Flatten a session-surface event list into the sanitized plain-text
 * trajectory shown to Shadow Minds.
 *
 * - user-role messages become `USER:` / `CONTEXT:` lines (labeled by source);
 * - assistant text becomes `MAIN:` lines;
 * - tool calls become `TOOL: name({ key: [redacted] })` lines with their
 *   result summary appended after ` · ` (correlated by call id);
 * - reasoning blocks, raw tool-result content, and non-text blocks are skipped;
 * - a tool result without a matching call in the window becomes its own
 *   `TOOL RESULT:` line.
 */
export function serializeTrajectory(events: readonly TrajectoryEventLike[]): string {
  const toolNames = new Map<string, string>();
  const toolCalls = new Map<string, string>();
  const toolResults = new Map<string, string>();

  for (const event of events) {
    if (event.type === "assistant/message") {
      const message = messageOf(event);
      for (const block of blocksOf(message)) {
        if (block.type !== "tool-call" || typeof block.id !== "string") continue;
        const name = String(block.name ?? "");
        toolNames.set(block.id, name);
        toolCalls.set(block.id, summarizeToolCall(name, block.arguments));
      }
    } else if (event.type === "tool/result") {
      const block = firstToolResultBlock(messageOf(event));
      if (!block || typeof block.toolCallId !== "string") continue;
      toolResults.set(
        block.toolCallId,
        summarizeToolResult({
          toolName: toolNames.get(block.toolCallId),
          content: Array.isArray(block.content) ? block.content : undefined,
          isError: block.isError,
        }),
      );
    }
  }

  const lines: string[] = [];
  for (const event of events) {
    const message = messageOf(event);
    if (event.type === "assistant/message") {
      for (const block of blocksOf(message)) {
        if (block.type === "text" && block.text) {
          lines.push(`MAIN: ${block.text}`);
        } else if (block.type === "tool-call" && typeof block.id === "string") {
          const call = toolCalls.get(block.id) ?? `${String(block.name ?? "")}()`;
          const result = toolResults.get(block.id);
          lines.push(`TOOL: ${call}${result ? ` · ${result}` : ""}`);
        }
        // reasoning and unknown blocks are deliberately skipped.
      }
    } else if (event.type === "user/message") {
      const text = textOf(message.content);
      if (text) lines.push(`${message.source?.kind === "user" ? "USER" : "CONTEXT"}: ${text}`);
    } else if (event.type === "tool/result") {
      const block = firstToolResultBlock(message);
      if (!block || typeof block.toolCallId !== "string") continue;
      if (toolCalls.has(block.toolCallId)) continue;
      const summary = toolResults.get(block.toolCallId);
      if (summary) lines.push(`TOOL RESULT: ${summary}`);
    }
  }
  return lines.join("\n");
}

function messageOf(event: TrajectoryEventLike): MessageLike {
  if (!event || typeof event.data !== "object" || event.data === null) return {};
  const data = event.data as Record<string, unknown>;
  if (event.type === "assistant/message" || event.type === "tool/result") {
    const message = data.message;
    return typeof message === "object" && message !== null ? (message as MessageLike) : {};
  }
  return data as MessageLike;
}

function blocksOf(message: MessageLike): BlockLike[] {
  if (!Array.isArray(message.content)) return [];
  return message.content.filter((block): block is BlockLike =>
    Boolean(block) && typeof block === "object",
  );
}

function firstToolResultBlock(message: MessageLike): BlockLike | undefined {
  for (const block of blocksOf(message)) {
    if (block.type === "tool-result") return block;
  }
  return undefined;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is BlockLike => Boolean(item) && typeof item === "object")
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}