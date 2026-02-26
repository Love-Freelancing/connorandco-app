import { updateUserSchema } from "@api/schemas/users";
import { resend } from "@api/services/resend";
import { createAdminClient } from "@api/services/supabase";
import { authenticatedProcedure, createTRPCRouter } from "@api/trpc/init";
import { withRetryOnPrimary } from "@api/utils/db-retry";
import { teamCache } from "@connorco/cache/team-cache";
import {
  deleteUser,
  ensureUserProfile,
  getUserById,
  getUserInvites,
  switchUserTeam,
  updateUser,
} from "@connorco/db/queries";
import { generateFileKey } from "@connorco/encryption";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const userRouter = createTRPCRouter({
  me: authenticatedProcedure.query(async ({ ctx: { db, session } }) => {
    try {
      // Cookie-based approach handles replication lag for new users via x-force-primary header
      // Retry logic still handles connection errors/timeouts
      let result = await withRetryOnPrimary(db, async (dbInstance) =>
        getUserById(dbInstance, session.user.id),
      );

      if (!result) {
        result = await ensureUserProfile(db, {
          id: session.user.id,
          email: session.user.email ?? null,
          fullName: session.user.full_name ?? null,
        });
      }

      if (!result) {
        return undefined;
      }

      return {
        ...result,
        fileKey: result.teamId ? await generateFileKey(result.teamId) : null,
      };
    } catch (error) {
      console.error("[user.me] Falling back to session profile", {
        userId: session.user.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        id: session.user.id,
        fullName: session.user.full_name ?? null,
        email: session.user.email ?? null,
        avatarUrl: null,
        locale: "en",
        timeFormat: 24,
        dateFormat: null,
        weekStartsOnMonday: false,
        timezone: null,
        timezoneAutoSync: true,
        teamId: null,
        team: null,
        fileKey: null,
      };
    }
  }),

  update: authenticatedProcedure
    .input(updateUserSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      return updateUser(db, {
        id: session.user.id,
        ...input,
      });
    }),

  switchTeam: authenticatedProcedure
    .input(z.object({ teamId: z.string().uuid() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      let result: Awaited<ReturnType<typeof switchUserTeam>>;

      try {
        result = await switchUserTeam(db, {
          userId: session.user.id,
          teamId: input.teamId,
        });
      } catch {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this team",
        });
      }

      try {
        await Promise.all([
          result.previousTeamId
            ? teamCache.delete(
                `user:${session.user.id}:team:${result.previousTeamId}`,
              )
            : Promise.resolve(),
          teamCache.delete(`user:${session.user.id}:team:${input.teamId}`),
        ]);
      } catch {
        // Non-fatal — cache will expire naturally
      }

      return result;
    }),

  delete: authenticatedProcedure.mutation(async ({ ctx: { db, session } }) => {
    const supabaseAdmin = await createAdminClient();

    const [data] = await Promise.all([
      deleteUser(db, session.user.id),
      supabaseAdmin.auth.admin.deleteUser(session.user.id),
      resend.contacts.remove({
        email: session.user.email!,
        audienceId: process.env.RESEND_AUDIENCE_ID!,
      }),
    ]);

    return data;
  }),

  invites: authenticatedProcedure.query(async ({ ctx: { db, session } }) => {
    if (!session.user.email) {
      return [];
    }

    return getUserInvites(db, session.user.email);
  }),
});
