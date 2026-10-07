import { connection } from "next/server";
import { checkStorage } from "@/lib/storage/files";

export async function GET() {
  await connection();
  try {
    await checkStorage();
    return Response.json({ status: "ok", storage: "ok" });
  } catch {
    // Don't leak filesystem paths or error details to the client.
    return Response.json({ status: "error", storage: "unavailable" }, { status: 503 });
  }
}
