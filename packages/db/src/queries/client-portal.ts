import { and, asc, desc, eq, isNotNull, like, not, sql } from "drizzle-orm";
import type { Database } from "../client";
import { clientPortalMessages, clientRequests, documents } from "../schema";

export type PortalRequestResource = {
  label: string;
  url: string;
};

let ensureClientRequestResourcesColumnPromise: Promise<void> | null = null;

function isMissingClientRequestResourcesColumnError(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : "";

  return (
    errorMessage.includes("client_requests") &&
    errorMessage.includes("resources")
  );
}

async function ensureClientRequestResourcesColumn(db: Database) {
  if (!ensureClientRequestResourcesColumnPromise) {
    ensureClientRequestResourcesColumnPromise = db
      .execute(sql`
        ALTER TABLE "client_requests"
        ADD COLUMN IF NOT EXISTS "resources" jsonb DEFAULT '[]'::jsonb NOT NULL
      `)
      .then(async () => {
        await db.execute(sql`
          UPDATE "client_requests"
          SET "resources" = jsonb_build_array(
            jsonb_build_object(
              'label', 'Live Staging',
              'url', "staging_url"
            )
          )
          WHERE (
            "staging_url" IS NOT NULL
            AND btrim("staging_url") <> ''
            AND (
              "resources" = '[]'::jsonb
              OR "resources" IS NULL
            )
          )
        `);
      })
      .then(() => undefined)
      .catch((error) => {
        ensureClientRequestResourcesColumnPromise = null;
        throw error;
      });
  }

  await ensureClientRequestResourcesColumnPromise;
}

async function withClientRequestResourcesColumn<T>(
  db: Database,
  callback: () => Promise<T>,
) {
  try {
    return await callback();
  } catch (error) {
    if (!isMissingClientRequestResourcesColumnError(error)) {
      throw error;
    }

    await ensureClientRequestResourcesColumn(db);
    return callback();
  }
}

export type GetClientRequestsParams = {
  teamId: string;
  customerId: string;
};

export async function getClientRequests(
  db: Database,
  params: GetClientRequestsParams,
) {
  const { teamId, customerId } = params;

  return withClientRequestResourcesColumn(db, () =>
    db
      .select({
        id: clientRequests.id,
        title: clientRequests.title,
        details: clientRequests.details,
        status: clientRequests.status,
        priority: clientRequests.priority,
        stagingUrl: clientRequests.stagingUrl,
        resources: clientRequests.resources,
        requestedBy: clientRequests.requestedBy,
        attachments: clientRequests.attachments,
        createdAt: clientRequests.createdAt,
        updatedAt: clientRequests.updatedAt,
        completedAt: clientRequests.completedAt,
      })
      .from(clientRequests)
      .where(
        and(
          eq(clientRequests.teamId, teamId),
          eq(clientRequests.customerId, customerId),
        ),
      )
      .orderBy(asc(clientRequests.priority), asc(clientRequests.createdAt)),
  );
}

export type CreateClientRequestParams = {
  teamId: string;
  customerId: string;
  title: string;
  details?: string | null;
  requestedBy?: string | null;
  resources?: PortalRequestResource[];
  attachments?: Array<{
    name: string;
    path: string[];
    size: number;
    type: string;
  }>;
};

export async function createClientRequest(
  db: Database,
  params: CreateClientRequestParams,
) {
  const {
    teamId,
    customerId,
    title,
    details,
    requestedBy,
    resources,
    attachments,
  } = params;

  return withClientRequestResourcesColumn(db, async () => {
    const [priorityResult] = await db
      .select({
        maxPriority: sql<number>`COALESCE(MAX(${clientRequests.priority}), 0)`,
      })
      .from(clientRequests)
      .where(
        and(
          eq(clientRequests.teamId, teamId),
          eq(clientRequests.customerId, customerId),
        ),
      );

    const nextPriority = (priorityResult?.maxPriority ?? 0) + 1;

    const insertValues = {
      teamId,
      customerId,
      title,
      details: details ?? null,
      requestedBy: requestedBy ?? null,
      status: "backlog" as const,
      priority: nextPriority,
      ...(resources ? { resources } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    };

    const [result] = await db
      .insert(clientRequests)
      .values(insertValues)
      .returning({
        id: clientRequests.id,
        title: clientRequests.title,
        details: clientRequests.details,
        status: clientRequests.status,
        priority: clientRequests.priority,
        stagingUrl: clientRequests.stagingUrl,
        resources: clientRequests.resources,
        requestedBy: clientRequests.requestedBy,
        attachments: clientRequests.attachments,
        createdAt: clientRequests.createdAt,
        updatedAt: clientRequests.updatedAt,
        completedAt: clientRequests.completedAt,
      });

    return result;
  });
}

export type ReorderClientBacklogRequestsParams = {
  teamId: string;
  customerId: string;
  requestIds: string[];
};

export async function reorderClientBacklogRequests(
  db: Database,
  params: ReorderClientBacklogRequestsParams,
) {
  const { teamId, customerId, requestIds } = params;

  const existing = await db
    .select({
      id: clientRequests.id,
    })
    .from(clientRequests)
    .where(
      and(
        eq(clientRequests.teamId, teamId),
        eq(clientRequests.customerId, customerId),
        eq(clientRequests.status, "backlog"),
      ),
    )
    .orderBy(asc(clientRequests.priority), asc(clientRequests.createdAt));

  if (!existing.length) {
    return [];
  }

  const allowedIds = new Set(existing.map((item) => item.id));
  const dedupedRequested = Array.from(new Set(requestIds)).filter((id) =>
    allowedIds.has(id),
  );
  const missingIds = existing
    .map((item) => item.id)
    .filter((id) => !dedupedRequested.includes(id));
  const nextOrder = [...dedupedRequested, ...missingIds];

  await db.transaction(async (tx) => {
    for (const [index, requestId] of nextOrder.entries()) {
      await tx
        .update(clientRequests)
        .set({
          priority: index + 1,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(clientRequests.id, requestId),
            eq(clientRequests.teamId, teamId),
            eq(clientRequests.customerId, customerId),
          ),
        );
    }
  });

  return nextOrder;
}

export type GetCustomerPortalAssetsParams = {
  teamId: string;
  customerId: string;
  pageSize?: number;
};

export async function getCustomerPortalAssets(
  db: Database,
  params: GetCustomerPortalAssetsParams,
) {
  const { teamId, customerId, pageSize = 20 } = params;

  return db
    .select({
      id: documents.id,
      title: documents.title,
      name: documents.name,
      pathTokens: documents.pathTokens,
      createdAt: documents.createdAt,
      metadata: documents.metadata,
    })
    .from(documents)
    .where(
      and(
        eq(documents.teamId, teamId),
        eq(documents.objectId, customerId),
        isNotNull(documents.pathTokens),
        not(like(documents.name, "%.folderPlaceholder")),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(pageSize);
}

export type UpdateClientRequestParams = {
  teamId: string;
  customerId: string;
  requestId: string;
  status?:
    | "backlog"
    | "in_progress"
    | "in_qa"
    | "awaiting_review"
    | "completed";
  stagingUrl?: string | null;
  resources?: PortalRequestResource[];
};

export async function updateClientRequest(
  db: Database,
  params: UpdateClientRequestParams,
) {
  const { teamId, customerId, requestId, status, stagingUrl, resources } =
    params;

  return withClientRequestResourcesColumn(db, async () => {
    const [result] = await db
      .update(clientRequests)
      .set({
        ...(status ? { status } : {}),
        ...(stagingUrl !== undefined ? { stagingUrl } : {}),
        ...(resources !== undefined ? { resources } : {}),
        updatedAt: sql`now()`,
        ...(status === "completed" ? { completedAt: sql`now()` } : {}),
        ...(status && status !== "completed" ? { completedAt: null } : {}),
      })
      .where(
        and(
          eq(clientRequests.id, requestId),
          eq(clientRequests.teamId, teamId),
          eq(clientRequests.customerId, customerId),
        ),
      )
      .returning({
        id: clientRequests.id,
        title: clientRequests.title,
        details: clientRequests.details,
        status: clientRequests.status,
        priority: clientRequests.priority,
        stagingUrl: clientRequests.stagingUrl,
        resources: clientRequests.resources,
        requestedBy: clientRequests.requestedBy,
        attachments: clientRequests.attachments,
        createdAt: clientRequests.createdAt,
        updatedAt: clientRequests.updatedAt,
        completedAt: clientRequests.completedAt,
      });

    return result ?? null;
  });
}

export type GetClientPortalMessagesParams = {
  teamId: string;
  customerId: string;
  pageSize?: number;
};

export async function getClientPortalMessages(
  db: Database,
  params: GetClientPortalMessagesParams,
) {
  const { teamId, customerId, pageSize = 100 } = params;

  return db
    .select({
      id: clientPortalMessages.id,
      customerId: clientPortalMessages.customerId,
      requestId: clientPortalMessages.requestId,
      senderType: clientPortalMessages.senderType,
      senderUserId: clientPortalMessages.senderUserId,
      senderName: clientPortalMessages.senderName,
      message: clientPortalMessages.message,
      attachments: clientPortalMessages.attachments,
      createdAt: clientPortalMessages.createdAt,
      updatedAt: clientPortalMessages.updatedAt,
    })
    .from(clientPortalMessages)
    .where(
      and(
        eq(clientPortalMessages.teamId, teamId),
        eq(clientPortalMessages.customerId, customerId),
      ),
    )
    .orderBy(desc(clientPortalMessages.createdAt))
    .limit(Math.min(pageSize, 200));
}

export type CreateClientPortalMessageParams = {
  teamId: string;
  customerId: string;
  requestId?: string | null;
  senderType: "client" | "freelancer";
  senderUserId?: string | null;
  senderName?: string | null;
  message: string;
  attachments?: Array<{
    name: string;
    path: string[];
    size: number;
    type: string;
  }>;
};

export async function createClientPortalMessage(
  db: Database,
  params: CreateClientPortalMessageParams,
) {
  const {
    teamId,
    customerId,
    requestId,
    senderType,
    senderUserId,
    senderName,
    message,
    attachments,
  } = params;

  const normalizedRequestId =
    typeof requestId === "string" && requestId.trim().length > 0
      ? requestId.trim()
      : null;
  const normalizedSenderName =
    typeof senderName === "string" && senderName.trim().length > 0
      ? senderName.trim()
      : null;
  const normalizedMessage = message.trim();

  const [result] = await db
    .insert(clientPortalMessages)
    .values({
      teamId,
      customerId,
      requestId: normalizedRequestId,
      senderType,
      senderUserId: senderUserId ?? null,
      senderName: normalizedSenderName,
      message: normalizedMessage,
      attachments: attachments ?? [],
    })
    .returning({
      id: clientPortalMessages.id,
      customerId: clientPortalMessages.customerId,
      requestId: clientPortalMessages.requestId,
      senderType: clientPortalMessages.senderType,
      senderUserId: clientPortalMessages.senderUserId,
      senderName: clientPortalMessages.senderName,
      message: clientPortalMessages.message,
      attachments: clientPortalMessages.attachments,
      createdAt: clientPortalMessages.createdAt,
      updatedAt: clientPortalMessages.updatedAt,
    });

  return result;
}
