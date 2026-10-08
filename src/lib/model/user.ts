import { z } from "zod";
import { IsoDate, SchemaVersion } from "./common";

export const Role = z.enum(["admin", "viewer"]);
export type Role = z.infer<typeof Role>;

export const Email = z.string().trim().toLowerCase().max(254).email("Enter a valid email address");

export const User = z.object({
  id: z.uuid(),
  email: Email,
  name: z.string().trim().min(1).max(80),
  role: Role,
  passwordHash: z.string().startsWith("scrypt$"),
  disabled: z.boolean(),
  /** Bumped on password, role or status changes; sessions with an older version are rejected. */
  sessionVersion: z.int().min(1),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type User = z.infer<typeof User>;

/** Safe to send to the browser: no password hash. */
export type PublicUser = Pick<User, "id" | "email" | "name" | "role" | "disabled" | "createdAt">;
export const toPublicUser = ({ id, email, name, role, disabled, createdAt }: User): PublicUser => ({
  id,
  email,
  name,
  role,
  disabled,
  createdAt,
});

export const UserFile = z.object({ schemaVersion: SchemaVersion, users: z.array(User) });

export const AuditEntry = z.object({
  ts: IsoDate,
  actor: z.object({ id: z.string(), email: z.string() }).nullable(),
  action: z.string().min(1).max(80),
  target: z
    .object({ type: z.string(), id: z.string().optional(), name: z.string().optional() })
    .optional(),
  details: z.string().max(500).optional(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
