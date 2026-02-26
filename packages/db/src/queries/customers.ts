import { buildSearchQuery } from "@connorco/db/utils/search-query";
import { generateToken } from "@connorco/invoice/token";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm/sql/sql";
import { nanoid } from "nanoid";
import type { Database } from "../client";
import {
  customers,
  customerTags,
  exchangeRates,
  invoices,
  tags,
  teams,
  trackerProjects,
} from "../schema";
import { createActivity } from "./activities";

let ensurePortalCustomizationColumnPromise: Promise<void> | null = null;

function isMissingPortalCustomizationColumnError(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : "";
  return (
    errorMessage.includes("portal_hide_subscription_cta") ||
    errorMessage.includes("portal_billing_type") ||
    errorMessage.includes("portal_project_name") ||
    errorMessage.includes("portal_project_total")
  );
}

async function ensurePortalCustomizationColumn(db: Database) {
  if (!ensurePortalCustomizationColumnPromise) {
    ensurePortalCustomizationColumnPromise = Promise.all([
      db.execute(
        sql`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "portal_hide_subscription_cta" boolean DEFAULT false`,
      ),
      db.execute(
        sql`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "portal_billing_type" text DEFAULT 'subscription'`,
      ),
      db.execute(
        sql`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "portal_project_name" text`,
      ),
      db.execute(
        sql`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "portal_project_total" text`,
      ),
    ])
      .then(() => undefined)
      .catch((error) => {
        ensurePortalCustomizationColumnPromise = null;
        throw error;
      });
  }

  await ensurePortalCustomizationColumnPromise;
}

type GetCustomerByIdParams = {
  id: string;
  teamId: string;
};

export const getCustomerById = async (
  db: Database,
  params: GetCustomerByIdParams,
) => {
  const [result] = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      billingEmail: customers.billingEmail,
      phone: customers.phone,
      website: customers.website,
      createdAt: customers.createdAt,
      teamId: customers.teamId,
      country: customers.country,
      addressLine1: customers.addressLine1,
      addressLine2: customers.addressLine2,
      city: customers.city,
      state: customers.state,
      zip: customers.zip,
      note: customers.note,
      vatNumber: customers.vatNumber,
      countryCode: customers.countryCode,
      token: customers.token,
      contact: customers.contact,
      // Customer relationship fields
      status: customers.status,
      preferredCurrency: customers.preferredCurrency,
      defaultPaymentTerms: customers.defaultPaymentTerms,
      isArchived: customers.isArchived,
      source: customers.source,
      externalId: customers.externalId,
      // Enrichment fields
      logoUrl: customers.logoUrl,
      description: customers.description,
      industry: customers.industry,
      companyType: customers.companyType,
      employeeCount: customers.employeeCount,
      foundedYear: customers.foundedYear,
      estimatedRevenue: customers.estimatedRevenue,
      fundingStage: customers.fundingStage,
      totalFunding: customers.totalFunding,
      headquartersLocation: customers.headquartersLocation,
      timezone: customers.timezone,
      linkedinUrl: customers.linkedinUrl,
      twitterUrl: customers.twitterUrl,
      instagramUrl: customers.instagramUrl,
      facebookUrl: customers.facebookUrl,
      ceoName: customers.ceoName,
      financeContact: customers.financeContact,
      financeContactEmail: customers.financeContactEmail,
      primaryLanguage: customers.primaryLanguage,
      fiscalYearEnd: customers.fiscalYearEnd,
      enrichmentStatus: customers.enrichmentStatus,
      enrichedAt: customers.enrichedAt,
      // Portal fields
      portalEnabled: customers.portalEnabled,
      portalId: customers.portalId,
      portalBillingType: customerPortalBillingTypeSql,
      portalProjectName: customerPortalProjectNameSql,
      portalProjectTotal: customerPortalProjectTotalSql,
      portalHideSubscriptionCta: sql<boolean>`
        CASE
          WHEN lower(COALESCE(to_jsonb("customers") ->> 'portal_hide_subscription_cta', '')) IN ('true', 't', '1', 'yes', 'y', 'on') THEN true
          WHEN lower(COALESCE(to_jsonb("customers") ->> 'portal_hide_subscription_cta', '')) IN ('false', 'f', '0', 'no', 'n', 'off') THEN false
          ELSE false
        END
      `,
      invoiceCount: sql<number>`cast(count(${invoices.id}) as int)`,
      projectCount: sql<number>`cast(count(${trackerProjects.id}) as int)`,
      tags: sql<CustomerTag[]>`
        coalesce(
          json_agg(
            distinct jsonb_build_object(
              'id', ${tags.id},
              'name', ${tags.name}
            )
          ) filter (where ${tags.id} is not null),
          '[]'
        )
      `.as("tags"),
    })
    .from(customers)
    .where(
      and(eq(customers.id, params.id), eq(customers.teamId, params.teamId)),
    )
    .leftJoin(invoices, eq(invoices.customerId, customers.id))
    .leftJoin(trackerProjects, eq(trackerProjects.customerId, customers.id))
    .leftJoin(customerTags, eq(customerTags.customerId, customers.id))
    .leftJoin(tags, eq(tags.id, customerTags.tagId))
    .groupBy(customers.id);

  return result;
};

export type GetCustomersParams = {
  teamId: string;
  cursor?: string | null;
  pageSize?: number;
  q?: string | null;

  sort?: string[] | null;
};

export type CustomerTag = {
  id: string;
  name: string;
};

const customerInvoiceCountSql = sql<number>`(
  SELECT COUNT(*)::int
  FROM "invoices"
  WHERE "invoices"."customer_id" = "customers"."id"
)`;

const customerProjectCountSql = sql<number>`(
  SELECT COUNT(*)::int
  FROM "tracker_projects"
  WHERE "tracker_projects"."customer_id" = "customers"."id"
)`;

const customerTotalRevenueSql = sql<number>`COALESCE((
  SELECT SUM("invoices"."amount")
  FROM "invoices"
  WHERE "invoices"."customer_id" = "customers"."id"
    AND "invoices"."status" = 'paid'
), 0)`;

const customerOutstandingAmountSql = sql<number>`COALESCE((
  SELECT SUM("invoices"."amount")
  FROM "invoices"
  WHERE "invoices"."customer_id" = "customers"."id"
    AND "invoices"."status" IN ('unpaid', 'overdue')
), 0)`;

const customerLastInvoiceDateSql = sql<string | null>`(
  SELECT MAX("invoices"."issue_date")
  FROM "invoices"
  WHERE "invoices"."customer_id" = "customers"."id"
)`;

const customerInvoiceCurrencySql = sql<string | null>`(
  SELECT "invoices"."currency"
  FROM "invoices"
  WHERE "invoices"."customer_id" = "customers"."id"
    AND "invoices"."currency" IS NOT NULL
  ORDER BY "invoices"."issue_date" DESC NULLS LAST, "invoices"."created_at" DESC
  LIMIT 1
)`;

const customerTagsSql = sql<CustomerTag[]>`
  COALESCE((
    SELECT json_agg(
      DISTINCT jsonb_build_object(
        'id', "tags"."id",
        'name', "tags"."name"
      )
    ) FILTER (WHERE "tags"."id" IS NOT NULL)
    FROM "customer_tags"
    LEFT JOIN "tags" ON "tags"."id" = "customer_tags"."tag_id"
    WHERE "customer_tags"."customer_id" = "customers"."id"
  ), '[]'::json)
`;

const customerStatusSql = sql<
  string | null
>`to_jsonb("customers") ->> 'status'`;
const customerIsArchivedSql = sql<boolean>`
  CASE
    WHEN lower(COALESCE(to_jsonb("customers") ->> 'is_archived', '')) IN ('true', 't', '1', 'yes', 'y', 'on') THEN true
    WHEN lower(COALESCE(to_jsonb("customers") ->> 'is_archived', '')) IN ('false', 'f', '0', 'no', 'n', 'off') THEN false
    ELSE false
  END
`;
const customerLogoUrlSql = sql<
  string | null
>`to_jsonb("customers") ->> 'logo_url'`;
const customerDescriptionSql = sql<
  string | null
>`to_jsonb("customers") ->> 'description'`;
const customerIndustrySql = sql<
  string | null
>`to_jsonb("customers") ->> 'industry'`;
const customerCompanyTypeSql = sql<
  string | null
>`to_jsonb("customers") ->> 'company_type'`;
const customerEmployeeCountSql = sql<
  string | null
>`to_jsonb("customers") ->> 'employee_count'`;
const customerFoundedYearSql = sql<number | null>`
  CASE
    WHEN COALESCE(to_jsonb("customers") ->> 'founded_year', '') ~ '^[+-]?[0-9]+$' THEN (to_jsonb("customers") ->> 'founded_year')::int
    ELSE NULL
  END
`;
const customerEstimatedRevenueSql = sql<
  string | null
>`to_jsonb("customers") ->> 'estimated_revenue'`;
const customerFundingStageSql = sql<
  string | null
>`to_jsonb("customers") ->> 'funding_stage'`;
const customerTotalFundingSql = sql<
  string | null
>`to_jsonb("customers") ->> 'total_funding'`;
const customerHeadquartersLocationSql = sql<
  string | null
>`to_jsonb("customers") ->> 'headquarters_location'`;
const customerTimezoneSql = sql<
  string | null
>`to_jsonb("customers") ->> 'timezone'`;
const customerLinkedinUrlSql = sql<
  string | null
>`to_jsonb("customers") ->> 'linkedin_url'`;
const customerTwitterUrlSql = sql<
  string | null
>`to_jsonb("customers") ->> 'twitter_url'`;
const customerInstagramUrlSql = sql<
  string | null
>`to_jsonb("customers") ->> 'instagram_url'`;
const customerFacebookUrlSql = sql<
  string | null
>`to_jsonb("customers") ->> 'facebook_url'`;
const customerCeoNameSql = sql<
  string | null
>`to_jsonb("customers") ->> 'ceo_name'`;
const customerFinanceContactSql = sql<
  string | null
>`to_jsonb("customers") ->> 'finance_contact'`;
const customerFinanceContactEmailSql = sql<
  string | null
>`to_jsonb("customers") ->> 'finance_contact_email'`;
const customerPrimaryLanguageSql = sql<
  string | null
>`to_jsonb("customers") ->> 'primary_language'`;
const customerFiscalYearEndSql = sql<
  string | null
>`to_jsonb("customers") ->> 'fiscal_year_end'`;
const customerEnrichmentStatusSql = sql<
  string | null
>`to_jsonb("customers") ->> 'enrichment_status'`;
const customerPortalEnabledSql = sql<boolean>`
  CASE
    WHEN lower(COALESCE(to_jsonb("customers") ->> 'portal_enabled', '')) IN ('true', 't', '1', 'yes', 'y', 'on') THEN true
    WHEN lower(COALESCE(to_jsonb("customers") ->> 'portal_enabled', '')) IN ('false', 'f', '0', 'no', 'n', 'off') THEN false
    ELSE false
  END
`;
const customerPortalIdSql = sql<
  string | null
>`to_jsonb("customers") ->> 'portal_id'`;
const customerPortalHideSubscriptionCtaSql = sql<boolean>`
  CASE
    WHEN lower(COALESCE(to_jsonb("customers") ->> 'portal_hide_subscription_cta', '')) IN ('true', 't', '1', 'yes', 'y', 'on') THEN true
    WHEN lower(COALESCE(to_jsonb("customers") ->> 'portal_hide_subscription_cta', '')) IN ('false', 'f', '0', 'no', 'n', 'off') THEN false
    ELSE false
  END
`;
const customerPortalBillingTypeSql = sql<"subscription" | "fixed">`
  CASE
    WHEN lower(COALESCE(to_jsonb("customers") ->> 'portal_billing_type', '')) = 'fixed' THEN 'fixed'
    ELSE 'subscription'
  END
`;
const customerPortalProjectNameSql = sql<string | null>`
  nullif(to_jsonb("customers") ->> 'portal_project_name', '')
`;
const customerPortalProjectTotalSql = sql<string | null>`
  nullif(to_jsonb("customers") ->> 'portal_project_total', '')
`;

export const getCustomers = async (
  db: Database,
  params: GetCustomersParams,
) => {
  const { teamId, sort, cursor, pageSize = 25, q } = params;

  const whereConditions: SQL[] = [eq(customers.teamId, teamId)];

  // Apply search query filter
  if (q) {
    // If the query is a number, search by numeric fields if any
    if (!Number.isNaN(Number.parseInt(q, 10))) {
      // Add numeric search logic if needed
    } else {
      const query = buildSearchQuery(q);

      // Search using full-text search or name
      whereConditions.push(
        sql`(to_tsquery('english', ${query}) @@ ${customers.fts} OR ${customers.name} ILIKE '%' || ${q} || '%')`,
      );
    }
  }

  // Start building the query
  const query = db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      billingEmail: customers.billingEmail,
      phone: customers.phone,
      website: customers.website,
      createdAt: customers.createdAt,
      teamId: customers.teamId,
      country: customers.country,
      addressLine1: customers.addressLine1,
      addressLine2: customers.addressLine2,
      city: customers.city,
      state: customers.state,
      zip: customers.zip,
      note: customers.note,
      vatNumber: customers.vatNumber,
      countryCode: customers.countryCode,
      token: customers.token,
      contact: customers.contact,
      // Customer relationship fields
      status: customerStatusSql,
      isArchived: customerIsArchivedSql,
      // Enrichment fields for list view
      logoUrl: customerLogoUrlSql,
      description: customerDescriptionSql,
      industry: customerIndustrySql,
      companyType: customerCompanyTypeSql,
      employeeCount: customerEmployeeCountSql,
      foundedYear: customerFoundedYearSql,
      estimatedRevenue: customerEstimatedRevenueSql,
      fundingStage: customerFundingStageSql,
      totalFunding: customerTotalFundingSql,
      headquartersLocation: customerHeadquartersLocationSql,
      timezone: customerTimezoneSql,
      linkedinUrl: customerLinkedinUrlSql,
      twitterUrl: customerTwitterUrlSql,
      instagramUrl: customerInstagramUrlSql,
      facebookUrl: customerFacebookUrlSql,
      ceoName: customerCeoNameSql,
      financeContact: customerFinanceContactSql,
      financeContactEmail: customerFinanceContactEmailSql,
      primaryLanguage: customerPrimaryLanguageSql,
      fiscalYearEnd: customerFiscalYearEndSql,
      enrichmentStatus: customerEnrichmentStatusSql,
      // Portal fields
      portalEnabled: customerPortalEnabledSql,
      portalId: customerPortalIdSql,
      portalBillingType: customerPortalBillingTypeSql,
      portalProjectName: customerPortalProjectNameSql,
      portalProjectTotal: customerPortalProjectTotalSql,
      portalHideSubscriptionCta: customerPortalHideSubscriptionCtaSql,
      invoiceCount: customerInvoiceCountSql,
      projectCount: customerProjectCountSql,
      // Financial metrics
      totalRevenue: customerTotalRevenueSql,
      outstandingAmount: customerOutstandingAmountSql,
      lastInvoiceDate: customerLastInvoiceDateSql,
      invoiceCurrency: customerInvoiceCurrencySql,
      tags: customerTagsSql.as("tags"),
    })
    .from(customers)
    .where(and(...whereConditions));

  // Apply sorting
  if (sort && sort.length === 2) {
    const [column, direction] = sort;
    const isAscending = direction === "asc";

    if (column === "name") {
      isAscending
        ? query.orderBy(asc(customers.name))
        : query.orderBy(desc(customers.name));
    } else if (column === "created_at") {
      isAscending
        ? query.orderBy(asc(customers.createdAt))
        : query.orderBy(desc(customers.createdAt));
    } else if (column === "contact") {
      isAscending
        ? query.orderBy(asc(customers.contact))
        : query.orderBy(desc(customers.contact));
    } else if (column === "email") {
      isAscending
        ? query.orderBy(asc(customers.email))
        : query.orderBy(desc(customers.email));
    } else if (column === "invoices") {
      // Sort by invoice count
      isAscending
        ? query.orderBy(asc(customerInvoiceCountSql))
        : query.orderBy(desc(customerInvoiceCountSql));
    } else if (column === "projects") {
      // Sort by project count
      isAscending
        ? query.orderBy(asc(customerProjectCountSql))
        : query.orderBy(desc(customerProjectCountSql));
    } else if (column === "tags") {
      // Sort by first tag name (alphabetically)
      const firstTagNameSql = sql<string | null>`(
        SELECT MIN("tags"."name")
        FROM "customer_tags"
        LEFT JOIN "tags" ON "tags"."id" = "customer_tags"."tag_id"
        WHERE "customer_tags"."customer_id" = "customers"."id"
      )`;
      isAscending
        ? query.orderBy(asc(firstTagNameSql))
        : query.orderBy(desc(firstTagNameSql));
    } else if (column === "industry") {
      isAscending
        ? query.orderBy(asc(customerIndustrySql))
        : query.orderBy(desc(customerIndustrySql));
    } else if (column === "country") {
      isAscending
        ? query.orderBy(asc(customers.country))
        : query.orderBy(desc(customers.country));
    } else if (column === "total_revenue") {
      isAscending
        ? query.orderBy(asc(customerTotalRevenueSql))
        : query.orderBy(desc(customerTotalRevenueSql));
    } else if (column === "outstanding") {
      isAscending
        ? query.orderBy(asc(customerOutstandingAmountSql))
        : query.orderBy(desc(customerOutstandingAmountSql));
    } else if (column === "last_invoice") {
      isAscending
        ? query.orderBy(asc(customerLastInvoiceDateSql))
        : query.orderBy(desc(customerLastInvoiceDateSql));
    }
  } else {
    // Default sort by created_at descending
    query.orderBy(desc(customers.createdAt));
  }

  // Apply pagination
  const offset = cursor ? Number.parseInt(cursor, 10) : 0;
  query.limit(pageSize).offset(offset);

  // Execute query
  const data = await query;

  // Calculate next cursor
  const nextCursor =
    data && data.length === pageSize
      ? (offset + pageSize).toString()
      : undefined;

  return {
    meta: {
      cursor: nextCursor ?? null,
      hasPreviousPage: offset > 0,
      hasNextPage: data && data.length === pageSize,
    },
    data,
  };
};

export type UpsertCustomerParams = {
  id?: string;
  teamId: string;
  userId?: string;
  name: string;
  email: string;
  billingEmail?: string | null;
  country?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  note?: string | null;
  website?: string | null;
  phone?: string | null;
  contact?: string | null;
  vatNumber?: string | null;
  countryCode?: string | null;
  tags?: { id: string; name: string }[] | null;
  portalBillingType?: "subscription" | "fixed";
  portalProjectName?: string | null;
  portalProjectTotal?: string | null;
  portalHideSubscriptionCta?: boolean;
};

export const upsertCustomer = async (
  db: Database,
  params: UpsertCustomerParams,
) => {
  const { id, tags: inputTags, teamId, userId, ...rest } = params;
  const {
    portalBillingType,
    portalProjectName,
    portalProjectTotal,
    portalHideSubscriptionCta,
    ...customerFields
  } = rest;

  const token = id ? await generateToken(id) : undefined;

  const isNewCustomer = !id;
  const returningSelection = {
    id: customers.id,
    name: customers.name,
    email: customers.email,
    website: customers.website,
    country: customers.country,
    city: customers.city,
  };

  const runUpsert = (includePortalCustomization: boolean) =>
    db
      .insert(customers)
      .values({
        id,
        teamId,
        ...customerFields,
        ...(includePortalCustomization &&
        portalHideSubscriptionCta !== undefined
          ? { portalHideSubscriptionCta }
          : {}),
        ...(includePortalCustomization && portalBillingType !== undefined
          ? { portalBillingType }
          : {}),
        ...(includePortalCustomization && portalProjectName !== undefined
          ? { portalProjectName }
          : {}),
        ...(includePortalCustomization && portalProjectTotal !== undefined
          ? { portalProjectTotal }
          : {}),
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          name: customerFields.name,
          email: customerFields.email,
          billingEmail: customerFields.billingEmail,
          token,
          country: customerFields.country,
          addressLine1: customerFields.addressLine1,
          addressLine2: customerFields.addressLine2,
          city: customerFields.city,
          state: customerFields.state,
          zip: customerFields.zip,
          note: customerFields.note,
          website: customerFields.website,
          phone: customerFields.phone,
          contact: customerFields.contact,
          vatNumber: customerFields.vatNumber,
          countryCode: customerFields.countryCode,
          ...(includePortalCustomization &&
          portalHideSubscriptionCta !== undefined
            ? { portalHideSubscriptionCta }
            : {}),
          ...(includePortalCustomization && portalBillingType !== undefined
            ? { portalBillingType }
            : {}),
          ...(includePortalCustomization && portalProjectName !== undefined
            ? { portalProjectName }
            : {}),
          ...(includePortalCustomization && portalProjectTotal !== undefined
            ? { portalProjectTotal }
            : {}),
        },
      })
      .returning(returningSelection);

  const runUpdate = (includePortalCustomization: boolean) =>
    db
      .update(customers)
      .set({
        name: customerFields.name,
        email: customerFields.email,
        billingEmail: customerFields.billingEmail,
        token,
        country: customerFields.country,
        addressLine1: customerFields.addressLine1,
        addressLine2: customerFields.addressLine2,
        city: customerFields.city,
        state: customerFields.state,
        zip: customerFields.zip,
        note: customerFields.note,
        website: customerFields.website,
        phone: customerFields.phone,
        contact: customerFields.contact,
        vatNumber: customerFields.vatNumber,
        countryCode: customerFields.countryCode,
        ...(includePortalCustomization &&
        portalHideSubscriptionCta !== undefined
          ? { portalHideSubscriptionCta }
          : {}),
        ...(includePortalCustomization && portalBillingType !== undefined
          ? { portalBillingType }
          : {}),
        ...(includePortalCustomization && portalProjectName !== undefined
          ? { portalProjectName }
          : {}),
        ...(includePortalCustomization && portalProjectTotal !== undefined
          ? { portalProjectTotal }
          : {}),
      })
      .where(and(eq(customers.id, id!), eq(customers.teamId, teamId)))
      .returning(returningSelection);

  let customer:
    | {
        id: string;
        name: string;
        email: string;
        website: string | null;
        country: string | null;
        city: string | null;
      }
    | undefined;

  if (id) {
    try {
      [customer] = await runUpdate(true);
    } catch (error) {
      if (!isMissingPortalCustomizationColumnError(error)) {
        throw error;
      }

      await ensurePortalCustomizationColumn(db);
      [customer] = await runUpdate(true);
    }

    // Keep upsert behavior: if update found no row, create it.
    if (!customer) {
      try {
        [customer] = await runUpsert(true);
      } catch (error) {
        if (!isMissingPortalCustomizationColumnError(error)) {
          throw error;
        }

        await ensurePortalCustomizationColumn(db);
        [customer] = await runUpsert(true);
      }
    }
  } else {
    try {
      [customer] = await runUpsert(true);
    } catch (error) {
      if (!isMissingPortalCustomizationColumnError(error)) {
        throw error;
      }

      await ensurePortalCustomizationColumn(db);
      [customer] = await runUpsert(true);
    }
  }

  if (!customer) {
    throw new Error("Failed to create or update customer");
  }

  const customerId = customer.id;

  // Create activity for new customers only
  if (isNewCustomer) {
    createActivity(db, {
      teamId,
      userId,
      type: "customer_created",
      source: "user",
      priority: 7,
      metadata: {
        customerId: customerId,
        customerName: customer.name,
        customerEmail: customer.email,
        website: customer.website,
        country: customer.country,
        city: customer.city,
      },
    });
  }

  // Get current tags for the customer
  const currentCustomerTags = await db
    .select({
      id: customerTags.id,
      tagId: customerTags.tagId,
      tag: {
        id: tags.id,
        name: tags.name,
      },
    })
    .from(customerTags)
    .where(eq(customerTags.customerId, customerId))
    .leftJoin(tags, eq(tags.id, customerTags.tagId));

  const currentTagIds = new Set(currentCustomerTags.map((ct) => ct.tagId));
  const inputTagIds = new Set(inputTags?.map((t) => t.id) || []);

  // Tags to insert (in input but not current)
  const tagsToInsert =
    inputTags?.filter((tag) => !currentTagIds.has(tag.id)) || [];

  // Tags to delete (in current but not input)
  const tagIdsToDelete = Array.from(currentTagIds).filter(
    (tagId) => !inputTagIds.has(tagId),
  );

  // Insert new tag associations
  if (tagsToInsert.length > 0) {
    await db.insert(customerTags).values(
      tagsToInsert.map((tag) => ({
        customerId,
        tagId: tag.id,
        teamId,
      })),
    );
  }

  // Delete removed tag associations
  if (tagIdsToDelete.length > 0) {
    await db
      .delete(customerTags)
      .where(
        and(
          eq(customerTags.customerId, customerId),
          inArray(customerTags.tagId, tagIdsToDelete),
        ),
      );
  }

  // Return the customer with updated tags
  const [result] = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      billingEmail: customers.billingEmail,
      phone: customers.phone,
      website: customers.website,
      createdAt: customers.createdAt,
      teamId: customers.teamId,
      country: customers.country,
      addressLine1: customers.addressLine1,
      addressLine2: customers.addressLine2,
      city: customers.city,
      state: customers.state,
      zip: customers.zip,
      note: customers.note,
      vatNumber: customers.vatNumber,
      countryCode: customers.countryCode,
      token: customers.token,
      contact: customers.contact,
      portalEnabled: customers.portalEnabled,
      portalId: customers.portalId,
      portalBillingType: customerPortalBillingTypeSql,
      portalProjectName: customerPortalProjectNameSql,
      portalProjectTotal: customerPortalProjectTotalSql,
      portalHideSubscriptionCta: customerPortalHideSubscriptionCtaSql,
      invoiceCount: sql<number>`cast(count(${invoices.id}) as int)`,
      projectCount: sql<number>`cast(count(${trackerProjects.id}) as int)`,
      tags: sql<CustomerTag[]>`
          coalesce(
            json_agg(
              distinct jsonb_build_object(
                'id', ${tags.id},
                'name', ${tags.name}
              )
            ) filter (where ${tags.id} is not null),
            '[]'
          )
        `.as("tags"),
    })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.teamId, teamId)))
    .leftJoin(invoices, eq(invoices.customerId, customers.id))
    .leftJoin(trackerProjects, eq(trackerProjects.customerId, customers.id))
    .leftJoin(customerTags, eq(customerTags.customerId, customers.id))
    .leftJoin(tags, eq(tags.id, customerTags.tagId))
    .groupBy(customers.id);

  return result;
};

export type DeleteCustomerParams = {
  id: string;
  teamId: string;
};

export const deleteCustomer = async (
  db: Database,
  params: DeleteCustomerParams,
) => {
  const { id, teamId } = params;

  // First, get the customer data before deleting it
  const customerToDelete = await getCustomerById(db, { id, teamId });

  if (!customerToDelete) {
    throw new Error("Customer not found");
  }

  // Delete the customer
  await db
    .delete(customers)
    .where(and(eq(customers.id, id), eq(customers.teamId, teamId)));

  // Return the deleted customer data
  return customerToDelete;
};

export type GetCustomerInvoiceSummaryParams = {
  customerId: string;
  teamId: string;
};

export async function getCustomerInvoiceSummary(
  db: Database,
  params: GetCustomerInvoiceSummaryParams,
) {
  const { customerId, teamId } = params;

  // Get team's base currency first
  const [team] = await db
    .select({ baseCurrency: teams.baseCurrency })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const baseCurrency = team?.baseCurrency || "USD";

  // Get all invoices for this customer
  const invoiceData = await db
    .select({
      amount: invoices.amount,
      currency: invoices.currency,
      status: invoices.status,
    })
    .from(invoices)
    .where(
      and(eq(invoices.customerId, customerId), eq(invoices.teamId, teamId)),
    );

  if (invoiceData.length === 0) {
    return {
      totalAmount: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      invoiceCount: 0,
      currency: baseCurrency,
    };
  }

  // Collect unique currencies that need conversion (excluding base currency)
  const currenciesToConvert = [
    ...new Set(
      invoiceData
        .map((inv) => inv.currency || baseCurrency)
        .filter((currency) => currency !== baseCurrency),
    ),
  ];

  // Fetch all exchange rates
  const exchangeRateMap = new Map<string, number>();
  if (currenciesToConvert.length > 0) {
    const exchangeRatesData = await db
      .select({
        base: exchangeRates.base,
        rate: exchangeRates.rate,
      })
      .from(exchangeRates)
      .where(
        and(
          inArray(exchangeRates.base, currenciesToConvert),
          eq(exchangeRates.target, baseCurrency),
        ),
      );

    // Build a map for O(1) lookup
    for (const rateData of exchangeRatesData) {
      if (rateData.base && rateData.rate) {
        exchangeRateMap.set(rateData.base, Number(rateData.rate));
      }
    }
  }

  // Convert all amounts to base currency and calculate totals
  let totalAmount = 0;
  let paidAmount = 0;
  let outstandingAmount = 0;
  let invoiceCount = 0;

  for (const invoice of invoiceData) {
    const amount = Number(invoice.amount) || 0;
    const currency = invoice.currency || baseCurrency;

    let convertedAmount = amount;
    let canConvert = true;

    // Convert to base currency if different
    if (currency !== baseCurrency) {
      const exchangeRate = exchangeRateMap.get(currency);
      if (exchangeRate) {
        convertedAmount = amount * exchangeRate;
      } else {
        // Skip invoices with missing exchange rates to avoid mixing currencies
        // This prevents silently producing incorrect totals
        canConvert = false;
      }
    }

    // Only include invoices that can be properly converted and are paid or outstanding
    // Draft, canceled, and scheduled invoices don't count toward financial totals
    if (canConvert) {
      if (invoice.status === "paid") {
        paidAmount += convertedAmount;
        totalAmount += convertedAmount;
        invoiceCount++;
      } else if (invoice.status === "unpaid" || invoice.status === "overdue") {
        outstandingAmount += convertedAmount;
        totalAmount += convertedAmount;
        invoiceCount++;
      }
    }
  }

  return {
    totalAmount: Math.round(totalAmount * 100) / 100,
    paidAmount: Math.round(paidAmount * 100) / 100,
    outstandingAmount: Math.round(outstandingAmount * 100) / 100,
    invoiceCount,
    currency: baseCurrency,
  };
}

export type ToggleCustomerPortalParams = {
  customerId: string;
  teamId: string;
  enabled: boolean;
};

/**
 * Toggle customer portal access.
 * Generates a portal_id (nanoid(8)) on first enable.
 */
export async function toggleCustomerPortal(
  db: Database,
  params: ToggleCustomerPortalParams,
) {
  const { customerId, teamId, enabled } = params;

  // Get current customer to check if portal_id exists
  const [currentCustomer] = await db
    .select({
      id: customers.id,
      portalId: customers.portalId,
    })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.teamId, teamId)))
    .limit(1);

  if (!currentCustomer) {
    throw new Error("Customer not found");
  }

  // Generate portal_id if enabling and doesn't exist yet
  const portalId =
    enabled && !currentCustomer.portalId ? nanoid(8) : currentCustomer.portalId;

  // Update the customer
  const [result] = await db
    .update(customers)
    .set({
      portalEnabled: enabled,
      portalId,
    })
    .where(and(eq(customers.id, customerId), eq(customers.teamId, teamId)))
    .returning({
      id: customers.id,
      portalEnabled: customers.portalEnabled,
      portalId: customers.portalId,
    });

  return result;
}

export type GetCustomerByPortalIdParams = {
  portalId: string;
};

/**
 * Get customer by portal ID for public portal page.
 * Only returns customer if portal is enabled.
 */
export async function getCustomerByPortalId(
  db: Database,
  params: GetCustomerByPortalIdParams,
) {
  const { portalId } = params;

  const [result] = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      website: customers.website,
      teamId: customers.teamId,
      portalEnabled: customers.portalEnabled,
      portalId: customers.portalId,
      portalBillingType: customerPortalBillingTypeSql,
      portalProjectName: customerPortalProjectNameSql,
      portalProjectTotal: customerPortalProjectTotalSql,
      portalHideSubscriptionCta: customerPortalHideSubscriptionCtaSql,
      team: {
        id: teams.id,
        name: teams.name,
        logoUrl: teams.logoUrl,
        baseCurrency: teams.baseCurrency,
        plan: teams.plan,
        subscriptionStatus: teams.subscriptionStatus,
      },
    })
    .from(customers)
    .innerJoin(teams, eq(teams.id, customers.teamId))
    .where(
      and(eq(customers.portalId, portalId), eq(customers.portalEnabled, true)),
    )
    .limit(1);

  return result;
}

export type GetCustomerPortalInvoicesParams = {
  customerId: string;
  teamId: string;
  cursor?: string | null;
  pageSize?: number;
};

/**
 * Get invoices for customer portal.
 * Only returns non-draft invoices (paid, unpaid, overdue).
 */
export async function getCustomerPortalInvoices(
  db: Database,
  params: GetCustomerPortalInvoicesParams,
) {
  const { customerId, teamId, cursor, pageSize = 10 } = params;

  const offset = cursor ? Number.parseInt(cursor, 10) : 0;

  const data = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      amount: invoices.amount,
      currency: invoices.currency,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      token: invoices.token,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.customerId, customerId),
        eq(invoices.teamId, teamId),
        // Only show paid, unpaid, overdue (exclude draft, canceled, scheduled, refunded)
        sql`${invoices.status} IN ('paid', 'unpaid', 'overdue')`,
      ),
    )
    .orderBy(desc(invoices.issueDate))
    .limit(pageSize)
    .offset(offset);

  const nextCursor =
    data.length === pageSize ? (offset + pageSize).toString() : null;

  return {
    data,
    nextCursor,
    hasMore: data.length === pageSize,
  };
}
