import "server-only";
import { z } from "zod";
import { ScaffoldTree } from "@/lib/model";
import { treeHasErrors, validateTree, type TreeOptions } from "./validate";

/** Parse and fully validate a tree from the client. Returns the tree or a user-facing error. */
export function checkTree(
  input: unknown,
  options: TreeOptions = {},
): { tree: ScaffoldTree } | { error: string } {
  const parsed = ScaffoldTree.safeParse(input);
  if (!parsed.success) return { error: firstMessage(parsed.error) };
  const issues = validateTree(parsed.data, options);
  if (treeHasErrors(issues)) return { error: issues.find((i) => i.severity === "error")!.message };
  return { tree: parsed.data };
}

export function firstMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid data";
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}
