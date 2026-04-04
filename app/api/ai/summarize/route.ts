import { withSession } from "@/lib/server-auth";
import { runAiJob } from "@/lib/ai-route-helper";

export async function POST(request: Request) {
  return withSession(({ session, env, ctx }) =>
    runAiJob(request, session, env, ctx, (plain) => [
      {
        role: "system",
        content: "あなたは優秀なニュース編集者です。記事を簡潔に要約してください。",
      },
      {
        role: "user",
        content: `次の記事を日本語で3〜5文に要約してください。要約のみを返してください。\n\n<article>\n${plain}\n</article>`,
      },
    ]),
  );
}
