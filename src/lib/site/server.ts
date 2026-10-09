import "server-only";
import { SiteReader } from "./fetch";

/** The reader used by server actions; tests replace this module with a mock. */
export function getSiteReader(): SiteReader {
  return new SiteReader();
}
