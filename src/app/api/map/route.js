import {
  buildMapPayload,
  getRobotDebugSources,
  readRealtimeDebugFrame,
} from "@/lib/robotDebugData";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const frame = await readRealtimeDebugFrame();
    return Response.json(
      buildMapPayload({
        snapshot: frame.current,
        history: frame.history,
        fileUpdatedAt: frame.fileUpdatedAt,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load map",
        sources: getRobotDebugSources(),
      },
      { status: 500 },
    );
  }
}
