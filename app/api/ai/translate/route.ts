import { withSession } from "@/lib/server-auth";
import { runAiJob } from "@/lib/ai-route-helper";

export async function POST(request: Request) {
  return withSession(({ env, ctx }) =>
    runAiJob(
      request,
      env,
      ctx,
      (plain) => [
        {
          role: "system",
          content:
            "あなたは優秀な翻訳者です。与えられたテキストを自然な日本語に翻訳してください。原文の段落構造や改行を保持してください。",
        },
        {
          role: "user",
          content: `次のテキストを日本語に翻訳してください。翻訳結果のみを返してください。\n\n<text>\n${plain}\n</text>`,
        },
      ],
      "translation",
    ),
  );
}
