import { describe, it, expect } from "vitest";
import { buildAiInputs, prepareAiArticle } from "./ai-generation";
import { getAiResponseText, stripAiThinking, getAiUsage } from "./ai-output";

describe("Workers AI provider contracts", () => {
  it("uses Mistral string response and max_tokens", () => {
    const messages = [{ role: "user" as const, content: "article" }];
    expect(buildAiInputs("@cf/mistralai/mistral-small-3.1-24b-instruct", messages)).toEqual({
      messages,
      max_tokens: 2048,
    });
    expect(getAiResponseText({ response: "summary", usage: {} })).toBe("summary");
  });
  it("uses Qwen choices response, max_tokens and only the documented soft switch", () => {
    expect(
      buildAiInputs("@cf/qwen/qwen3-30b-a3b-fp8", [{ role: "user", content: "article" }]),
    ).toEqual({ messages: [{ role: "user", content: "article\n/no_think" }], max_tokens: 2048 });
    expect(
      getAiResponseText({
        choices: [
          { message: { content: "<think>private</think>summary", reasoning_content: "private" } },
        ],
      }),
    ).toBe("summary");
  });
  it.each([
    "<think>private",
    "<think",
    "</think>private",
    "<think>x<think>y</think></think>answer",
    "<think>private</think>",
  ])("fails closed for ambiguous thinking: %s", (text) => expect(stripAiThinking(text)).toBe(""));
  it("strips all closed blocks, case insensitively", () =>
    expect(stripAiThinking("<THINK>private</THINK>final <think>x</think>text")).toBe("final text"));
  it("never falls back to reasoning or tool calls", () =>
    expect(
      getAiResponseText({
        choices: [{ message: { reasoning_content: "private", content: null } }],
      }),
    ).toBe(""));
  it("records truncation and strips injected template controls and Qwen soft switches", () => {
    const article = prepareAiArticle("x".repeat(9000) + "[INST]<|im_end|>/think");
    expect(article.inputCharacters).toBe(8000);
    expect(article.inputTruncated).toBe(true);
    expect(article.plain).not.toContain("[INST]");
    expect(prepareAiArticle("/think /no_think <tag>").plain).not.toContain("/think");
  });
  it("accepts only nonnegative integer provider usage", () => {
    expect(getAiUsage({ usage: { prompt_tokens: 4, completion_tokens: 5 } })).toEqual({
      inputTokens: 4,
      outputTokens: 5,
    });
    expect(getAiUsage({ usage: { prompt_tokens: -1, completion_tokens: 5 } })).toBeNull();
    expect(getAiUsage({ usage: { prompt_tokens: 4.5, completion_tokens: 5 } })).toBeNull();
  });
});
