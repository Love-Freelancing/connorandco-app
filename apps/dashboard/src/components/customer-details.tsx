"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@connorco/ui/accordion";
import { Badge } from "@connorco/ui/badge";
import { Button } from "@connorco/ui/button";
import { cn } from "@connorco/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@connorco/ui/dropdown-menu";
import { Icons } from "@connorco/ui/icons";
import { Input } from "@connorco/ui/input";
import { SheetHeader } from "@connorco/ui/sheet";
import { Skeleton } from "@connorco/ui/skeleton";
import { Switch } from "@connorco/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@connorco/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@connorco/ui/tabs";
import { Textarea } from "@connorco/ui/textarea";
import { useToast } from "@connorco/ui/use-toast";
import { TZDate } from "@date-fns/tz";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyInput } from "@/components/copy-input";
import { OpenURL } from "@/components/open-url";
import { useCustomerParams } from "@/hooks/use-customer-params";
import { useInvoiceParams } from "@/hooks/use-invoice-params";
import { useRealtime } from "@/hooks/use-realtime";
import { useUserQuery } from "@/hooks/use-user";
import { downloadFile } from "@/lib/download";
import { useTRPC } from "@/trpc/client";
import { getWebsiteLogo } from "@/utils/logos";
import { CustomerDetailsSkeleton } from "./customer-details.loading";
import { CustomerPortalRequestsManager } from "./customer-portal-requests-manager";
import { FormatAmount } from "./format-amount";
import { InvoiceStatus } from "./invoice-status";

type CustomerSubscriptionPlan =
  | "webflow_sprint"
  | "custom_mvp"
  | "dedicated_partner_monthly"
  | "dedicated_partner_quarterly"
  | "dedicated_partner_annual"
  | "white_label_agency";

const CUSTOMER_SUBSCRIPTION_OPTIONS: Array<{
  value: CustomerSubscriptionPlan;
  label: string;
  price: string;
  description: string;
}> = [
  {
    value: "webflow_sprint",
    label: "Webflow Sprint",
    price: "$3,000+",
    description: "One-off project, 2-3 week turnaround",
  },
  {
    value: "custom_mvp",
    label: "Custom MVP",
    price: "$8,000-$15,000+",
    description: "One-off project, 4-8 week turnaround",
  },
  {
    value: "dedicated_partner_monthly",
    label: "Dedicated Partner Monthly",
    price: "$2,500/mo",
    description: "Unlimited requests, one active task",
  },
  {
    value: "dedicated_partner_quarterly",
    label: "Dedicated Partner Quarterly",
    price: "$6,750/quarter",
    description: "Subscription with quarterly prepay",
  },
  {
    value: "dedicated_partner_annual",
    label: "Dedicated Partner Annual",
    price: "$25,000/year",
    description: "Subscription with annual prepay",
  },
  {
    value: "white_label_agency",
    label: "White-Label Agency Work",
    price: "$3,000+",
    description: "Agency delivery partnership",
  },
];

type PortalAdminTab =
  | "pipeline"
  | "messages"
  | "scratchpad"
  | "customize"
  | "billing"
  | "settings";
type PortalBillingType = "subscription" | "fixed";

type CustomerDetailsProps = {
  customerId?: string;
  mode?: "sheet" | "page";
};

// Format timezone with local time and relative difference
function formatTimezoneWithLocalTime(timezone: string): {
  localTime: string;
  relative: string;
} {
  try {
    const now = new Date();

    // Get the local time in the customer's timezone using user's locale
    const customerTime = new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(now);

    // Calculate hour difference
    const customerDate = new Date(
      now.toLocaleString("en-US", { timeZone: timezone }),
    );
    const userDate = new Date(now.toLocaleString("en-US"));
    const diffMs = customerDate.getTime() - userDate.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    // Format relative time
    let relative: string;
    if (diffHours === 0) {
      relative = "same time";
    } else if (diffHours > 0) {
      relative = `${diffHours}h ahead`;
    } else {
      relative = `${Math.abs(diffHours)}h behind`;
    }

    return { localTime: customerTime, relative };
  } catch {
    return { localTime: "", relative: "" };
  }
}

export function CustomerDetails({
  customerId: customerIdFromProps,
  mode = "sheet",
}: CustomerDetailsProps = {}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: user } = useUserQuery();
  const { customerId: customerIdFromParams, setParams } = useCustomerParams();
  const customerId = customerIdFromProps ?? customerIdFromParams;
  const isPageMode = mode === "page";
  const { setParams: setInvoiceParams } = useInvoiceParams();
  const { toast } = useToast();
  const dropdownContainerRef = useRef<HTMLDivElement>(null!);

  // Track enrichment animation - use a key that changes when enrichment completes
  const [enrichmentAnimationKey, setEnrichmentAnimationKey] = useState(0);
  const prevEnrichmentStatusRef = useRef<string | null>(null);
  const [creatingSubscriptionPlan, setCreatingSubscriptionPlan] =
    useState<CustomerSubscriptionPlan | null>(null);
  const [portalAdminTab, setPortalAdminTab] =
    useState<PortalAdminTab>("pipeline");
  const [scratchpadDraft, setScratchpadDraft] = useState("");
  const [hidePortalSubscriptionCta, setHidePortalSubscriptionCta] =
    useState(false);
  const [portalBillingType, setPortalBillingType] =
    useState<PortalBillingType>("subscription");
  const [portalProjectNameDraft, setPortalProjectNameDraft] = useState("");
  const [portalProjectTotalDraft, setPortalProjectTotalDraft] = useState("");
  const [activeEngagement, setActiveEngagement] = useState<string | null>(null);

  const isOpen = Boolean(customerId);

  // Toggle portal mutation
  const togglePortalMutation = useMutation(
    trpc.customers.togglePortal.mutationOptions({
      onSuccess: () => {
        // Invalidate customer query to refresh portal data
        queryClient.invalidateQueries({
          queryKey: trpc.customers.getById.queryKey({ id: customerId! }),
        });
      },
      onError: () => {
        toast({
          title: "Failed to update customer portal",
          description: "Please try again.",
          duration: 2500,
        });
      },
    }),
  );
  const createCustomerSubscriptionCheckoutMutation = useMutation(
    trpc.customers.createCustomerSubscriptionCheckout.mutationOptions(),
  );
  const upsertCustomerMutation = useMutation(
    trpc.customers.upsert.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.customers.getById.queryKey({ id: customerId! }),
        });
      },
    }),
  );

  const {
    data: customer,
    isLoading: isLoadingCustomer,
    refetch,
  } = useQuery({
    ...trpc.customers.getById.queryOptions({ id: customerId! }),
    enabled: isOpen,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds - prevents excessive refetches when reopening
  });

  // Mutation for re-enriching customer
  const enrichMutation = useMutation(
    trpc.customers.enrich.mutationOptions({
      onMutate: async () => {
        // Cancel outgoing refetches
        await queryClient.cancelQueries({
          queryKey: trpc.customers.getById.queryKey({ id: customerId! }),
        });

        // Optimistically update to pending status
        queryClient.setQueryData(
          trpc.customers.getById.queryKey({ id: customerId! }),
          (old: typeof customer) =>
            old ? { ...old, enrichmentStatus: "pending" as const } : old,
        );
      },
      onError: (error) => {
        toast({
          duration: 3000,
          variant: "destructive",
          title: "Enrichment failed",
          description: error.message,
        });
      },
      onSettled: () => {
        // Refetch after mutation settles
        refetch();
      },
    }),
  );

  // Mutation for cancelling enrichment
  const cancelEnrichmentMutation = useMutation({
    ...trpc.customers.cancelEnrichment.mutationOptions(),
    onSuccess: () => {
      refetch();
    },
  });

  // Mutation for clearing enrichment data
  const clearEnrichmentMutation = useMutation({
    ...trpc.customers.clearEnrichment.mutationOptions(),
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      toast({
        duration: 3000,
        variant: "destructive",
        title: "Failed to clear data",
        description: error.message,
      });
    },
  });

  const handleStartEnrich = () => {
    if (customerId) {
      enrichMutation.mutate({ id: customerId });
    }
  };

  const handleCancelEnrich = () => {
    if (customerId) {
      cancelEnrichmentMutation.mutate({ id: customerId });
    }
  };

  const handleClearEnrichment = () => {
    if (customerId) {
      clearEnrichmentMutation.mutate({ id: customerId });
    }
  };

  const handleCreateCustomerSubscription = async (
    plan: CustomerSubscriptionPlan,
  ) => {
    if (!customer || createCustomerSubscriptionCheckoutMutation.isPending) {
      return;
    }

    const selectedOption = CUSTOMER_SUBSCRIPTION_OPTIONS.find(
      (option) => option.value === plan,
    );

    setCreatingSubscriptionPlan(plan);

    try {
      const result =
        await createCustomerSubscriptionCheckoutMutation.mutateAsync({
          customerId: customer.id,
          plan,
          requestedPrice: selectedOption?.price,
          embedOrigin: window.location.origin,
        });

      if (!result?.url) {
        throw new Error("Missing checkout URL");
      }

      const engagementLabel = selectedOption
        ? `${selectedOption.label} · ${selectedOption.price}`
        : null;
      if (engagementLabel) {
        setActiveEngagement(engagementLabel);
        try {
          window.localStorage.setItem(
            `customer-active-engagement:${customer.id}`,
            engagementLabel,
          );
        } catch {
          // Best-effort persistence only
        }
      }

      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast({
        duration: 3000,
        variant: "error",
        title:
          error instanceof Error
            ? error.message
            : "Failed to create subscription checkout",
      });
    } finally {
      setCreatingSubscriptionPlan(null);
    }
  };

  const handleSaveScratchpad = async () => {
    if (!customer || upsertCustomerMutation.isPending) {
      return;
    }

    const upsertPayload = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      billingEmail: customer.billingEmail,
      country: customer.country,
      addressLine1: customer.addressLine1,
      addressLine2: customer.addressLine2,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
      note: scratchpadDraft.trim() || null,
      website: customer.website,
      phone: customer.phone,
      vatNumber: customer.vatNumber,
      countryCode: customer.countryCode,
      contact: customer.contact,
      tags: customer.tags,
      portalHideSubscriptionCta: hidePortalSubscriptionCta,
    };

    try {
      await upsertCustomerMutation.mutateAsync(upsertPayload);

      toast({
        title: "Scratchpad saved",
        duration: 1800,
      });
    } catch (error) {
      toast({
        variant: "error",
        duration: 3000,
        title: error instanceof Error ? error.message : "Failed to save note",
      });
    }
  };

  const handleSavePortalCustomization = async () => {
    if (!customer || upsertCustomerMutation.isPending) {
      return;
    }

    const upsertPayload = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      billingEmail: customer.billingEmail,
      country: customer.country,
      addressLine1: customer.addressLine1,
      addressLine2: customer.addressLine2,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
      note: customer.note,
      website: customer.website,
      phone: customer.phone,
      vatNumber: customer.vatNumber,
      countryCode: customer.countryCode,
      contact: customer.contact,
      tags: customer.tags,
      portalHideSubscriptionCta: hidePortalSubscriptionCta,
      portalBillingType,
      portalProjectName:
        portalBillingType === "fixed"
          ? portalProjectNameDraft.trim() || null
          : null,
      portalProjectTotal:
        portalBillingType === "fixed"
          ? portalProjectTotalDraft.trim() || null
          : null,
    };

    try {
      await upsertCustomerMutation.mutateAsync(upsertPayload);

      toast({
        title: "Portal customization saved",
        duration: 1800,
      });
    } catch (error) {
      toast({
        variant: "error",
        duration: 3000,
        title:
          error instanceof Error ? error.message : "Failed to save settings",
      });
    }
  };

  const isEnriching =
    customer?.enrichmentStatus === "pending" ||
    customer?.enrichmentStatus === "processing" ||
    enrichMutation.isPending;

  // Track enrichment status changes to trigger animation only when transitioning from loading to complete
  useEffect(() => {
    const prevStatus = prevEnrichmentStatusRef.current;
    const currentStatus = customer?.enrichmentStatus;

    // Increment key to trigger animation when transitioning from pending/processing to completed
    if (
      (prevStatus === "pending" || prevStatus === "processing") &&
      currentStatus === "completed"
    ) {
      setEnrichmentAnimationKey((k) => k + 1);
    }

    prevEnrichmentStatusRef.current = currentStatus ?? null;
  }, [customer?.enrichmentStatus]);

  // Reset animation state when sheet closes
  useEffect(() => {
    if (!isOpen) {
      prevEnrichmentStatusRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!customer) {
      return;
    }

    setScratchpadDraft(customer.note ?? "");
    setHidePortalSubscriptionCta(customer.portalHideSubscriptionCta ?? false);
    setPortalBillingType(
      customer.portalBillingType === "fixed" ? "fixed" : "subscription",
    );
    setPortalProjectNameDraft(customer.portalProjectName ?? "");
    setPortalProjectTotalDraft(customer.portalProjectTotal ?? "");

    try {
      const storedPlan = window.localStorage.getItem(
        `customer-active-engagement:${customer.id}`,
      );
      setActiveEngagement(storedPlan || null);
    } catch {
      setActiveEngagement(null);
    }
  }, [customer]);

  // Subscribe to realtime updates for this customer
  useRealtime({
    channelName: "realtime_customers",
    events: ["UPDATE"],
    table: "customers",
    filter: customerId ? `id=eq.${customerId}` : undefined,
    onEvent: (payload) => {
      // Refetch customer data when enrichment status changes
      if (payload.new && "enrichment_status" in payload.new) {
        refetch();
      }
    },
  });

  const infiniteQueryOptions = trpc.invoice.get.infiniteQueryOptions(
    {
      customers: customerId ? [customerId] : undefined,
      pageSize: 5,
    },
    {
      getNextPageParam: ({ meta }) => meta?.cursor,
    },
  );

  const {
    data: invoicesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...infiniteQueryOptions,
    enabled: isOpen,
  });

  const invoices = useMemo(() => {
    return invoicesData?.pages.flatMap((page) => page.data) ?? [];
  }, [invoicesData]);

  // Get invoice summary from server
  const { data: summary } = useQuery({
    ...trpc.customers.getInvoiceSummary.queryOptions({ id: customerId! }),
    enabled: isOpen && Boolean(customerId),
  });

  const handleDownloadInvoice = (invoiceId: string) => {
    if (!user?.fileKey) {
      console.error("File key not available");
      return;
    }
    const url = new URL(
      `${process.env.NEXT_PUBLIC_API_URL}/files/download/invoice`,
    );
    url.searchParams.set("id", invoiceId);
    url.searchParams.set("fk", user.fileKey);
    downloadFile(url.toString(), "invoice.pdf");
  };

  if (isLoadingCustomer) {
    return <CustomerDetailsSkeleton />;
  }

  if (!customer) {
    return null;
  }

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const handleEdit = () => {
    setParams({ customerId: customerId!, details: null });
  };

  // Check if customer has any enrichment data
  const hasEnrichmentData =
    customer?.description ||
    customer?.industry ||
    customer?.companyType ||
    customer?.employeeCount ||
    customer?.fundingStage;
  const creatingPlanLabel = CUSTOMER_SUBSCRIPTION_OPTIONS.find(
    (option) => option.value === creatingSubscriptionPlan,
  )?.label;
  const activeEngagementLabel = activeEngagement ?? "Not set";

  return (
    <div
      className={cn(
        isPageMode ? "w-full" : "h-full flex flex-col min-h-0 -mx-6",
      )}
    >
      {/* Content */}
      <div
        className={cn(
          isPageMode
            ? "w-full"
            : "flex-1 overflow-y-auto scrollbar-hide min-h-0",
        )}
      >
        <SheetHeader
          className={cn(
            "flex justify-between items-center flex-row",
            isPageMode ? "mb-6 px-6 pt-6" : "px-6 mb-4",
          )}
        >
          <div className="min-w-0 flex-1 flex items-center gap-3">
            {/* Logo from logo.dev */}
            {isEnriching ? (
              <Skeleton className="size-9 rounded-full flex-shrink-0" />
            ) : customer.website ? (
              <img
                src={getWebsiteLogo(customer.website)}
                alt={`${customer.name} logo`}
                className="size-9 rounded-full object-cover flex-shrink-0 bg-muted"
                onError={(e) => {
                  // Fallback to initials on error
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget.nextElementSibling;
                  if (fallback) fallback.classList.remove("hidden");
                }}
              />
            ) : null}
            <div
              className={cn(
                "size-9 rounded-full flex items-center justify-center bg-muted text-muted-foreground font-medium flex-shrink-0",
                customer.website && "hidden",
              )}
            >
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <h2 className="text-lg font-serif truncate">{customer.name}</h2>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleEdit}>
              Edit
            </Button>

            {/* Actions menu */}
            {customer.website && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <Icons.MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isEnriching ? (
                    <DropdownMenuItem onClick={handleCancelEnrich}>
                      <Icons.Close className="size-4 mr-2" />
                      Cancel enrichment
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={handleStartEnrich}>
                      <Icons.RefreshOutline className="size-4 mr-2" />
                      {hasEnrichmentData ? "Refresh data" : "Enrich company"}
                    </DropdownMenuItem>
                  )}
                  {hasEnrichmentData && !isEnriching && (
                    <DropdownMenuItem
                      onClick={handleClearEnrichment}
                      className="text-destructive"
                    >
                      <Icons.Delete className="size-4 mr-2" />
                      Clear enrichment
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </SheetHeader>

        {/* Company info section */}
        {(customer.description ||
          customer.industry ||
          customer.companyType ||
          customer.employeeCount ||
          customer.fundingStage ||
          isEnriching) && (
          <div className="px-6 pb-4 border-b border-border">
            {/* Description */}
            {isEnriching ? (
              <div className="space-y-1.5">
                <Skeleton className="h-[13px] w-full" />
                <Skeleton className="h-[13px] w-4/5" />
              </div>
            ) : customer.description ? (
              <p className="text-[13px] text-[#606060] line-clamp-2">
                {customer.description}
              </p>
            ) : null}

            {/* Badges */}
            {isEnriching ? (
              <div className="flex items-center gap-2 mt-3">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
            ) : customer.industry ||
              customer.companyType ||
              customer.employeeCount ||
              customer.fundingStage ? (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {customer.industry && (
                  <Badge variant="tag">{customer.industry}</Badge>
                )}
                {customer.companyType && (
                  <Badge variant="tag">{customer.companyType}</Badge>
                )}
                {customer.employeeCount && (
                  <Badge variant="tag">
                    {customer.employeeCount} employees
                  </Badge>
                )}
                {customer.fundingStage && (
                  <Badge variant="tag">{customer.fundingStage}</Badge>
                )}
              </div>
            ) : null}
          </div>
        )}

        <div className="px-6 pb-4">
          <Accordion
            type="multiple"
            defaultValue={["general", "profile"]}
            className="space-y-0"
          >
            {/* General Section */}
            <AccordionItem value="general" className="border-b border-border">
              <AccordionTrigger className="text-[16px] font-medium py-4">
                General
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-2 gap-4 pt-0">
                  {customer.contact && (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Contact person
                      </div>
                      <div className="text-[14px]">{customer.contact}</div>
                    </div>
                  )}
                  {customer.email && (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Email
                      </div>
                      <div className="text-[14px]">{customer.email}</div>
                    </div>
                  )}
                  {customer.billingEmail && (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Billing Email
                      </div>
                      <div className="text-[14px]">{customer.billingEmail}</div>
                    </div>
                  )}
                  {customer.phone && (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Phone
                      </div>
                      <div className="text-[14px]">{customer.phone}</div>
                    </div>
                  )}
                  {customer.website && (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Website
                      </div>
                      <div className="text-[14px]">{customer.website}</div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Company Profile Section - Only show if we have enrichment data, it's processing, or failed */}
            {(hasEnrichmentData ||
              isEnriching ||
              customer.enrichmentStatus === "completed" ||
              customer.enrichmentStatus === "failed") && (
              <AccordionItem value="profile" className="border-b border-border">
                <AccordionTrigger className="text-[16px] font-medium py-4">
                  Company Profile
                </AccordionTrigger>
                <AccordionContent>
                  {isEnriching ? (
                    <div className="grid grid-cols-2 gap-4 pt-0">
                      {[...Array(6)].map((_, i) => (
                        <div
                          key={`skeleton-${i.toString()}`}
                          className="space-y-2"
                        >
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-5 w-28" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <motion.div
                      key={enrichmentAnimationKey}
                      className="grid grid-cols-2 gap-4 pt-0"
                      initial={enrichmentAnimationKey > 0 ? "hidden" : false}
                      animate="visible"
                      variants={{
                        hidden: { opacity: 0 },
                        visible: {
                          opacity: 1,
                          transition: {
                            staggerChildren:
                              enrichmentAnimationKey > 0 ? 0.02 : 0,
                            delayChildren: 0,
                          },
                        },
                      }}
                    >
                      {customer.industry && (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            Industry
                          </div>
                          <div className="text-[14px]">{customer.industry}</div>
                        </motion.div>
                      )}
                      {customer.companyType && (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            Company Type
                          </div>
                          <div className="text-[14px]">
                            {customer.companyType}
                          </div>
                        </motion.div>
                      )}
                      {customer.employeeCount && (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            Employees
                          </div>
                          <div className="text-[14px]">
                            {customer.employeeCount}
                          </div>
                        </motion.div>
                      )}
                      {customer.foundedYear && (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            Founded
                          </div>
                          <div className="text-[14px]">
                            {customer.foundedYear}
                          </div>
                        </motion.div>
                      )}
                      {customer.estimatedRevenue && (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            Est. Revenue
                          </div>
                          <div className="text-[14px]">
                            {customer.estimatedRevenue}
                          </div>
                        </motion.div>
                      )}
                      {(customer.fundingStage || customer.totalFunding) && (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            Funding
                          </div>
                          <div className="text-[14px]">
                            {customer.fundingStage}
                            {customer.totalFunding &&
                              ` (${customer.totalFunding})`}
                          </div>
                        </motion.div>
                      )}
                      {customer.headquartersLocation && (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            Headquarters
                          </div>
                          <div className="text-[14px]">
                            {customer.headquartersLocation}
                          </div>
                        </motion.div>
                      )}
                      {customer.ceoName && (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            CEO / Founder
                          </div>
                          <div className="text-[14px]">{customer.ceoName}</div>
                        </motion.div>
                      )}
                      {(customer.financeContact ||
                        customer.financeContactEmail) && (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            Finance Contact
                          </div>
                          <div className="text-[14px]">
                            {customer.financeContact && (
                              <div>{customer.financeContact}</div>
                            )}
                            {customer.financeContactEmail && (
                              <a
                                href={`mailto:${customer.financeContactEmail}`}
                                className="hover:text-[#606060] transition-colors"
                              >
                                {customer.financeContactEmail}
                              </a>
                            )}
                          </div>
                        </motion.div>
                      )}
                      {customer.primaryLanguage && (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            Language
                          </div>
                          <div className="text-[14px]">
                            {customer.primaryLanguage}
                          </div>
                        </motion.div>
                      )}
                      {customer.fiscalYearEnd && (
                        <motion.div
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            Fiscal Year End
                          </div>
                          <div className="text-[14px]">
                            {customer.fiscalYearEnd}
                          </div>
                        </motion.div>
                      )}
                      {customer.timezone &&
                        (() => {
                          const tz = formatTimezoneWithLocalTime(
                            customer.timezone,
                          );
                          return (
                            <motion.div
                              variants={{
                                hidden: { opacity: 0, y: 10, scale: 0.95 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: {
                                    duration: 0.3,
                                    ease: "easeOut",
                                  },
                                },
                              }}
                            >
                              <div className="text-[12px] mb-2 text-[#606060]">
                                Local Time
                              </div>
                              <div className="text-[14px] flex items-center gap-1.5">
                                <span>{tz.localTime}</span>
                                <span className="text-[#878787]">
                                  ({tz.relative})
                                </span>
                              </div>
                            </motion.div>
                          );
                        })()}
                      {/* Social Links */}
                      {(customer.linkedinUrl ||
                        customer.twitterUrl ||
                        customer.instagramUrl ||
                        customer.facebookUrl ||
                        customer.website) && (
                        <motion.div
                          className="col-span-2"
                          variants={{
                            hidden: { opacity: 0, y: 8 },
                            visible: {
                              opacity: 1,
                              y: 0,
                              transition: { duration: 0.15, ease: "easeOut" },
                            },
                          }}
                        >
                          <div className="text-[12px] mb-2 text-[#606060]">
                            Links
                          </div>
                          <div className="flex items-center gap-3">
                            {customer.linkedinUrl && (
                              <a
                                href={customer.linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:opacity-70 transition-opacity"
                              >
                                <Icons.LinkedIn className="size-4" />
                              </a>
                            )}
                            {customer.twitterUrl && (
                              <a
                                href={customer.twitterUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground hover:opacity-70 transition-opacity"
                              >
                                <Icons.X className="size-4" />
                              </a>
                            )}
                            {customer.instagramUrl && (
                              <a
                                href={customer.instagramUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:opacity-70 transition-opacity"
                              >
                                <Icons.Instagram className="size-4" />
                              </a>
                            )}
                            {customer.facebookUrl && (
                              <a
                                href={customer.facebookUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:opacity-70 transition-opacity"
                              >
                                <Icons.Facebook className="size-4" />
                              </a>
                            )}
                            {customer.website && (
                              <a
                                href={
                                  customer.website.startsWith("http")
                                    ? customer.website
                                    : `https://${customer.website}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Icons.Globle className="size-5" />
                              </a>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {customer.enrichmentStatus === "failed" && (
                        <motion.div
                          className="col-span-2 text-[14px] text-[#606060]"
                          variants={{
                            hidden: { opacity: 0 },
                            visible: { opacity: 1 },
                          }}
                        >
                          Failed to fetch company information.
                          {customer.website && (
                            <Button
                              variant="link"
                              className="p-0 h-auto text-[14px] ml-1"
                              onClick={handleStartEnrich}
                            >
                              Try again
                            </Button>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Details Section */}
            <AccordionItem value="details" className="border-b border-border">
              <AccordionTrigger className="text-[16px] font-medium py-4">
                Details
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-2 gap-4 pt-0">
                  {customer.addressLine1 ? (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Address
                      </div>
                      <div className="text-[14px]">
                        {customer.addressLine1}
                        {customer.addressLine2 && `, ${customer.addressLine2}`}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Address
                      </div>
                      <div className="text-[14px] text-[#606060]">-</div>
                    </div>
                  )}
                  {customer.city ? (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        City
                      </div>
                      <div className="text-[14px]">{customer.city}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        City
                      </div>
                      <div className="text-[14px] text-[#606060]">-</div>
                    </div>
                  )}
                  {customer.state ? (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        State
                      </div>
                      <div className="text-[14px]">{customer.state}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        State
                      </div>
                      <div className="text-[14px] text-[#606060]">-</div>
                    </div>
                  )}
                  {customer.zip ? (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        ZIP Code
                      </div>
                      <div className="text-[14px]">{customer.zip}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        ZIP Code
                      </div>
                      <div className="text-[14px] text-[#606060]">-</div>
                    </div>
                  )}
                  {customer.country ? (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Country
                      </div>
                      <div className="text-[14px]">{customer.country}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Country
                      </div>
                      <div className="text-[14px] text-[#606060]">-</div>
                    </div>
                  )}
                  {customer.vatNumber ? (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        VAT Number
                      </div>
                      <div className="text-[14px]">{customer.vatNumber}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[12px] mb-2 text-[#606060]">
                        VAT Number
                      </div>
                      <div className="text-[14px] text-[#606060]">-</div>
                    </div>
                  )}
                  {customer.note ? (
                    <div className="col-span-2">
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Note
                      </div>
                      <div className="text-[14px]">{customer.note}</div>
                    </div>
                  ) : (
                    <div className="col-span-2">
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Note
                      </div>
                      <div className="text-[14px] text-[#606060]">-</div>
                    </div>
                  )}
                  {customer.tags && customer.tags.length > 0 ? (
                    <div className="col-span-2">
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Tags
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {customer.tags.map((tag) => (
                          <Link
                            href={`/transactions?tags=${tag.id}`}
                            key={tag.id}
                          >
                            <Badge
                              variant="tag"
                              className="whitespace-nowrap flex-shrink-0"
                            >
                              {tag.name}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="col-span-2">
                      <div className="text-[12px] mb-2 text-[#606060]">
                        Tags
                      </div>
                      <div className="text-[14px] text-[#606060]">-</div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Customer Portal Section */}
          <div className="border-t border-border pt-6 mt-6">
            <div className="mb-4">
              <h3 className="text-[16px] font-medium">Customer Portal</h3>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Pipeline, client messaging, billing, and settings in one place.
              </p>
            </div>

            <Tabs
              value={portalAdminTab}
              onValueChange={(value) =>
                setPortalAdminTab(value as PortalAdminTab)
              }
            >
              <TabsList className="h-auto w-full justify-start gap-1 rounded-xl bg-muted/40 p-1 ring-1 ring-border">
                <TabsTrigger
                  value="pipeline"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Pipeline
                </TabsTrigger>
                <TabsTrigger
                  value="messages"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Messages
                </TabsTrigger>
                <TabsTrigger
                  value="scratchpad"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Scratchpad
                </TabsTrigger>
                <TabsTrigger
                  value="customize"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Customize
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Billing & Subscriptions
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Settings & Links
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pipeline" className="mt-4">
                <CustomerPortalRequestsManager
                  customerId={customer.id}
                  section="pipeline"
                />
              </TabsContent>

              <TabsContent value="messages" className="mt-4">
                <CustomerPortalRequestsManager
                  customerId={customer.id}
                  section="messages"
                />
              </TabsContent>

              <TabsContent value="scratchpad" className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold tracking-tight text-foreground">
                      Internal Scratchpad (Private)
                    </h4>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Visible only to your team.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full px-4 text-xs"
                    onClick={() => void handleSaveScratchpad()}
                    disabled={upsertCustomerMutation.isPending}
                  >
                    {upsertCustomerMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>

                <Textarea
                  value={scratchpadDraft}
                  onChange={(event) => setScratchpadDraft(event.target.value)}
                  placeholder="Client context, handoff notes, upsell ideas..."
                  rows={10}
                  className="min-h-[340px] resize-none rounded-xl border-border bg-background text-sm shadow-sm"
                />
              </TabsContent>

              <TabsContent value="customize" className="mt-4 space-y-4">
                <div className="rounded-xl bg-muted/40 p-4 ring-1 ring-border">
                  <div>
                    <h4 className="text-[14px] font-medium text-foreground">
                      Billing Type
                    </h4>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Set how billing appears in the client portal.
                    </p>
                  </div>

                  <div className="mt-3 inline-flex rounded-lg bg-background p-1 ring-1 ring-border">
                    <button
                      type="button"
                      onClick={() => setPortalBillingType("subscription")}
                      disabled={upsertCustomerMutation.isPending}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        portalBillingType === "subscription"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      Recurring Subscription
                    </button>
                    <button
                      type="button"
                      onClick={() => setPortalBillingType("fixed")}
                      disabled={upsertCustomerMutation.isPending}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        portalBillingType === "fixed"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      Fixed-Price Project
                    </button>
                  </div>

                  {portalBillingType === "fixed" ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="portal-project-name"
                          className="text-[12px] font-medium text-foreground"
                        >
                          Project Name
                        </label>
                        <Input
                          id="portal-project-name"
                          value={portalProjectNameDraft}
                          onChange={(event) =>
                            setPortalProjectNameDraft(event.target.value)
                          }
                          placeholder="Custom Next.js MVP"
                          disabled={upsertCustomerMutation.isPending}
                          className="h-9 rounded-lg border-border bg-background text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="portal-project-total"
                          className="text-[12px] font-medium text-foreground"
                        >
                          Total Price
                        </label>
                        <Input
                          id="portal-project-total"
                          value={portalProjectTotalDraft}
                          onChange={(event) =>
                            setPortalProjectTotalDraft(event.target.value)
                          }
                          placeholder="$8,500"
                          disabled={upsertCustomerMutation.isPending}
                          className="h-9 rounded-lg border-border bg-background text-sm"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl bg-muted/40 p-4 ring-1 ring-border">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-[14px] font-medium text-foreground">
                        Workspace CTA Banner
                      </h4>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        Hide the "Ready for your next build?" subscription
                        banner in the client portal workspace tab.
                      </p>
                    </div>
                    <Switch
                      checked={hidePortalSubscriptionCta}
                      onCheckedChange={setHidePortalSubscriptionCta}
                      disabled={upsertCustomerMutation.isPending}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full px-4"
                    onClick={() => void handleSavePortalCustomization()}
                    disabled={upsertCustomerMutation.isPending}
                  >
                    {upsertCustomerMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="billing" className="mt-4 space-y-4">
                <div className="rounded-xl bg-muted/40 p-4 ring-1 ring-border">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Active Plan
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {activeEngagementLabel}
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          disabled={
                            createCustomerSubscriptionCheckoutMutation.isPending
                          }
                        >
                          {creatingPlanLabel
                            ? `Creating ${creatingPlanLabel}...`
                            : "Add subscription / project"}
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end" className="w-80">
                        {CUSTOMER_SUBSCRIPTION_OPTIONS.map((option) => (
                          <DropdownMenuItem
                            key={option.value}
                            className="items-start gap-3 py-2"
                            onClick={() =>
                              void handleCreateCustomerSubscription(
                                option.value,
                              )
                            }
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {option.label}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {option.description}
                              </p>
                            </div>
                            <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                              {option.price}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="pt-1">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[16px] font-medium">Statement</h3>
                  </div>

                  <div data-statement-content>
                    <div
                      className="hidden text-[32px] font-serif leading-normal mb-8"
                      data-show-in-pdf="true"
                    >
                      {customer.name}
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="border border-border px-4 py-3">
                        <div className="mb-2 text-[12px] text-muted-foreground">
                          Total Amount
                        </div>
                        <div className="text-[18px] font-medium">
                          {summary?.currency ? (
                            <FormatAmount
                              amount={summary.totalAmount}
                              currency={summary.currency}
                            />
                          ) : (
                            "-"
                          )}
                        </div>
                      </div>
                      <div className="border border-border px-4 py-3">
                        <div className="mb-2 text-[12px] text-muted-foreground">
                          Paid
                        </div>
                        <div className="text-[18px] font-medium">
                          {summary?.currency ? (
                            <FormatAmount
                              amount={summary.paidAmount}
                              currency={summary.currency}
                            />
                          ) : (
                            "-"
                          )}
                        </div>
                      </div>
                      <div className="border border-border px-4 py-3">
                        <div className="mb-2 text-[12px] text-muted-foreground">
                          Outstanding
                        </div>
                        <div className="text-[18px] font-medium">
                          {summary?.currency ? (
                            <FormatAmount
                              amount={summary.outstandingAmount}
                              currency={summary.currency}
                            />
                          ) : (
                            "-"
                          )}
                        </div>
                      </div>
                      <div className="border border-border px-4 py-3">
                        <div className="mb-2 text-[12px] text-muted-foreground">
                          Invoices
                        </div>
                        <div className="text-[18px] font-medium">
                          {summary?.invoiceCount ?? 0}
                        </div>
                      </div>
                    </div>

                    {invoices.length > 0 ? (
                      <div ref={dropdownContainerRef}>
                        <Table>
                          <TableHeader className="bg-muted/50">
                            <TableRow>
                              <TableHead className="text-[12px] font-medium text-muted-foreground">
                                Invoice
                              </TableHead>
                              <TableHead className="text-[12px] font-medium text-muted-foreground">
                                Date
                              </TableHead>
                              <TableHead className="text-[12px] font-medium text-muted-foreground">
                                Due Date
                              </TableHead>
                              <TableHead className="text-[12px] font-medium text-muted-foreground">
                                Amount
                              </TableHead>
                              <TableHead className="text-[12px] font-medium text-muted-foreground">
                                Status
                              </TableHead>
                              <TableHead
                                className="w-[60px] text-center text-[12px] font-medium text-muted-foreground"
                                data-hide-in-pdf="true"
                              >
                                Actions
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoices.map((invoice) => (
                              <TableRow
                                key={invoice.id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => {
                                  setParams({
                                    customerId: null,
                                    details: null,
                                  });
                                  setInvoiceParams({
                                    invoiceId: invoice.id,
                                    type: "details",
                                  });
                                }}
                              >
                                <TableCell className="text-[12px] whitespace-nowrap min-w-[100px]">
                                  {invoice.invoiceNumber || "Draft"}
                                </TableCell>
                                <TableCell className="text-[12px] whitespace-nowrap">
                                  {invoice.issueDate
                                    ? format(
                                        new TZDate(invoice.issueDate, "UTC"),
                                        "MMM d",
                                      )
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-[12px] whitespace-nowrap">
                                  {invoice.dueDate
                                    ? format(
                                        new TZDate(invoice.dueDate, "UTC"),
                                        "MMM d",
                                      )
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-[12px] whitespace-nowrap">
                                  {invoice.amount != null &&
                                  invoice.currency ? (
                                    <FormatAmount
                                      amount={invoice.amount}
                                      currency={invoice.currency}
                                    />
                                  ) : (
                                    "-"
                                  )}
                                </TableCell>
                                <TableCell className="text-[12px] whitespace-nowrap">
                                  <InvoiceStatus
                                    status={invoice.status as any}
                                    className="text-xs"
                                    textOnly
                                  />
                                </TableCell>
                                <TableCell
                                  className="text-center w-[60px]"
                                  data-hide-in-pdf="true"
                                >
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className="text-muted-foreground transition-colors hover:text-foreground"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                        }}
                                      >
                                        <Icons.MoreHoriz className="size-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="end"
                                      className="z-[100]"
                                    >
                                      {invoice.status !== "draft" ? (
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDownloadInvoice(invoice.id);
                                          }}
                                        >
                                          Download
                                        </DropdownMenuItem>
                                      ) : (
                                        <DropdownMenuItem disabled>
                                          No actions available
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-12">
                        <div className="flex flex-col items-center">
                          <div className="text-center mb-6 space-y-2">
                            <h2 className="font-medium text-sm">No invoices</h2>
                            <p className="text-xs text-muted-foreground">
                              This customer doesn't have any invoices yet.{" "}
                              <br />
                              Create your first invoice for them.
                            </p>
                          </div>

                          <Button
                            variant="outline"
                            onClick={() => {
                              setParams({ customerId: null, details: null });
                              setInvoiceParams({
                                type: "create",
                                selectedCustomerId: customerId!,
                              });
                            }}
                          >
                            Create Invoice
                          </Button>
                        </div>
                      </div>
                    )}

                    {hasNextPage && (
                      <Button
                        variant="outline"
                        className="w-full mt-4 rounded-none"
                        onClick={handleLoadMore}
                        disabled={isFetchingNextPage}
                        data-hide-in-pdf="true"
                      >
                        {isFetchingNextPage ? "Loading..." : "Load More"}
                      </Button>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="settings" className="mt-4 space-y-4">
                <div className="rounded-xl bg-muted/40 p-4 ring-1 ring-border">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[14px] font-medium">Portal Access</h4>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        Allow this customer to access their portal.
                      </p>
                    </div>
                    <Switch
                      checked={customer.portalEnabled ?? false}
                      onCheckedChange={(checked) => {
                        togglePortalMutation.mutate({
                          customerId: customer.id,
                          enabled: checked,
                        });
                      }}
                      disabled={togglePortalMutation.isPending}
                    />
                  </div>

                  <AnimatePresence>
                    {customer.portalEnabled && customer.portalId ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="mt-4 overflow-hidden"
                      >
                        <div className="relative">
                          <CopyInput
                            value={`${window.location.origin}/client/${customer.portalId}`}
                            className="font-mono text-xs pr-14"
                          />
                          <div className="absolute right-10 top-2.5 border-r border-border pr-2 text-base">
                            <OpenURL
                              href={`${window.location.origin}/client/${customer.portalId}`}
                            >
                              <Icons.OpenInNew />
                            </OpenURL>
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="rounded-xl bg-muted/40 p-4 ring-1 ring-border">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Active Plan
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {activeEngagementLabel}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Set automatically when you launch checkout for a plan.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
