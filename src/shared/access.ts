import { z } from "zod";
import { memberIdSchema, personIdSchema } from "./values";

/**
 * Requests and answers of signing in and of the members of a family, for the Worker and the browser.
 * Each request is strict. A refusal is a code.
 */

/** The pages of signing in and of the members: the Worker serves the app at them. */
export const ACCESS_PAGES = ["/setup", "/join", "/sign-in", "/family", "/account"] as const;
export type AccessPage = (typeof ACCESS_PAGES)[number];

export const roleSchema = z.enum(["reader", "editor", "keeper"]);

/** 256 bits in base64url, from after the "#" of a link. */
export const secretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

/** What a person calls themselves or their family: never empty, never a page long. */
const nameSchema = z.string().trim().min(1).max(200);

/** What a browser answered a passkey with. Its parts are checked by WebAuthn, not here. */
export const passkeyAnswerSchema = z.object({
  id: z.string().min(1).max(1_000),
  rawId: z.string().min(1).max(1_000),
  type: z.literal("public-key"),
  response: z.record(z.string(), z.unknown()),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  authenticatorAttachment: z.string().optional(),
});

/** A step of signing in, answered: the token of the step and what the browser said. */
export const answerInput = z.strictObject({
  flow: secretSchema,
  response: passkeyAnswerSchema,
  /** What the member calls the device: "phone", "laptop". */
  label: z.string().max(100).optional(),
});

/** One more passkey: what the browser made, and the proof by a passkey of the account. */
export const addInput = answerInput.extend({ proof: passkeyAnswerSchema });

export const setupInput = z.strictObject({
  code: z.string().min(1).max(500),
  family: nameSchema,
  name: nameSchema,
});

export const invitationInput = z.strictObject({ secret: secretSchema });

export const registerInput = z.strictObject({
  secret: secretSchema,
  /** For somebody new; a recovery link knows whose account it is. */
  name: nameSchema.optional(),
});

export const bindInput = z.strictObject({
  secret: secretSchema,
  name: nameSchema.optional(),
  label: z.string().max(100),
});

export const inviteInput = z.strictObject({ role: roleSchema, person: personIdSchema.nullable() });

/** The version of the member the keeper saw. */
export const roleInput = z.strictObject({ role: roleSchema, version: z.int().nonnegative() });
export const versionInput = z.strictObject({ version: z.int().nonnegative() });

/** Who is signed in. */
export const sessionAnswer = z.strictObject({
  member: memberIdSchema,
  name: z.string(),
  role: roleSchema,
  person: personIdSchema.nullable(),
  family: z.string().nullable(),
  /** What signed in this browser: a passkey, or the browser itself, linked by a reader. */
  via: z.enum(["passkey", "device"]),
});

/** What an invitation is, and nothing more. */
export const invitationAnswer = z.strictObject({
  kind: z.enum(["join", "recovery"]),
  role: roleSchema,
  family: z.string().nullable(),
  /** Whether whom it lets in may link this browser instead of making a passkey. */
  canLink: z.boolean(),
});

const credentialAnswer = z.strictObject({
  id: z.string(),
  member: memberIdSchema,
  kind: z.enum(["passkey", "device"]),
  label: z.string(),
  createdAt: z.int(),
  lastUsedAt: z.int(),
  revokedAt: z.int().nullable(),
});

/** One's own account, as the browser gets it: what one signs in with, without any key. */
export const accountAnswer = z.strictObject({
  member: z.strictObject({
    id: memberIdSchema,
    name: z.string(),
    role: roleSchema,
    person: personIdSchema.nullable(),
    createdAt: z.int(),
    revokedAt: z.int().nullable(),
  }),
  credentials: z.array(credentialAnswer),
  canAddPasskey: z.boolean(),
});

/** The members as a member sees them: a keeper sees credentials and invitations too. */
export const rosterAnswer = z.strictObject({
  members: z.array(
    z.object({
      id: memberIdSchema,
      name: z.string(),
      role: roleSchema,
      version: z.int().optional(),
      person: personIdSchema.nullable().optional(),
      createdAt: z.int().optional(),
      revokedAt: z.int().nullable().optional(),
      credentials: z.array(credentialAnswer).optional(),
    }),
  ),
  invitations: z
    .array(
      z.strictObject({
        id: z.string(),
        role: roleSchema,
        person: personIdSchema.nullable(),
        by: memberIdSchema,
        expiresAt: z.int(),
        spentAt: z.int().nullable(),
        kind: z.enum(["join", "recovery"]),
        member: memberIdSchema.nullable(),
      }),
    )
    .optional(),
});

/** The sign-in log, the newest first. */
export const logAnswer = z.strictObject({
  log: z.array(
    z.strictObject({
      at: z.int(),
      kind: z.enum(["sign-in", "recovery"]),
      member: memberIdSchema,
      credential: z.string().nullable(),
      by: memberIdSchema.nullable(),
      country: z.string().nullable(),
    }),
  ),
});

/** A link to give: its secret goes after the "#" and is shown once. */
export const linkAnswer = z.strictObject({
  id: z.string(),
  secret: secretSchema,
  expiresAt: z.int(),
});

export type SessionAnswer = z.infer<typeof sessionAnswer>;
export type InvitationAnswer = z.infer<typeof invitationAnswer>;
export type AccountAnswer = z.infer<typeof accountAnswer>;
export type RosterAnswer = z.infer<typeof rosterAnswer>;
export type LogAnswer = z.infer<typeof logAnswer>;
export type LinkAnswer = z.infer<typeof linkAnswer>;
