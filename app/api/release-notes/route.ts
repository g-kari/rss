import { NextResponse } from 'next/server';
import { withSession } from '@/lib/server-auth';
import { RELEASE_NOTES_MARKDOWN } from '@/lib/release-notes-data';

export async function GET() {
  return withSession(async () => {
    return NextResponse.json({ content: RELEASE_NOTES_MARKDOWN });
  });
}
