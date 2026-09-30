import { NextResponse } from "next/server";
import { withJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { matchesPushAccount, updatePushConfig } from "@/lib/push-config";
import {
  normalizeRecommendationDismissals,
  MAX_RECOMMENDATION_DISMISSALS,
} from "@/lib/recommendation-push";

class RecommendationSyncDisabled extends Error {}

/** Account-scoped, bounded article feedback only; never receives reading history. */
export async function POST(request: Request) {
  return withJsonBody<{ add?: unknown; remove?: unknown; reset?: unknown }>(
    request,
    async ({ body, session, env }) => {
      if (
        !(await matchesPushAccount(
          env.RSS_DATA,
          session.userId,
          request.headers.get("X-RSS-Account-Id"),
        ))
      )
        return apiError("The signed-in account changed", 409, { code: "ACCOUNT_CHANGED" });
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        (body.add !== undefined &&
          (!Array.isArray(body.add) || body.add.length > MAX_RECOMMENDATION_DISMISSALS)) ||
        (body.remove !== undefined &&
          (!Array.isArray(body.remove) ||
            body.remove.length > MAX_RECOMMENDATION_DISMISSALS ||
            body.remove.some(
              (id) => typeof id !== "string" || !/^[\x20-\x7e]{1,256}$/.test(id),
            ))) ||
        (body.reset !== undefined && typeof body.reset !== "boolean")
      )
        return apiError("Invalid recommendation feedback", 400, {
          code: "INVALID_RECOMMENDATION_FEEDBACK",
        });
      const now = Date.now();
      const add = normalizeRecommendationDismissals(body.add, now);
      const removed = new Set((body.remove ?? []) as string[]);
      try {
        const config = await updatePushConfig(env.RSS_DATA, session.userId, (current) => {
          if (!current.recommendationEnabled) throw new RecommendationSyncDisabled();
          const previous = body.reset
            ? []
            : normalizeRecommendationDismissals(current.recommendationDismissals, now);
          return {
            ...current,
            recommendationDismissals: normalizeRecommendationDismissals(
              [...add, ...previous].filter((item) => !removed.has(item.articleId)),
              now,
            ),
          };
        });
        return NextResponse.json({
          recommendationDismissals: config.recommendationDismissals ?? [],
        });
      } catch (error) {
        if (error instanceof RecommendationSyncDisabled)
          return apiError("Recommendation feedback sync is disabled", 409, {
            code: "RECOMMENDATION_SYNC_DISABLED",
          });
        throw error;
      }
    },
  );
}
