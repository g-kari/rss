import { withSession } from "@/lib/server-auth";
import { runAiJob } from "@/lib/ai-route-helper";

export async function POST(request: Request) {
  return withSession(({ env, ctx }) =>
    runAiJob(request, env, ctx, "translation", (plain) => [
      { role: "system", content: "あなたは優秀な翻訳者です。自然な日本語に翻訳してください。" },
      {
        role: "user",
        content: `次のテキストを自然な日本語に翻訳してください。翻訳のみを返してください。\n\n${plain}`,
      },
    ]),
  );
}
