import { randomUUID } from "node:crypto";
import {
  createCustomerPortalMessageSchema,
  createCustomerSubscriptionCheckoutSchema,
  createPortalAttachmentUploadSchema,
  createPortalMessageSchema,
  createPortalRequestSchema,
  deleteCustomerSchema,
  enrichCustomerSchema,
  getCustomerByIdSchema,
  getCustomerByPortalIdSchema,
  getCustomerInvoiceSummarySchema,
  getCustomerPortalMessagesSchema,
  getCustomerPortalRequestsSchema,
  getCustomersSchema,
  getPortalAssetsSchema,
  getPortalInvoicesSchema,
  getPortalManageSubscriptionUrlSchema,
  getPortalMessagesSchema,
  getPortalRequestsSchema,
  reorderPortalRequestsSchema,
  sendPortalLoginLinkSchema,
  toggleCustomerPortalSchema,
  updateCustomerPortalRequestSchema,
  upsertCustomerSchema,
  verifyPortalAccessSchema,
} from "@api/schemas/customers";
import { resend } from "@api/services/resend";
import { createAdminClient } from "@api/services/supabase";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@api/trpc/init";
import type { Session } from "@api/utils/auth";
import { api as polarApi } from "@api/utils/polar";
import {
  clearCustomerEnrichment,
  createClientPortalMessage,
  createClientRequest,
  deleteCustomer,
  getClientPortalMessages,
  getClientRequests,
  getCustomerById,
  getCustomerByPortalId,
  getCustomerInvoiceSummary,
  getCustomerPortalAssets,
  getCustomerPortalInvoices,
  getCustomers,
  reorderClientBacklogRequests,
  toggleCustomerPortal,
  updateClientRequest,
  updateCustomerEnrichmentStatus,
  upsertCustomer,
} from "@connorco/db/queries";
import { PortalLoginLinkEmail } from "@connorco/email/emails/portal-login-link";
import { render } from "@connorco/email/render";
import { triggerJob } from "@connorco/job-client";
import { createLoggerWithContext } from "@connorco/logger";
import { signedUrl } from "@connorco/supabase/storage";
import { TRPCError } from "@trpc/server";

const logger = createLoggerWithContext("trpc:customers");

type CustomerOfferPlan =
  | "webflow_sprint"
  | "custom_mvp"
  | "dedicated_partner_monthly"
  | "dedicated_partner_quarterly"
  | "dedicated_partner_annual"
  | "white_label_agency";

const CUSTOMER_OFFER_CATALOG: Record<
  CustomerOfferPlan,
  {
    name: string;
    defaultPrice: string;
    cadence: "one_off" | "monthly" | "quarterly" | "annual";
    envVar: string;
  }
> = {
  webflow_sprint: {
    name: "Webflow Sprint",
    defaultPrice: "$3,000+",
    cadence: "one_off",
    envVar: "POLAR_PRODUCT_WEBFLOW_SPRINT",
  },
  custom_mvp: {
    name: "Custom MVP",
    defaultPrice: "$8,000-$15,000+",
    cadence: "one_off",
    envVar: "POLAR_PRODUCT_CUSTOM_MVP",
  },
  dedicated_partner_monthly: {
    name: "Dedicated Partner",
    defaultPrice: "$2,500/mo",
    cadence: "monthly",
    envVar: "POLAR_PRODUCT_DEDICATED_PARTNER_MONTHLY",
  },
  dedicated_partner_quarterly: {
    name: "Dedicated Partner",
    defaultPrice: "$6,750/quarter",
    cadence: "quarterly",
    envVar: "POLAR_PRODUCT_DEDICATED_PARTNER_QUARTERLY",
  },
  dedicated_partner_annual: {
    name: "Dedicated Partner",
    defaultPrice: "$25,000/year",
    cadence: "annual",
    envVar: "POLAR_PRODUCT_DEDICATED_PARTNER_ANNUAL",
  },
  white_label_agency: {
    name: "White-Label Agency Work",
    defaultPrice: "$3,000+",
    cadence: "one_off",
    envVar: "POLAR_PRODUCT_WHITE_LABEL_AGENCY",
  },
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function sanitizePortalFileName(fileName: string) {
  const baseName = fileName
    .replace(/[\\/]/g, "_")
    .replace(/[^\w.\-() ]+/g, "_")
    .trim();

  return baseName.length > 0 ? baseName : "attachment";
}

function getPgErrorDetails(error: unknown): {
  code: string;
  message?: string;
  detail?: string;
} | null {
  let current: unknown = error;

  for (let depth = 0; depth < 8 && current; depth++) {
    if (typeof current === "object" && current !== null) {
      const maybeCode = (current as { code?: unknown }).code;

      if (typeof maybeCode === "string") {
        const maybeMessage = (current as { message?: unknown }).message;
        const maybeDetail = (current as { detail?: unknown }).detail;

        return {
          code: maybeCode,
          message: typeof maybeMessage === "string" ? maybeMessage : undefined,
          detail: typeof maybeDetail === "string" ? maybeDetail : undefined,
        };
      }

      current = (current as { cause?: unknown }).cause;
      continue;
    }

    break;
  }

  return null;
}

function getErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 8 && current; depth++) {
    if (typeof current === "object" && current !== null) {
      const maybeMessage = (current as { message?: unknown }).message;
      const maybeDetail = (current as { detail?: unknown }).detail;
      const maybeHint = (current as { hint?: unknown }).hint;
      const maybeConstraint = (current as { constraint?: unknown }).constraint;

      if (typeof maybeMessage === "string") parts.push(maybeMessage);
      if (typeof maybeDetail === "string") parts.push(maybeDetail);
      if (typeof maybeHint === "string") parts.push(maybeHint);
      if (typeof maybeConstraint === "string") parts.push(maybeConstraint);

      current = (current as { cause?: unknown }).cause;
      continue;
    }

    break;
  }

  return parts.join(" | ").toLowerCase();
}

function mapPortalMessageInsertError(error: unknown): TRPCError | null {
  const pgError = getPgErrorDetails(error);
  if (pgError) {
    const { code } = pgError;

    if (code === "42P01") {
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Portal messages table is missing. Run database migration 0027_add_client_portal_messages.sql.",
      });
    }

    if (code === "22P02") {
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid request ID format for message association.",
      });
    }
  }

  return null;
}

function mapPortalRequestInsertError(error: unknown): TRPCError | null {
  const pgError = getPgErrorDetails(error);
  const errorText = getErrorText(error);
  if (pgError) {
    const { code } = pgError;

    if (code === "42P01") {
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Client requests table is missing. Run database migration 0025_add_client_requests.sql.",
      });
    }

    if (code === "42703") {
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Client request columns are missing. Run database migrations 0026_add_client_request_attachments.sql and 0031_add_client_request_resources.sql.",
      });
    }

    if (code === "23505") {
      return new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Only one request can be active at a time. Move the current active request back to backlog or completed first.",
      });
    }

    if (code === "23503") {
      return new TRPCError({
        code: "NOT_FOUND",
        message:
          "Customer or team record was not found while creating the request.",
      });
    }

    if (code === "42501") {
      return new TRPCError({
        code: "FORBIDDEN",
        message:
          "Database policy denied creating this request. Check client_requests RLS policy for API/server role access.",
      });
    }

    if (code === "25006") {
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Database is in read-only mode for this connection. Verify DATABASE_PRIMARY_URL points to a writable primary.",
      });
    }
  }

  if (
    errorText.includes("row-level security policy") ||
    errorText.includes("permission denied for table client_requests")
  ) {
    return new TRPCError({
      code: "FORBIDDEN",
      message:
        "Database policy denied creating this request. Check client_requests RLS policy for API/server role access.",
    });
  }

  if (
    errorText.includes("read-only transaction") ||
    errorText.includes("cannot execute insert in a read-only transaction")
  ) {
    return new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Database is in read-only mode for this connection. Verify DATABASE_PRIMARY_URL points to a writable primary.",
    });
  }

  return null;
}

function mapPortalRequestReadError(error: unknown): TRPCError | null {
  const pgError = getPgErrorDetails(error);
  if (pgError) {
    const { code } = pgError;

    if (code === "42P01") {
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Client requests table is missing. Run database migration 0025_add_client_requests.sql.",
      });
    }

    if (code === "42703") {
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Client request columns are missing. Run database migrations 0026_add_client_request_attachments.sql and 0031_add_client_request_resources.sql.",
      });
    }
  }

  return null;
}

function mapPortalMessageReadError(error: unknown): TRPCError | null {
  const pgError = getPgErrorDetails(error);
  if (pgError) {
    const { code } = pgError;

    if (code === "42P01") {
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Portal messages table is missing. Run database migration 0027_add_client_portal_messages.sql.",
      });
    }
  }

  return null;
}

type PortalAttachment = {
  name: string;
  path: string[];
  size: number;
  type: string;
};

const PORTAL_ATTACHMENT_FOLDERS = new Set([
  "portal-requests",
  "portal-messages",
  "messages",
]);

function sanitizePortalAttachments(
  attachments: PortalAttachment[] | undefined,
  customer: {
    teamId: string;
    id: string;
  },
) {
  return (attachments ?? [])
    .filter((attachment) => {
      const [teamId, scope, customerId, folder] = attachment.path;

      return (
        teamId === customer.teamId &&
        scope === "customers" &&
        customerId === customer.id &&
        Boolean(folder && PORTAL_ATTACHMENT_FOLDERS.has(folder))
      );
    })
    .slice(0, 10);
}

async function withSignedAttachments<
  T extends { attachments?: PortalAttachment[] | null },
>(supabase: Parameters<typeof signedUrl>[0], records: T[]) {
  return Promise.all(
    records.map(async (record) => {
      const signedAttachments = await Promise.all(
        (record.attachments ?? []).map(async (attachment) => {
          const path = attachment.path?.join("/");

          if (!path) {
            return {
              ...attachment,
              downloadUrl: null,
            };
          }

          const { data: signedUrlData } = await signedUrl(supabase, {
            bucket: "vault",
            path,
            expireIn: 60 * 30,
            options: { download: true },
          });

          return {
            ...attachment,
            downloadUrl: signedUrlData?.signedUrl ?? null,
          };
        }),
      );

      return {
        ...record,
        attachments: signedAttachments,
      };
    }),
  );
}

async function requirePortalAccess(
  db: Parameters<typeof getCustomerByPortalId>[0],
  input: { portalId: string },
  session: Session | null,
) {
  const customer = await getCustomerByPortalId(db, {
    portalId: input.portalId,
  });

  if (!customer) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Customer portal not found",
    });
  }

  const customerEmail = customer.email ? normalizeEmail(customer.email) : null;
  const sessionEmail = session?.user.email
    ? normalizeEmail(session.user.email)
    : null;

  if (!customerEmail || !sessionEmail || customerEmail !== sessionEmail) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Signed-in email does not match the customer email on file",
    });
  }

  return customer;
}

export const customersRouter = createTRPCRouter({
  get: protectedProcedure
    .input(getCustomersSchema.optional())
    .query(async ({ ctx: { teamId, db }, input }) => {
      return getCustomers(db, {
        teamId: teamId!,
        ...input,
      });
    }),

  getById: protectedProcedure
    .input(getCustomerByIdSchema)
    .query(async ({ ctx: { db, teamId }, input }) => {
      return getCustomerById(db, {
        id: input.id,
        teamId: teamId!,
      });
    }),

  delete: protectedProcedure
    .input(deleteCustomerSchema)
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      return deleteCustomer(db, {
        id: input.id,
        teamId: teamId!,
      });
    }),

  upsert: protectedProcedure
    .input(upsertCustomerSchema)
    .mutation(async ({ ctx: { db, teamId, session }, input }) => {
      const isNewCustomer = !input.id;

      const customer = await upsertCustomer(db, {
        ...input,
        teamId: teamId!,
        userId: session.user.id,
      });

      // Auto-trigger enrichment for new customers with a website
      if (isNewCustomer && customer?.website && customer?.id) {
        try {
          // Set status to pending first, then trigger job
          await updateCustomerEnrichmentStatus(db, {
            customerId: customer.id,
            status: "pending",
          });

          await triggerJob(
            "enrich-customer",
            {
              customerId: customer.id,
              teamId: teamId!,
            },
            "customers",
          );
        } catch (error) {
          // Log but don't fail the customer creation
          logger.error("Failed to trigger customer enrichment", {
            error: error instanceof Error ? error.message : String(error),
          });
          // Reset status since job wasn't queued
          await updateCustomerEnrichmentStatus(db, {
            customerId: customer.id,
            status: null,
          }).catch(() => {}); // Ignore errors on cleanup
        }
      }

      return customer;
    }),

  getInvoiceSummary: protectedProcedure
    .input(getCustomerInvoiceSummarySchema)
    .query(async ({ ctx: { db, teamId }, input }) => {
      return getCustomerInvoiceSummary(db, {
        customerId: input.id,
        teamId: teamId!,
      });
    }),

  enrich: protectedProcedure
    .input(enrichCustomerSchema)
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      const customer = await getCustomerById(db, {
        id: input.id,
        teamId: teamId!,
      });

      if (!customer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Customer not found",
        });
      }

      if (!customer.website) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Customer has no website - enrichment requires a website",
        });
      }

      // Set status to pending first, then trigger job
      await updateCustomerEnrichmentStatus(db, {
        customerId: customer.id,
        status: "pending",
      });

      await triggerJob(
        "enrich-customer",
        {
          customerId: customer.id,
          teamId: teamId!,
        },
        "customers",
      );

      return { queued: true };
    }),

  cancelEnrichment: protectedProcedure
    .input(enrichCustomerSchema)
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      const customer = await getCustomerById(db, {
        id: input.id,
        teamId: teamId!,
      });

      if (!customer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Customer not found",
        });
      }

      // Reset status to null (no enrichment in progress)
      // The job may still complete in background but UI won't show as processing
      await updateCustomerEnrichmentStatus(db, {
        customerId: customer.id,
        status: null,
      });

      return { cancelled: true };
    }),

  clearEnrichment: protectedProcedure
    .input(enrichCustomerSchema)
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      const customer = await getCustomerById(db, {
        id: input.id,
        teamId: teamId!,
      });

      if (!customer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Customer not found",
        });
      }

      await clearCustomerEnrichment(db, {
        customerId: customer.id,
        teamId: teamId!,
      });

      return { cleared: true };
    }),

  togglePortal: protectedProcedure
    .input(toggleCustomerPortalSchema)
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      const portal = await toggleCustomerPortal(db, {
        customerId: input.customerId,
        teamId: teamId!,
        enabled: input.enabled,
      });

      if (portal?.portalEnabled && portal.portalId) {
        try {
          const customer = await getCustomerByPortalId(db, {
            portalId: portal.portalId,
          });

          const dashboardUrl = process.env.CONNORCO_DASHBOARD_URL?.replace(
            /\/$/,
            "",
          );
          const customerEmail = customer?.email?.trim();

          if (dashboardUrl && customerEmail) {
            const portalUrl = `${dashboardUrl}/client/${portal.portalId}`;
            const teamName = customer?.team?.name?.trim() || "Connor & Co.";
            const customerName = customer?.name?.trim() || "there";

            resend.emails.send({
              from: "Connor & Co <connor@app.connorco.dev>",
              to: customerEmail,
              subject: `Welcome to ${teamName}`,
              html: `<div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.6;background:#f8fafc;padding:28px 16px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
    <p style="margin:0 0 12px;font-size:16px;">Hi ${customerName},</p>
    <p style="margin:0 0 14px;font-size:15px;color:#334155;">
      Welcome to ${teamName}. Your dedicated client portal is ready.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;">
      You can track active sprints, submit requests, and review invoices from one place.
    </p>
    <a href="${portalUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;">
      Access your portal
    </a>
    <p style="margin:20px 0 0;font-size:13px;color:#64748b;">
      For security, the portal uses passwordless email sign-in.
    </p>
  </div>
</div>`,
            });
          }
        } catch (error) {
          logger.error("customers.togglePortal failed to send welcome email", {
            customerId: input.customerId,
            teamId: teamId!,
            errorText: getErrorText(error),
          });
        }
      }

      return portal;
    }),

  createCustomerSubscriptionCheckout: protectedProcedure
    .input(createCustomerSubscriptionCheckoutSchema)
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      const customer = await getCustomerById(db, {
        id: input.customerId,
        teamId: teamId!,
      });

      if (!customer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Customer not found",
        });
      }

      const offer = CUSTOMER_OFFER_CATALOG[input.plan];
      const productId = process.env[offer.envVar];

      if (!productId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Checkout product is not configured for ${offer.name}. Missing ${offer.envVar}.`,
        });
      }

      try {
        const checkout = await polarApi.checkouts.create({
          products: [productId],
          externalCustomerId: `${teamId!}:${customer.id}`,
          customerEmail: customer.email ?? undefined,
          customerName: customer.name ?? undefined,
          customerBillingAddress: customer.countryCode
            ? { country: customer.countryCode as never }
            : undefined,
          metadata: {
            teamId: teamId!,
            customerId: customer.id,
            customerName: customer.name ?? "",
            offerKey: input.plan,
            offerName: offer.name,
            offerCadence: offer.cadence,
            offerPrice: input.requestedPrice ?? offer.defaultPrice,
            source: "freelancer-customer-details",
          },
          embedOrigin: input.embedOrigin,
        });

        return { url: checkout.url };
      } catch (error) {
        logger.error("customers.createCustomerSubscriptionCheckout failed", {
          teamId,
          customerId: customer.id,
          plan: input.plan,
          errorText: getErrorText(error),
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Unable to create subscription checkout right now. Please try again shortly.",
        });
      }
    }),

  getByPortalId: publicProcedure
    .input(getCustomerByPortalIdSchema)
    .query(async ({ ctx: { db }, input }) => {
      const customer = await getCustomerByPortalId(db, {
        portalId: input.portalId,
      });

      if (!customer) {
        return null;
      }

      // Get invoice summary
      const summary = await getCustomerInvoiceSummary(db, {
        customerId: customer.id,
        teamId: customer.teamId,
      });

      return {
        customer,
        summary,
      };
    }),

  sendPortalLoginLink: publicProcedure
    .input(sendPortalLoginLinkSchema)
    .mutation(async ({ ctx: { db }, input }) => {
      const customer = await getCustomerByPortalId(db, {
        portalId: input.portalId,
      });

      if (!customer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Customer portal not found",
        });
      }

      const customerEmail = customer.email
        ? normalizeEmail(customer.email)
        : "";
      const providedEmail = normalizeEmail(input.email);

      if (!customerEmail || customerEmail !== providedEmail) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Email does not match the customer email on file",
        });
      }

      const dashboardUrl = process.env.CONNORCO_DASHBOARD_URL?.replace(
        /\/$/,
        "",
      );
      if (!dashboardUrl) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Dashboard URL is not configured",
        });
      }

      const portalUrl = `${dashboardUrl}/client/${input.portalId}`;
      const supabaseAdmin = await createAdminClient();
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: providedEmail,
        options: {
          redirectTo: portalUrl,
        },
      });

      if (error || !data.properties?.action_link) {
        logger.error("customers.sendPortalLoginLink failed to generate link", {
          customerId: customer.id,
          teamId: customer.teamId,
          errorText: error?.message ?? "Unknown error",
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to send sign-in link right now",
        });
      }

      const html = await render(
        PortalLoginLinkEmail({
          email: providedEmail,
          teamName: customer.team.name ?? "Connor & Co",
          customerName: customer.name ?? "there",
          portalUrl: data.properties.action_link,
        }),
      );
      await resend.emails.send({
        from: "Connor & Co <connor@app.connorco.dev>",
        to: providedEmail,
        subject: `Sign in to ${customer.team.name ?? "Connor & Co"} portal`,
        html,
      });

      return { sent: true };
    }),

  verifyPortalAccess: publicProcedure
    .input(verifyPortalAccessSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const customer = await requirePortalAccess(db, input, session);

      return {
        email: customer.email,
      };
    }),

  getPortalInvoices: publicProcedure
    .input(getPortalInvoicesSchema)
    .query(async ({ ctx: { db, session }, input }) => {
      const customer = await requirePortalAccess(db, input, session);

      const result = await getCustomerPortalInvoices(db, {
        customerId: customer.id,
        teamId: customer.teamId,
        cursor: input.cursor,
        pageSize: input.pageSize,
      });

      return {
        data: result.data,
        meta: {
          cursor: result.nextCursor,
        },
      };
    }),

  getPortalManageSubscriptionUrl: publicProcedure
    .input(getPortalManageSubscriptionUrlSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const customer = await requirePortalAccess(db, input, session);

      try {
        const result = await polarApi.customerSessions.create({
          externalCustomerId: customer.teamId,
        });

        return {
          url: result.customerPortalUrl,
        };
      } catch (error) {
        logger.error("customers.getPortalManageSubscriptionUrl failed", {
          customerId: customer.id,
          teamId: customer.teamId,
          errorText: getErrorText(error),
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Unable to open subscription management right now. Please try again shortly.",
        });
      }
    }),

  getPortalRequests: publicProcedure
    .input(getPortalRequestsSchema)
    .query(async ({ ctx: { db, session, supabase }, input }) => {
      const customer = await requirePortalAccess(db, input, session);

      let requests: Awaited<ReturnType<typeof getClientRequests>>;
      try {
        requests = await getClientRequests(db, {
          teamId: customer.teamId,
          customerId: customer.id,
        });
      } catch (error) {
        const mapped = mapPortalRequestReadError(error);
        if (mapped) {
          throw mapped;
        }
        throw error;
      }

      const requestsWithAttachments = await withSignedAttachments(
        supabase,
        requests,
      );

      const activeRequest =
        requestsWithAttachments.find(
          (request) =>
            request.status !== "backlog" && request.status !== "completed",
        ) ?? null;
      const backlog = requestsWithAttachments.filter(
        (request) => request.status === "backlog",
      );

      return {
        activeRequest,
        backlog,
        requests: requestsWithAttachments,
      };
    }),

  getPortalMessages: publicProcedure
    .input(getPortalMessagesSchema)
    .query(async ({ ctx: { db, session, supabase }, input }) => {
      const customer = await requirePortalAccess(db, input, session);

      let messages: Awaited<ReturnType<typeof getClientPortalMessages>>;
      try {
        messages = await getClientPortalMessages(db, {
          teamId: customer.teamId,
          customerId: customer.id,
        });
      } catch (error) {
        const mapped = mapPortalMessageReadError(error);
        if (mapped) {
          throw mapped;
        }
        throw error;
      }

      const withAttachments = await withSignedAttachments(supabase, messages);

      return {
        messages: withAttachments.reverse(),
      };
    }),

  createPortalAttachmentUpload: publicProcedure
    .input(createPortalAttachmentUploadSchema)
    .mutation(async ({ ctx: { db, session, supabase }, input }) => {
      const customer = await requirePortalAccess(db, input, session);
      const fileName = sanitizePortalFileName(input.fileName);
      const scopeFolder =
        input.scope === "message" ? "portal-messages" : "portal-requests";
      const filePath = [
        customer.teamId,
        "customers",
        customer.id,
        scopeFolder,
        `${Date.now()}-${randomUUID()}-${fileName}`,
      ];

      try {
        const { data, error } = await supabase.storage
          .from("vault")
          .createSignedUploadUrl(filePath.join("/"), {
            upsert: false,
          });

        if (error || !data?.token) {
          const details = [
            error?.name,
            error?.message,
            error?.statusCode ? `status:${error.statusCode}` : null,
          ]
            .filter(Boolean)
            .join(" | ");
          const detailText = details.toLowerCase();

          logger.error("customers.createPortalAttachmentUpload storage error", {
            customerId: customer.id,
            teamId: customer.teamId,
            path: filePath.join("/"),
            details,
          });

          if (
            detailText.includes("bucket") &&
            detailText.includes("not found")
          ) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message:
                "Storage bucket 'vault' is missing. Start local Supabase and run pending storage migrations.",
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to initialize file upload",
          });
        }

        return {
          path: filePath,
          token: data.token,
        };
      } catch (error) {
        const errorText = getErrorText(error);

        logger.error("customers.createPortalAttachmentUpload exception", {
          customerId: customer.id,
          teamId: customer.teamId,
          path: filePath.join("/"),
          errorText,
          supabaseUrl: process.env.SUPABASE_URL,
        });

        if (
          errorText.includes("local.supabase.co") ||
          errorText.includes("err_name_not_resolved") ||
          errorText.includes("enotfound")
        ) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Supabase URL is unreachable. Set SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL to http://127.0.0.1:54321, then restart API and dashboard.",
          });
        }

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to initialize file upload",
        });
      }
    }),

  createPortalMessage: publicProcedure
    .input(createPortalMessageSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const customer = await requirePortalAccess(db, input, session);
      const attachments = sanitizePortalAttachments(
        input.attachments,
        customer,
      );

      try {
        return createClientPortalMessage(db, {
          teamId: customer.teamId,
          customerId: customer.id,
          requestId: input.requestId?.trim() || null,
          senderType: "client",
          senderName: input.senderName?.trim() || customer.name,
          message: input.message.trim(),
          attachments,
        });
      } catch (error) {
        const mapped = mapPortalMessageInsertError(error);

        if (mapped) {
          throw mapped;
        }

        throw error;
      }
    }),

  createPortalRequest: publicProcedure
    .input(createPortalRequestSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const customer = await requirePortalAccess(db, input, session);
      const attachments = sanitizePortalAttachments(
        input.attachments,
        customer,
      );

      try {
        return createClientRequest(db, {
          teamId: customer.teamId,
          customerId: customer.id,
          title: input.title.trim(),
          details: input.details?.trim() || null,
          requestedBy: input.requestedBy?.trim() || null,
          attachments,
        });
      } catch (error) {
        const pgError = getPgErrorDetails(error);
        logger.error("customers.createPortalRequest database error", {
          code: pgError?.code,
          message: pgError?.message,
          detail: pgError?.detail,
          errorText: getErrorText(error),
          customerId: customer.id,
          teamId: customer.teamId,
        });
        const mapped = mapPortalRequestInsertError(error);

        if (mapped) {
          throw mapped;
        }

        throw error;
      }
    }),

  reorderPortalRequests: publicProcedure
    .input(reorderPortalRequestsSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const customer = await requirePortalAccess(db, input, session);

      const requestIds = await reorderClientBacklogRequests(db, {
        teamId: customer.teamId,
        customerId: customer.id,
        requestIds: input.requestIds,
      });

      return {
        requestIds,
      };
    }),

  getPortalAssets: publicProcedure
    .input(getPortalAssetsSchema)
    .query(async ({ ctx: { db, session, supabase }, input }) => {
      const customer = await requirePortalAccess(db, input, session);

      const assets = await getCustomerPortalAssets(db, {
        teamId: customer.teamId,
        customerId: customer.id,
        pageSize: input.pageSize,
      });

      const data = await Promise.all(
        assets.map(async (asset) => {
          const path = asset.pathTokens?.join("/");

          if (!path) {
            return {
              id: asset.id,
              title: asset.title,
              fileName: asset.name,
              createdAt: asset.createdAt,
              downloadUrl: null,
            };
          }

          const { data: signedUrlData } = await signedUrl(supabase, {
            bucket: "vault",
            path,
            expireIn: 60 * 60,
            options: { download: true },
          });

          return {
            id: asset.id,
            title: asset.title,
            fileName:
              asset.pathTokens?.[asset.pathTokens.length - 1] ||
              asset.name ||
              null,
            createdAt: asset.createdAt,
            downloadUrl: signedUrlData?.signedUrl ?? null,
          };
        }),
      );

      return {
        data,
      };
    }),

  getCustomerPortalMessages: protectedProcedure
    .input(getCustomerPortalMessagesSchema)
    .query(async ({ ctx: { db, teamId, supabase }, input }) => {
      const customer = await getCustomerById(db, {
        id: input.customerId,
        teamId: teamId!,
      });

      if (!customer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Customer not found",
        });
      }

      let messages: Awaited<ReturnType<typeof getClientPortalMessages>>;
      try {
        messages = await getClientPortalMessages(db, {
          teamId: teamId!,
          customerId: input.customerId,
        });
      } catch (error) {
        const mapped = mapPortalMessageReadError(error);
        if (mapped) {
          throw mapped;
        }
        throw error;
      }

      const withAttachments = await withSignedAttachments(supabase, messages);

      return withAttachments.reverse();
    }),

  createCustomerPortalMessage: protectedProcedure
    .input(createCustomerPortalMessageSchema)
    .mutation(async ({ ctx: { db, teamId, session }, input }) => {
      const customer = await getCustomerById(db, {
        id: input.customerId,
        teamId: teamId!,
      });

      if (!customer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Customer not found",
        });
      }

      const attachments = sanitizePortalAttachments(input.attachments, {
        teamId: teamId!,
        id: input.customerId,
      });

      try {
        return createClientPortalMessage(db, {
          teamId: teamId!,
          customerId: input.customerId,
          requestId: input.requestId?.trim() || null,
          senderType: "freelancer",
          senderUserId: session.user.id,
          senderName: session.user.full_name ?? session.user.email ?? "Team",
          message: input.message.trim(),
          attachments,
        });
      } catch (error) {
        const mapped = mapPortalMessageInsertError(error);

        if (mapped) {
          throw mapped;
        }

        throw error;
      }
    }),

  getCustomerPortalRequests: protectedProcedure
    .input(getCustomerPortalRequestsSchema)
    .query(async ({ ctx: { db, teamId, supabase }, input }) => {
      try {
        const requests = await getClientRequests(db, {
          teamId: teamId!,
          customerId: input.customerId,
        });

        return withSignedAttachments(supabase, requests);
      } catch (error) {
        const mapped = mapPortalRequestReadError(error);
        if (mapped) {
          throw mapped;
        }
        throw error;
      }
    }),

  updateCustomerPortalRequest: protectedProcedure
    .input(updateCustomerPortalRequestSchema)
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      try {
        const updated = await updateClientRequest(db, {
          teamId: teamId!,
          customerId: input.customerId,
          requestId: input.requestId,
          status: input.status,
          resources: input.resources,
        });

        if (!updated) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Request not found",
          });
        }

        return updated;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "23505"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Only one request can be active at a time. Move the current active request back to backlog or completed first.",
          });
        }

        throw error;
      }
    }),
});
