import { NextResponse } from "next/server";
import { withSession, withJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { r2Get, userPushKey } from "@/lib/r2";
import { isValidTimeHHMM, isValidIanaTimezone } from "@/lib/push-silent-hours";
import { isValidFeedHash } from "@/lib/validation";
import { MAX_FEEDS_PER_USER } from "@/lib/shared-feed";
import { matchesPushAccount, updatePushConfig } from "@/lib/push-config";
import {
  isRecommendationTime,
  normalizeRecommendationDismissals,
  MAX_RECOMMENDATION_DISMISSALS,
} from "@/lib/recommendation-push";
import type { PushConfig } from "@/types";

interface PushConfigUpdate {
  disabledFeeds?: Record<string, boolean>;
  silentStart?: string | null;
  silentEnd?: string | null;
  timezone?: string | null;
  errorNotificationsEnabled?: boolean;
  recommendationEnabled?: boolean;
  recommendationTime?: string;
  recommendationDismissals?: unknown;
}
class InvalidRecommendationConfig extends Error {}

export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const expectedId = request.headers.get("X-RSS-Account-Id");
    if (
      expectedId !== null &&
      !(await matchesPushAccount(env.RSS_DATA, session.userId, expectedId))
    )
      return apiError("The signed-in account changed", 409, { code: "ACCOUNT_CHANGED" });
    const config = await r2Get<PushConfig>(env.RSS_DATA, userPushKey(session.userId), {
      subscriptions: [],
    });
    return NextResponse.json({
      disabledFeeds: config.disabledFeeds ?? {},
      silentStart: config.silentStart ?? null,
      silentEnd: config.silentEnd ?? null,
      timezone: config.timezone ?? null,
      errorNotificationsEnabled: config.errorNotificationsEnabled ?? true,
      recommendationEnabled: config.recommendationEnabled === true,
      recommendationTime: config.recommendationTime ?? "09:00",
      recommendationDismissals: config.recommendationEnabled
        ? normalizeRecommendationDismissals(config.recommendationDismissals, Date.now())
        : [],
    });
  });
}

export async function PUT(request: Request) {
  return withJsonBody<PushConfigUpdate>(request, async ({ body, session, env }) => {
    if (!body || typeof body !== "object" || Array.isArray(body))
      return apiError("Invalid push configuration", 400, { code: "INVALID_PUSH_CONFIG" });
    const expectedId = request.headers.get("X-RSS-Account-Id");
    const needsBinding =
      body.recommendationEnabled !== undefined ||
      body.recommendationTime !== undefined ||
      body.recommendationDismissals !== undefined;
    if (
      (needsBinding || expectedId !== null) &&
      !(await matchesPushAccount(env.RSS_DATA, session.userId, expectedId))
    )
      return apiError("The signed-in account changed", 409, { code: "ACCOUNT_CHANGED" });
    if (
      body.silentStart != null &&
      (typeof body.silentStart !== "string" || !isValidTimeHHMM(body.silentStart))
    )
      return apiError("Invalid silentStart format (expected HH:MM)", 400, {
        code: "INVALID_SILENT_START",
      });
    if (
      body.silentEnd != null &&
      (typeof body.silentEnd !== "string" || !isValidTimeHHMM(body.silentEnd))
    )
      return apiError("Invalid silentEnd format (expected HH:MM)", 400, {
        code: "INVALID_SILENT_END",
      });
    if (
      body.timezone != null &&
      (typeof body.timezone !== "string" || !isValidIanaTimezone(body.timezone))
    )
      return apiError("Invalid timezone", 400, { code: "INVALID_TIMEZONE" });
    if (
      body.disabledFeeds !== undefined &&
      (!body.disabledFeeds ||
        typeof body.disabledFeeds !== "object" ||
        Array.isArray(body.disabledFeeds))
    )
      return apiError("disabledFeeds must be an object", 400, { code: "INVALID_DISABLED_FEEDS" });
    if (
      body.errorNotificationsEnabled !== undefined &&
      typeof body.errorNotificationsEnabled !== "boolean"
    )
      return apiError("errorNotificationsEnabled must be a boolean", 400, {
        code: "INVALID_ERROR_NOTIFICATIONS",
      });
    if (body.recommendationEnabled !== undefined && typeof body.recommendationEnabled !== "boolean")
      return apiError("recommendationEnabled must be a boolean", 400, {
        code: "INVALID_RECOMMENDATION_CONFIG",
      });
    if (body.recommendationTime !== undefined && !isRecommendationTime(body.recommendationTime))
      return apiError("Choose a half-hour recommendation time", 400, {
        code: "INVALID_RECOMMENDATION_CONFIG",
      });
    if (
      body.recommendationDismissals !== undefined &&
      (!Array.isArray(body.recommendationDismissals) ||
        body.recommendationDismissals.length > MAX_RECOMMENDATION_DISMISSALS)
    )
      return apiError("Invalid recommendation feedback", 400, {
        code: "INVALID_RECOMMENDATION_CONFIG",
      });
    const now = Date.now();
    try {
      await updatePushConfig(env.RSS_DATA, session.userId, (current) => {
        const next: PushConfig = { ...current };
        if (body.disabledFeeds !== undefined)
          next.disabledFeeds = Object.fromEntries(
            Object.entries(body.disabledFeeds)
              .filter(([key, value]) => isValidFeedHash(key) && typeof value === "boolean")
              .slice(0, MAX_FEEDS_PER_USER),
          );
        for (const key of ["silentStart", "silentEnd", "timezone"] as const) {
          if (body[key] === null) delete next[key];
          else if (body[key] !== undefined) next[key] = body[key];
        }
        if (body.errorNotificationsEnabled !== undefined)
          next.errorNotificationsEnabled = body.errorNotificationsEnabled;
        if (body.recommendationEnabled !== undefined)
          next.recommendationEnabled = body.recommendationEnabled;
        if (body.recommendationTime !== undefined)
          next.recommendationTime = body.recommendationTime;
        if (next.recommendationEnabled) {
          next.recommendationTime ??= "09:00";
          if (
            !next.timezone ||
            !isValidIanaTimezone(next.timezone) ||
            !isRecommendationTime(next.recommendationTime)
          )
            throw new InvalidRecommendationConfig(
              "A valid timezone and half-hour time are required",
            );
          if (body.recommendationDismissals !== undefined)
            next.recommendationDismissals = normalizeRecommendationDismissals(
              [
                ...(body.recommendationDismissals as unknown[]),
                ...(current.recommendationDismissals ?? []),
              ],
              now,
            );
        } else if (body.recommendationDismissals !== undefined)
          throw new InvalidRecommendationConfig("Enable recommendations before syncing feedback");
        return next;
      });
    } catch (error) {
      if (error instanceof InvalidRecommendationConfig)
        return apiError(error.message, 400, { code: "INVALID_RECOMMENDATION_CONFIG" });
      throw error;
    }
    return NextResponse.json({ ok: true });
  });
}
