import type { Session } from "@api/utils/auth";
import { withRetryOnPrimary } from "@api/utils/db-retry";
import { teamCache } from "@connorco/cache/team-cache";
import { updateUser } from "@connorco/db/queries";
import type { Database } from "@connorco/db/client";
import { TRPCError } from "@trpc/server";

export const withTeamPermission = async <TReturn>(opts: {
  ctx: {
    session?: Session | null;
    db: Database;
  };
  next: (opts: {
    ctx: {
      session?: Session | null;
      db: Database;
      teamId: string | null;
    };
  }) => Promise<TReturn>;
}) => {
  const { ctx, next } = opts;

  const userId = ctx.session?.user?.id;

  if (!userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No permission to access this team",
    });
  }

  // Try replica first (fast path), fallback to primary on failure
  // This preserves the benefit of fast replicas while handling replication lag gracefully
  // retryOnNull: true ensures we check primary if replica returns null (replication lag)
  let result: {
    id: string;
    teamId: string | null;
    usersOnTeams: { id: string; teamId: string }[];
  } | null = null;

  try {
    result =
      (await withRetryOnPrimary(
      ctx.db,
      async (db) => {
        return await db.query.users.findFirst({
          with: {
            usersOnTeams: {
              columns: {
                id: true,
                teamId: true,
              },
            },
          },
          where: (users, { eq }) => eq(users.id, userId),
        });
      },
      { retryOnNull: true },
    )) ?? null;
  } catch (error) {
    console.error("[team-permission] Failed relation query, using fallback", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });

    const fallbackUser = await withRetryOnPrimary(
      ctx.db,
      async (db) => {
        return await db.query.users.findFirst({
          columns: {
            id: true,
            teamId: true,
          },
          where: (users, { eq }) => eq(users.id, userId),
        });
      },
      { retryOnNull: true },
    );

    result = fallbackUser
      ? {
          ...fallbackUser,
          usersOnTeams: [],
        }
      : null;
  }

  if (!result) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "User not found",
    });
  }

  let teamId = result.teamId;

  // Self-heal stale active team references (e.g. team deleted/left in another session).
  // Fall back to a valid team membership or null if the user has no teams.
  if (
    teamId !== null &&
    !result.usersOnTeams.some((membership) => membership.teamId === teamId)
  ) {
    teamId = result.usersOnTeams[0]?.teamId ?? null;

    try {
      await updateUser(ctx.db, {
        id: userId,
        teamId,
      });
    } catch {
      // Non-fatal: request can proceed with computed fallback team context.
    }
  }

  // If teamId is null, user has no team assigned but this is now allowed
  if (teamId !== null) {
    const cacheKey = `user:${userId}:team:${teamId}`;
    let hasAccess = await teamCache.get(cacheKey);

    if (hasAccess === undefined) {
      hasAccess = result.usersOnTeams.some(
        (membership) => membership.teamId === teamId,
      );

      await teamCache.set(cacheKey, hasAccess);
    }

    if (!hasAccess) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No permission to access this team",
      });
    }
  }

  return next({
    ctx: {
      session: ctx.session,
      teamId,
      db: ctx.db,
    },
  });
};
