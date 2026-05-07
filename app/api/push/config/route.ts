import { NextResponse } from "next/server";
import { withSession, withJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { r2Get, r2Put, userPushKey } from "@/lib/r2";
import { isValidTimeHHMM, isValidIanaTimezone } from "@/lib/push-silent-hours";
import type { PushConfig } from "@/types";

interface PushConfigUpdate {
  disabledFeeds?: Record<string, boolean>;
  silentStart?: string | null;
  silentEnd?: string | null;
  timezone?: string | null;
  errorNotificationsEnabled?: boolean;
}

/** Push 通知設定を取得する */
export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const config = await r2Get<PushConfig>(env.RSS_DATA, userPushKey(session.userId), {
      subscriptions: [],
    });
    return NextResponse.json({
      disabledFeeds: config.disabledFeeds ?? {},
      silentStart: config.silentStart ?? null,
      silentEnd: config.silentEnd ?? null,
      timezone: config.timezone ?? null,
      errorNotificationsEnabled: config.errorNotificationsEnabled ?? true,
    });
  });
}

/** Push 通知設定を保存する */
export async function PUT(request: Request) {
  return withJsonBody<PushConfigUpdate>(request, async ({ body, session, env }) => {
    if (body.silentStart !== undefined && body.silentStart !== null) {
      if (!isValidTimeHHMM(body.silentStart)) {
        return apiError("Invalid silentStart format (expected HH:MM)", 400, {
          code: "INVALID_SILENT_START",
        });
      }
    }
    if (body.silentEnd !== undefined && body.silentEnd !== null) {
      if (!isValidTimeHHMM(body.silentEnd)) {
        return apiError("Invalid silentEnd format (expected HH:MM)", 400, {
          code: "INVALID_SILENT_END",
        });
      }
    }
    if (body.timezone !== undefined && body.timezone !== null) {
      if (!isValidIanaTimezone(body.timezone)) {
        return apiError("Invalid timezone", 400, { code: "INVALID_TIMEZONE" });
      }
    }

    const key = userPushKey(session.userId);
    const config = await r2Get<PushConfig>(env.RSS_DATA, key, { subscriptions: [] });

    if (body.disabledFeeds !== undefined) {
      config.disabledFeeds = body.disabledFeeds;
    }
    if (body.silentStart !== undefined) {
      if (body.silentStart === null) {
        delete config.silentStart;
      } else {
        config.silentStart = body.silentStart;
      }
    }
    if (body.silentEnd !== undefined) {
      if (body.silentEnd === null) {
        delete config.silentEnd;
      } else {
        config.silentEnd = body.silentEnd;
      }
    }
    if (body.timezone !== undefined) {
      if (body.timezone === null) {
        delete config.timezone;
      } else {
        config.timezone = body.timezone;
      }
    }
    if (body.errorNotificationsEnabled !== undefined) {
      if (typeof body.errorNotificationsEnabled !== "boolean") {
        return apiError("errorNotificationsEnabled must be a boolean", 400, {
          code: "INVALID_ERROR_NOTIFICATIONS",
        });
      }
      config.errorNotificationsEnabled = body.errorNotificationsEnabled;
    }

    await r2Put(env.RSS_DATA, key, config);
    return NextResponse.json({ ok: true });
  });
}
