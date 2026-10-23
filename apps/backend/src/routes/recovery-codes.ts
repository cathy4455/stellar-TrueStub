/**
 * 2FA recovery codes (#266).
 *
 * POST /api/auth/recovery-codes
 *   Authenticated. Generates a fresh set of one-time recovery codes for the
 *   caller (replacing any old ones) and returns them once. Only SHA-256
 *   hashes are stored.
 *
 * POST /api/auth/recovery-codes/redeem  { email, code }
 *   Unauthenticated (the user is stuck at the 2FA challenge). Consumes a
 *   matching unused code and removes the user's second factor so they can
 *   sign in with their password and set up 2FA again.
 *
 * Both are mounted under /api/auth, so the auth rate limiter applies.
 */
import { createHash, randomBytes } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { firebaseAuth } from "../lib/firebase-admin";
import { hasuraRequest } from "../lib/hasura";
import { requireAuth } from "../middleware/auth";

export const recoveryCodesRouter = Router();

const CODE_COUNT = 10;

function generateCode(): string {
  // e.g. "a1b2c-3d4e5"
  const hex = randomBytes(5).toString("hex");
  return `${hex.slice(0, 5)}-${hex.slice(5)}`;
}

function hashCode(code: string): string {
  const normalized = code.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}

const REPLACE_CODES = `
  mutation ReplaceRecoveryCodes($userId: String!, $objects: [mfa_recovery_codes_insert_input!]!) {
    delete_mfa_recovery_codes(where: { user_id: { _eq: $userId } }) { affected_rows }
    insert_mfa_recovery_codes(objects: $objects) { affected_rows }
  }
`;

const USE_CODE = `
  mutation UseRecoveryCode($userId: String!, $codeHash: String!, $usedAt: timestamptz!) {
    update_mfa_recovery_codes(
      where: { user_id: { _eq: $userId }, code_hash: { _eq: $codeHash }, used_at: { _is_null: true } }
      _set: { used_at: $usedAt }
    ) { affected_rows }
  }
`;

recoveryCodesRouter.post("/", requireAuth, async (_req, res) => {
  const userId = (res.locals.user as { uid: string }).uid;
  const codes = Array.from({ length: CODE_COUNT }, generateCode);

  try {
    await hasuraRequest(REPLACE_CODES, {
      userId,
      objects: codes.map((code) => ({ user_id: userId, code_hash: hashCode(code) })),
    });
  } catch (error) {
    console.error("recovery-codes: failed to store codes", error);
    return res.status(502).json({ error: "Failed to generate recovery codes" });
  }

  return res.status(201).json({ codes });
});

const redeemSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1).max(64),
});

recoveryCodesRouter.post("/redeem", async (req, res) => {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request" });
  }

  const invalid = () => res.status(400).json({ error: "Invalid recovery code" });

  let uid: string;
  try {
    uid = (await firebaseAuth.getUserByEmail(parsed.data.email)).uid;
  } catch {
    return invalid();
  }

  try {
    const result = await hasuraRequest<{ update_mfa_recovery_codes: { affected_rows: number } }>(
      USE_CODE,
      { userId: uid, codeHash: hashCode(parsed.data.code), usedAt: new Date().toISOString() },
    );
    if (!result.update_mfa_recovery_codes?.affected_rows) {
      return invalid();
    }

    // Remove the lost authenticator so the user can sign in with their password.
    await firebaseAuth.updateUser(uid, { multiFactor: { enrolledFactors: null } });
  } catch (error) {
    console.error("recovery-codes: redeem failed", error);
    return res.status(502).json({ error: "Failed to redeem recovery code" });
  }

  return res.json({ success: true });
});
