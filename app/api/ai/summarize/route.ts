import { withSession } from "@/lib/server-auth";
import { runAiJob } from "@/lib/ai-route-helper";
import { buildSummaryMessages } from "@/lib/ai-generation";

/** Explicit article generation; cache-only consumers use /api/ai/summaries/cache. */
export async function POST(request: Request) {
  return withSession(request, ({ session, env, ctx }) =>
    runAiJob(request, session, env, ctx, buildSummaryMessages),
  );
}
