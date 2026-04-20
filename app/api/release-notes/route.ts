import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { RELEASE_NOTES_MARKDOWN } from "@/lib/release-notes-data";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function splitSections(markdown: string): string[] {
  const lines = markdown.split("\n");
  const sections: string[] = [];
  let current: string[] = [];
  let headerSkipped = false;

  for (const line of lines) {
    if (line.startsWith("## ") && headerSkipped) {
      if (current.length > 0) {
        sections.push(current.join("\n").trim());
      }
      current = [line];
    } else if (line.startsWith("# ") && !headerSkipped) {
      headerSkipped = true;
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    sections.push(current.join("\n").trim());
  }
  return sections;
}

export async function GET(request: Request) {
  return withSession(request, async () => {
    const url = new URL(request.url);
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
    );

    const sections = splitSections(RELEASE_NOTES_MARKDOWN);
    const total = sections.length;
    const page = sections.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return NextResponse.json({
      content: page.join("\n\n"),
      total,
      offset,
      limit,
      hasMore,
    });
  });
}
