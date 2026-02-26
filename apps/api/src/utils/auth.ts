import { createAdminClient } from "@api/services/supabase";
import { type JWTPayload, jwtVerify } from "jose";

export type Session = {
  user: {
    id: string;
    email?: string;
    full_name?: string;
  };
  teamId?: string;
};

type SupabaseJWTPayload = JWTPayload & {
  user_metadata?: {
    email?: string;
    full_name?: string;
    [key: string]: string | undefined;
  };
};

export async function verifyAccessToken(
  accessToken?: string,
): Promise<Session | null> {
  if (!accessToken) return null;

  const mapPayloadToSession = (payload: SupabaseJWTPayload): Session => ({
    user: {
      id: payload.sub!,
      email: payload.user_metadata?.email,
      full_name: payload.user_metadata?.full_name,
    },
  });

  try {
    const { payload } = await jwtVerify(
      accessToken,
      new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET),
    );

    return mapPayloadToSession(payload as SupabaseJWTPayload);
  } catch {
    // Fallback for environments where local JWT config drifts from the active
    // Supabase Auth signer. This keeps API auth in sync with live Supabase.
    try {
      const supabase = await createAdminClient();
      const {
        data: { user },
      } = await supabase.auth.getUser(accessToken);

      if (!user) {
        return null;
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          full_name:
            (user.user_metadata?.full_name as string | undefined) ??
            (user.user_metadata?.name as string | undefined),
        },
      };
    } catch {
      return null;
    }
  }
}
