import "server-only";
import { getFigmaToken } from "@/lib/storage/settings";
import { HttpFigmaClient, type FigmaClient } from "./client";
import { FigmaError } from "./errors";

/** A client using the saved token. Throws FigmaError("no_token") when none is saved. */
export async function getFigmaClient(): Promise<FigmaClient> {
  const token = await getFigmaToken();
  if (!token) throw new FigmaError("no_token");
  return new HttpFigmaClient(token);
}
