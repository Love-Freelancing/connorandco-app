import { isValidEmailList } from "@connorco/utils";
import { z } from "@hono/zod-openapi";

export const getCustomersSchema = z
  .object({
    q: z
      .string()
      .nullable()
      .optional()
      .openapi({
        description:
          "Search query string to filter customers by name, email, or other text fields",
        example: "acme",
        param: {
          in: "query",
        },
      }),
    sort: z
      .array(z.string().min(1))
      .max(2)
      .min(2)
      .nullable()
      .optional()
      .openapi({
        description:
          "Sorting order as a tuple: [field, direction]. Example: ['name', 'asc'] or ['createdAt', 'desc']",
        example: ["name", "asc"],
        param: {
          in: "query",
        },
      }),
    cursor: z
      .string()
      .optional()
      .openapi({
        description:
          "Cursor for pagination, representing the last item from the previous page",
        example: "eyJpZCI6IjEyMyJ9",
        param: {
          in: "query",
        },
      }),
    pageSize: z.coerce
      .number()
      .min(1)
      .max(100)
      .optional()
      .openapi({
        description: "Number of customers to return per page (1-100)",
        example: 20,
        param: {
          in: "query",
        },
      }),
  })
  .openapi({
    description: "Query parameters for filtering and paginating customers",
    param: {
      in: "query",
    },
  });

export const customerResponseSchema = z.object({
  id: z.string().uuid().openapi({
    description: "Unique identifier of the customer",
    example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
  }),
  name: z.string().openapi({
    description: "Name of the customer or organization",
    example: "Acme Corporation",
  }),
  email: z.string().email().openapi({
    description: "Primary email address of the customer",
    example: "contact@acme.com",
  }),
  billingEmail: z.string().nullable().openapi({
    description:
      "Billing email addresses of the customer (comma-separated for multiple)",
    example: "finance@acme.com, accounting@acme.com",
  }),
  phone: z.string().nullable().openapi({
    description: "Primary phone number of the customer",
    example: "+1-555-123-4567",
  }),
  website: z.string().nullable().openapi({
    description: "Website URL of the customer",
    example: "https://acme.com",
  }),
  createdAt: z.string().openapi({
    description:
      "Date and time when the customer was created in ISO 8601 format",
    example: "2024-05-01T12:34:56.789Z",
  }),
  country: z.string().nullable().openapi({
    description: "Country name where the customer is located",
    example: "United States",
  }),
  addressLine1: z.string().nullable().openapi({
    description: "First line of the customer's address",
    example: "123 Main Street",
  }),
  addressLine2: z.string().nullable().openapi({
    description:
      "Second line of the customer's address (suite, apartment, etc.)",
    example: "Suite 400",
  }),
  city: z.string().nullable().openapi({
    description: "City where the customer is located",
    example: "San Francisco",
  }),
  state: z.string().nullable().openapi({
    description: "State or province where the customer is located",
    example: "California",
  }),
  zip: z.string().nullable().openapi({
    description: "ZIP or postal code of the customer's address",
    example: "94105",
  }),
  note: z.string().nullable().openapi({
    description: "Internal notes about the customer for team reference",
    example: "Preferred contact method is email. Large enterprise client.",
  }),
  vatNumber: z.string().nullable().openapi({
    description: "VAT (Value Added Tax) number of the customer",
    example: "US123456789",
  }),
  countryCode: z.string().nullable().openapi({
    description: "Country code in ISO 3166-1 alpha-2 format",
    example: "US",
  }),
  token: z.string().openapi({
    description:
      "Unique token for the customer (used for internal identification)",
    example: "cus_abc123xyz789",
  }),
  contact: z.string().nullable().openapi({
    description: "Primary contact person's name at the customer organization",
    example: "John Smith",
  }),
  portalBillingType: z.enum(["subscription", "fixed"]).optional().openapi({
    description: "Portal billing mode for this customer",
    example: "fixed",
  }),
  portalProjectName: z.string().nullable().optional().openapi({
    description: "Fixed-price project name shown in client portal billing",
    example: "Custom Next.js MVP",
  }),
  portalProjectTotal: z.string().nullable().optional().openapi({
    description: "Fixed-price contract total shown in client portal billing",
    example: "$8,500",
  }),
  invoiceCount: z.number().openapi({
    description: "Total number of invoices created for this customer",
    example: 12,
  }),
  projectCount: z.number().openapi({
    description: "Total number of projects associated with this customer",
    example: 3,
  }),
  // Financial metrics (calculated from invoices, only returned in list queries)
  totalRevenue: z.number().optional().openapi({
    description:
      "Total revenue from paid invoices for this customer (in invoice currency). Only returned in list queries.",
    example: 15000.5,
  }),
  outstandingAmount: z.number().optional().openapi({
    description:
      "Total outstanding amount from unpaid/overdue invoices (in invoice currency). Only returned in list queries.",
    example: 2500.0,
  }),
  lastInvoiceDate: z.string().nullable().optional().openapi({
    description:
      "Date of the most recent invoice in ISO 8601 format. Only returned in list queries.",
    example: "2024-04-15",
  }),
  invoiceCurrency: z.string().nullable().optional().openapi({
    description:
      "Primary currency used in invoices for this customer. Only returned in list queries.",
    example: "USD",
  }),
  tags: z
    .array(
      z.object({
        id: z.string().uuid().openapi({
          description: "Unique identifier of the tag",
          example: "e7a9c1a2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
        }),
        name: z.string().openapi({
          description: "Display name of the tag",
          example: "VIP",
        }),
      }),
    )
    .openapi({
      description:
        "Array of tags associated with the customer for categorization",
      example: [
        { id: "e7a9c1a2-4c2a-4e7a-9c1a-2b7c1e24c2a4", name: "VIP" },
        { id: "f1b2c3d4-5678-4e7a-9c1a-2b7c1e24c2a4", name: "Enterprise" },
      ],
    }),
  // Enrichment fields
  description: z.string().nullable().openapi({
    description: "AI-generated description of what the company does",
    example: "A cloud-based project management platform for remote teams.",
  }),
  industry: z.string().nullable().openapi({
    description: "Primary industry of the company",
    example: "Software",
  }),
  companyType: z.string().nullable().openapi({
    description: "Business model type",
    example: "SaaS",
  }),
  employeeCount: z.string().nullable().openapi({
    description: "Estimated number of employees",
    example: "51-200",
  }),
  foundedYear: z.number().nullable().openapi({
    description: "Year the company was founded",
    example: 2018,
  }),
  estimatedRevenue: z.string().nullable().openapi({
    description: "Estimated annual revenue range",
    example: "$10M-$50M",
  }),
  fundingStage: z.string().nullable().openapi({
    description: "Current funding stage",
    example: "Series A",
  }),
  totalFunding: z.string().nullable().openapi({
    description: "Total funding raised",
    example: "$15M",
  }),
  headquartersLocation: z.string().nullable().openapi({
    description: "Company headquarters location",
    example: "San Francisco, CA",
  }),
  timezone: z.string().nullable().openapi({
    description: "IANA timezone of the company headquarters",
    example: "America/Los_Angeles",
  }),
  linkedinUrl: z.string().nullable().openapi({
    description: "LinkedIn company page URL",
    example: "https://linkedin.com/company/acme",
  }),
  twitterUrl: z.string().nullable().openapi({
    description: "Twitter/X profile URL",
    example: "https://twitter.com/acme",
  }),
  instagramUrl: z.string().nullable().openapi({
    description: "Instagram profile URL",
    example: "https://instagram.com/acme",
  }),
  facebookUrl: z.string().nullable().openapi({
    description: "Facebook page URL",
    example: "https://facebook.com/acme",
  }),
  logoUrl: z.string().nullable().openapi({
    description: "URL to the company logo",
    example: "https://example.com/logo.png",
  }),
  ceoName: z.string().nullable().openapi({
    description: "Name of the CEO or founder",
    example: "Jane Smith",
  }),
  financeContact: z.string().nullable().openapi({
    description: "Name of the finance/AP contact for invoicing",
    example: "John Doe",
  }),
  financeContactEmail: z.string().nullable().openapi({
    description: "Email of the finance/AP contact",
    example: "finance@acme.com",
  }),
  primaryLanguage: z.string().nullable().openapi({
    description: "Primary business language (ISO 639-1 code)",
    example: "en",
  }),
  fiscalYearEnd: z.string().nullable().openapi({
    description: "Month when the fiscal year ends",
    example: "December",
  }),
  enrichmentStatus: z.string().nullable().openapi({
    description: "Status of the enrichment process",
    example: "completed",
  }),
  enrichedAt: z.string().nullable().openapi({
    description: "When the customer was last enriched",
    example: "2024-05-01T12:34:56.789Z",
  }),
});

export const customersResponseSchema = z.object({
  meta: z
    .object({
      cursor: z.string().nullable().openapi({
        description:
          "Cursor for the next page of results, null if no more pages",
        example: "eyJpZCI6IjQ1NiJ9",
      }),
      hasPreviousPage: z.boolean().openapi({
        description:
          "Whether there are more customers available on the previous page",
        example: false,
      }),
      hasNextPage: z.boolean().openapi({
        description:
          "Whether there are more customers available on the next page",
        example: true,
      }),
    })
    .openapi({
      description: "Pagination metadata for the customers response",
    }),
  data: z.array(customerResponseSchema).openapi({
    description: "Array of customers matching the query criteria",
  }),
});

export const getCustomerByIdSchema = z.object({
  id: z.string().openapi({
    description: "Unique identifier of the customer to retrieve",
    example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
    param: {
      in: "path",
      name: "id",
    },
  }),
});

export const getCustomerInvoiceSummarySchema = z.object({
  id: z.string().openapi({
    description: "Unique identifier of the customer",
    example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
    param: {
      in: "path",
      name: "id",
    },
  }),
});

export const customerInvoiceSummaryResponseSchema = z.object({
  totalAmount: z.number().openapi({
    description: "Total amount of all invoices",
    example: 10021.5,
  }),
  paidAmount: z.number().openapi({
    description: "Total amount of paid invoices",
    example: 5320.5,
  }),
  outstandingAmount: z.number().openapi({
    description: "Total amount of unpaid and overdue invoices",
    example: 4701.0,
  }),
  invoiceCount: z.number().openapi({
    description: "Total number of invoices",
    example: 5,
  }),
  currency: z.string().openapi({
    description: "Currency code",
    example: "EUR",
  }),
});

export const deleteCustomerSchema = z.object({
  id: z.string().openapi({
    description: "Unique identifier of the customer to delete",
    example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
    param: {
      in: "path",
      name: "id",
    },
  }),
});

export const enrichCustomerSchema = z.object({
  id: z.string().uuid().openapi({
    description: "Unique identifier of the customer to enrich",
    example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
  }),
});

export const enrichCustomerResponseSchema = z.object({
  queued: z.boolean().openapi({
    description: "Whether the enrichment job was successfully queued",
    example: true,
  }),
});

export const upsertCustomerSchema = z.object({
  id: z.string().uuid().optional().openapi({
    description:
      "Unique identifier of the customer. Required for updates, omit for new customers",
    example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
  }),
  name: z.string().openapi({
    description: "Name of the customer or organization",
    example: "Acme Corporation",
  }),
  email: z.string().email().openapi({
    description: "Primary email address of the customer",
    example: "contact@acme.com",
  }),
  billingEmail: z
    .string()
    .nullable()
    .optional()
    .refine(isValidEmailList, {
      message: "All billing emails must be valid and unique",
    })
    .openapi({
      description:
        "Billing email addresses of the customer (comma-separated for multiple)",
      example: "finance@acme.com, accounting@acme.com",
    }),
  country: z.string().nullable().optional().openapi({
    description: "Country name where the customer is located",
    example: "United States",
  }),
  addressLine1: z.string().nullable().optional().openapi({
    description: "First line of the customer's address",
    example: "123 Main Street",
  }),
  addressLine2: z.string().nullable().optional().openapi({
    description:
      "Second line of the customer's address (suite, apartment, etc.)",
    example: "Suite 400",
  }),
  city: z.string().nullable().optional().openapi({
    description: "City where the customer is located",
    example: "San Francisco",
  }),
  state: z.string().nullable().optional().openapi({
    description: "State or province where the customer is located",
    example: "California",
  }),
  zip: z.string().nullable().optional().openapi({
    description: "ZIP or postal code of the customer's address",
    example: "94105",
  }),
  phone: z.string().nullable().optional().openapi({
    description: "Primary phone number of the customer",
    example: "+1-555-123-4567",
  }),
  website: z.string().nullable().optional().openapi({
    description: "Website URL of the customer",
    example: "https://acme.com",
  }),
  note: z.string().nullable().optional().openapi({
    description: "Internal notes about the customer for team reference",
    example: "Preferred contact method is email. Large enterprise client.",
  }),
  vatNumber: z.string().nullable().optional().openapi({
    description: "VAT (Value Added Tax) number of the customer",
    example: "US123456789",
  }),
  countryCode: z.string().nullable().optional().openapi({
    description: "Country code in ISO 3166-1 alpha-2 format",
    example: "US",
  }),
  contact: z.string().nullable().optional().openapi({
    description: "Primary contact person's name at the customer organization",
    example: "John Smith",
  }),
  portalHideSubscriptionCta: z.boolean().optional().openapi({
    description:
      "Whether to hide the subscription upsell banner in the customer portal workspace tab",
    example: false,
  }),
  portalBillingType: z.enum(["subscription", "fixed"]).optional().openapi({
    description: "Portal billing mode for this customer",
    example: "fixed",
  }),
  portalProjectName: z.string().nullable().optional().openapi({
    description: "Fixed-price project name shown in client portal billing",
    example: "Custom Next.js MVP",
  }),
  portalProjectTotal: z.string().nullable().optional().openapi({
    description: "Fixed-price contract total shown in client portal billing",
    example: "$8,500",
  }),
  tags: z
    .array(
      z.object({
        id: z.string().uuid().openapi({
          description: "Unique identifier of the tag",
          example: "e7a9c1a2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
        }),
        name: z.string().openapi({
          description: "Display name of the tag",
          example: "VIP",
        }),
      }),
    )
    .optional()
    .openapi({
      description:
        "Array of tags to associate with the customer for categorization",
      example: [
        { id: "e7a9c1a2-4c2a-4e7a-9c1a-2b7c1e24c2a4", name: "VIP" },
        { id: "f1b2c3d4-5678-4e7a-9c1a-2b7c1e24c2a4", name: "Enterprise" },
      ],
    }),
});

export const toggleCustomerPortalSchema = z.object({
  customerId: z.string().uuid().openapi({
    description: "Unique identifier of the customer",
    example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
  }),
  enabled: z.boolean().openapi({
    description: "Whether to enable or disable the customer portal",
    example: true,
  }),
});

export const createCustomerSubscriptionCheckoutSchema = z.object({
  customerId: z.string().uuid().openapi({
    description: "Unique identifier of the customer",
    example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
  }),
  plan: z
    .enum([
      "webflow_sprint",
      "custom_mvp",
      "dedicated_partner_monthly",
      "dedicated_partner_quarterly",
      "dedicated_partner_annual",
      "white_label_agency",
    ])
    .openapi({
      description: "Offer to create checkout for",
      example: "dedicated_partner_monthly",
    }),
  requestedPrice: z.string().optional().openapi({
    description: "Optional display price recorded in metadata",
    example: "$2,500/mo",
  }),
  embedOrigin: z.string().url().openapi({
    description: "Origin where checkout will be embedded or launched from",
    example: "http://localhost:3001",
  }),
});

export const getCustomerByPortalIdSchema = z.object({
  portalId: z.string().openapi({
    description: "Short ID for the customer portal URL",
    example: "X7kM9nPq",
    param: {
      in: "path",
      name: "portalId",
    },
  }),
});

export const sendPortalLoginLinkSchema = z.object({
  portalId: z.string().openapi({
    description: "Short ID for the customer portal URL",
    example: "X7kM9nPq",
  }),
  email: z.string().email().openapi({
    description: "Customer email on file used for portal sign in",
    example: "contact@acme.com",
  }),
});

export const verifyPortalLoginCodeSchema = z.object({
  portalId: z.string().openapi({
    description: "Short ID for the customer portal URL",
    example: "X7kM9nPq",
  }),
  email: z.string().email().openapi({
    description: "Customer email on file used for portal sign in",
    example: "contact@acme.com",
  }),
  code: z.string().regex(/^\d{6}$/).openapi({
    description: "6-digit verification code",
    example: "123456",
  }),
});

const portalAccessSchema = z.object({
  portalId: z.string().openapi({
    description: "Short ID for the customer portal URL",
    example: "X7kM9nPq",
  }),
});

export const verifyPortalAccessSchema = portalAccessSchema;
export const getPortalManageSubscriptionUrlSchema = portalAccessSchema;

export const getPortalInvoicesSchema = z.object({
  ...portalAccessSchema.shape,
  cursor: z.string().nullish().openapi({
    description: "Cursor for pagination",
    example: "10",
  }),
  pageSize: z.number().min(1).max(50).optional().openapi({
    description: "Number of invoices to return per page",
    example: 10,
  }),
});

export const portalRequestStatusSchema = z.enum([
  "backlog",
  "in_progress",
  "in_qa",
  "awaiting_review",
  "completed",
]);

const portalRequestAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(260).openapi({
    description: "Attachment filename",
    example: "brand-guidelines.pdf",
  }),
  path: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(32)
    .openapi({
      description: "Storage path tokens for the attachment",
      example: [
        "team_123",
        "customers",
        "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
        "portal-requests",
        "1739901234_brand-guidelines.pdf",
      ],
    }),
  size: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024)
    .openapi({
      description: "Attachment file size in bytes",
      example: 183420,
    }),
  type: z.string().trim().min(1).max(120).openapi({
    description: "Attachment MIME type",
    example: "application/pdf",
  }),
});

const portalRequestResourceSchema = z.object({
  label: z.string().trim().min(1).max(80).openapi({
    description: "Readable resource label",
    example: "Figma Design",
  }),
  url: z.string().url().openapi({
    description: "Resource URL",
    example: "https://figma.com/file/abc123",
  }),
});

const portalUploadScopeSchema = z.enum(["request", "message"]);

const portalMessageAttachmentSchema = portalRequestAttachmentSchema;

export const getPortalRequestsSchema = portalAccessSchema;

export const createPortalRequestSchema = z.object({
  ...portalAccessSchema.shape,
  title: z.string().trim().min(3).max(160).openapi({
    description: "Short title for a new client request",
    example: "Add project health widget to dashboard",
  }),
  details: z.string().trim().max(2000).nullish().openapi({
    description: "Optional details and acceptance criteria for the request",
    example: "Include weekly trend + drilldown by project owner.",
  }),
  requestedBy: z.string().trim().max(120).nullish().openapi({
    description: "Optional requester display name",
    example: "Connor",
  }),
  attachments: z
    .array(portalRequestAttachmentSchema)
    .max(10)
    .optional()
    .openapi({
      description: "Optional file attachments uploaded with the request",
    }),
});

export const createPortalAttachmentUploadSchema = z.object({
  ...portalAccessSchema.shape,
  fileName: z.string().trim().min(1).max(260).openapi({
    description: "Original file name for the attachment upload",
    example: "scope-notes.docx",
  }),
  contentType: z.string().trim().min(1).max(120).openapi({
    description: "MIME type of the file being uploaded",
    example:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }),
  scope: portalUploadScopeSchema.optional().openapi({
    description: "Whether upload is for a queue request or message thread",
    example: "message",
  }),
});

export const reorderPortalRequestsSchema = z.object({
  ...portalAccessSchema.shape,
  requestIds: z.array(z.string().uuid()).openapi({
    description: "Backlog request IDs in their new priority order",
    example: [
      "8b6f4ee8-23c2-4a34-bb46-c53e6561c7d2",
      "6226678f-a278-4f9a-b630-b9c770017347",
    ],
  }),
});

export const getPortalAssetsSchema = z.object({
  ...portalAccessSchema.shape,
  pageSize: z.number().min(1).max(50).optional().openapi({
    description: "Number of vault assets to return",
    example: 12,
  }),
});

export const getCustomerPortalRequestsSchema = z.object({
  customerId: z.string().uuid().openapi({
    description: "Unique identifier of the customer",
    example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
  }),
});

export const getPortalMessagesSchema = portalAccessSchema;

export const createPortalMessageSchema = z.object({
  ...portalAccessSchema.shape,
  requestId: z.string().uuid().optional().nullable().openapi({
    description: "Optional request ID to associate the message with",
    example: "8b6f4ee8-23c2-4a34-bb46-c53e6561c7d2",
  }),
  senderName: z.string().trim().max(120).optional().nullable().openapi({
    description: "Optional sender name override",
    example: "Connor",
  }),
  message: z.string().trim().min(1).max(5000).openapi({
    description: "Message body",
    example: "Can we move this deliverable to Friday?",
  }),
  attachments: z
    .array(portalMessageAttachmentSchema)
    .max(10)
    .optional()
    .openapi({
      description: "Optional message attachments",
    }),
});

export const getCustomerPortalMessagesSchema = z.object({
  customerId: z.string().uuid().openapi({
    description: "Unique identifier of the customer",
    example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
  }),
});

export const createCustomerPortalMessageSchema = z.object({
  customerId: z.string().uuid().openapi({
    description: "Unique identifier of the customer",
    example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
  }),
  requestId: z.string().uuid().optional().nullable().openapi({
    description: "Optional request ID to associate the message with",
    example: "8b6f4ee8-23c2-4a34-bb46-c53e6561c7d2",
  }),
  message: z.string().trim().min(1).max(5000).openapi({
    description: "Message body",
    example: "I pushed the update and attached the QA notes.",
  }),
  attachments: z
    .array(portalMessageAttachmentSchema)
    .max(10)
    .optional()
    .openapi({
      description: "Optional message attachments",
    }),
});

export const updateCustomerPortalRequestSchema = z
  .object({
    customerId: z.string().uuid().openapi({
      description: "Unique identifier of the customer",
      example: "b3b7c1e2-4c2a-4e7a-9c1a-2b7c1e24c2a4",
    }),
    requestId: z.string().uuid().openapi({
      description: "Unique identifier of the client request",
      example: "8b6f4ee8-23c2-4a34-bb46-c53e6561c7d2",
    }),
    status: portalRequestStatusSchema.optional().openapi({
      description: "Updated request status",
      example: "in_progress",
    }),
    resources: z
      .array(portalRequestResourceSchema)
      .max(10)
      .optional()
      .openapi({
        description: "Attached delivery resources for this request",
        example: [
          {
            label: "Figma File",
            url: "https://figma.com/file/abc123",
          },
          {
            label: "Loom Demo",
            url: "https://loom.com/share/xyz987",
          },
        ],
      }),
  })
  .refine(
    (input) => input.status !== undefined || input.resources !== undefined,
    {
      message: "At least one of status or resources must be provided",
      path: ["status"],
    },
  );
