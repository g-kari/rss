/** Only final generated text is eligible for display or caching. */
export function stripAiThinking(text: string): string {
  if (/(?:&lt;|&#0*60;|&#x0*3c;)\/?think\b/i.test(text)) return "";
  // An orphan close, nested block, or truncated opener is ambiguous: fail closed.
  let depth = 0;
  let start = 0;
  let result = "";
  const tags = /<\/?think\b[^>]*>/gi;
  for (const match of text.matchAll(tags)) {
    const closing = match[0].startsWith("</");
    if (closing) {
      if (depth !== 1) return "";
      depth = 0;
      start = match.index! + match[0].length;
    } else {
      if (depth !== 0) return "";
      result += text.slice(start, match.index);
      depth = 1;
    }
  }
  if (depth !== 0 || /<\/?think\b/i.test(text.slice(start))) return "";
  return (result + text.slice(start)).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getAiResponseText(response: unknown): string {
  if (!isRecord(response)) return "";
  if (typeof response.response === "string") return stripAiThinking(response.response);
  const choice = Array.isArray(response.choices) ? response.choices[0] : undefined;
  if (!isRecord(choice) || !isRecord(choice.message)) return "";
  return typeof choice.message.content === "string" ? stripAiThinking(choice.message.content) : "";
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export function getAiUsage(response: unknown): AiUsage | null {
  if (!isRecord(response) || !isRecord(response.usage)) return null;
  const input = response.usage.prompt_tokens;
  const output = response.usage.completion_tokens;
  return typeof input === "number" &&
    Number.isSafeInteger(input) &&
    input >= 0 &&
    typeof output === "number" &&
    Number.isSafeInteger(output) &&
    output >= 0
    ? { inputTokens: input, outputTokens: output }
    : null;
}
