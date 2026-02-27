"use client";

import { createClient } from "@connorco/supabase/client";
import { Button } from "@connorco/ui/button";
import { cn } from "@connorco/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@connorco/ui/dialog";
import { Input } from "@connorco/ui/input";
import { Spinner } from "@connorco/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@connorco/ui/tabs";
import { Textarea } from "@connorco/ui/textarea";
import { formatAmount } from "@connorco/utils/format";
import { TZDate } from "@date-fns/tz";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  CheckCircle2,
  Link2,
  Moon,
  Paperclip,
  Plus,
  Sun,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { InvoiceStatus } from "@/components/invoice-status";
import { BaseKanbanLayout } from "@/components/kanban/layout";
import { downloadFile } from "@/lib/download";
import { useTRPC } from "@/trpc/client";

type Props = {
  portalId: string;
};

type PortalTab = "workspace" | "messages" | "vault" | "billing";

type PortalAttachment = {
  name: string;
  path: string[];
  size: number;
  type: string;
  downloadUrl?: string | null;
};

type PortalRequestResource = {
  label: string;
  url: string;
};

type RequestStatus =
  | "backlog"
  | "in_progress"
  | "in_qa"
  | "awaiting_review"
  | "completed";

type PortalRequest = {
  id: string;
  title: string;
  details: string | null;
  status: RequestStatus;
  priority: number;
  stagingUrl: string | null;
  resources?: PortalRequestResource[];
  requestedBy: string | null;
  attachments?: PortalAttachment[];
  createdAt: string | null;
};

type PortalMessage = {
  id: string;
  senderType: "client" | "freelancer";
  senderName: string | null;
  message: string;
  attachments?: PortalAttachment[];
  createdAt: string | null;
};

const PORTAL_SESSION_TTL_MS = 48 * 60 * 60 * 1000;

function getPortalSessionKey(portalId: string) {
  return `portal-session-expires-at:${portalId}`;
}

function setPortalSessionExpiry(portalId: string) {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    getPortalSessionKey(portalId),
    `${Date.now() + PORTAL_SESSION_TTL_MS}`,
  );
}

function clearPortalSessionExpiry(portalId: string) {
  if (typeof window === "undefined") return;

  localStorage.removeItem(getPortalSessionKey(portalId));
}

function getPortalSessionExpiry(portalId: string): number | null {
  if (typeof window === "undefined") return false;

  const expiresAtRaw = localStorage.getItem(getPortalSessionKey(portalId));
  if (!expiresAtRaw) return null;

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt)) return null;

  return expiresAt;
}

function hasExpiredPortalSession(portalId: string) {
  const expiresAt = getPortalSessionExpiry(portalId);

  if (expiresAt === null) {
    return false;
  }

  return expiresAt <= Date.now();
}

const REQUEST_COLUMNS: Array<{
  status: RequestStatus;
  title: string;
}> = [
  {
    status: "backlog",
    title: "Backlog",
  },
  {
    status: "in_progress",
    title: "In Progress",
  },
  {
    status: "in_qa",
    title: "In QA",
  },
  {
    status: "awaiting_review",
    title: "Awaiting Review",
  },
  {
    status: "completed",
    title: "Completed",
  },
];

function requestStatusLabel(status: string) {
  if (status === "in_progress") return "In Progress";
  if (status === "in_qa") return "In QA";
  if (status === "awaiting_review") return "Awaiting Review";
  if (status === "completed") return "Completed";
  return "Backlog";
}

function formatPlan(plan: string | null | undefined) {
  if (!plan) return "Custom";

  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizePortalRequestResources(
  rawResources: unknown,
  legacyStagingUrl?: string | null,
): PortalRequestResource[] {
  if (Array.isArray(rawResources)) {
    const normalized = rawResources
      .map((resource) => {
        if (!resource || typeof resource !== "object") return null;

        const { label, url } = resource as {
          label?: unknown;
          url?: unknown;
        };

        if (
          typeof label !== "string" ||
          typeof url !== "string" ||
          !label.trim() ||
          !isValidHttpUrl(url.trim())
        ) {
          return null;
        }

        return {
          label: label.trim(),
          url: url.trim(),
        };
      })
      .filter(Boolean) as PortalRequestResource[];

    return normalized;
  }

  if (legacyStagingUrl && isValidHttpUrl(legacyStagingUrl)) {
    return [{ label: "Live Staging", url: legacyStagingUrl }];
  }

  return [];
}

function parsePortalRequests(data: unknown): PortalRequest[] {
  if (!Array.isArray(data)) return [];

  return data.map((request) => {
    const typedRequest = request as PortalRequest;

    return {
      ...typedRequest,
      attachments: Array.isArray(typedRequest.attachments)
        ? typedRequest.attachments
        : [],
      resources: normalizePortalRequestResources(
        typedRequest.resources,
        typedRequest.stagingUrl,
      ),
    };
  });
}

function parsePortalMessages(data: unknown): PortalMessage[] {
  if (!Array.isArray(data)) return [];

  return data.map((message) => {
    const typedMessage = message as PortalMessage;

    return {
      ...typedMessage,
      attachments: Array.isArray(typedMessage.attachments)
        ? typedMessage.attachments
        : [],
    };
  });
}

function PortalThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : false;

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function PortalContent({ portalId }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);

  const [emailInput, setEmailInput] = useState("");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  const [requestTitle, setRequestTitle] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [requestFiles, setRequestFiles] = useState<File[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [messageDraft, setMessageDraft] = useState("");
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PortalTab>("workspace");
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const authInput = signedInEmail ? { portalId } : null;

  const { data: portalData, isLoading: isPortalLoading } = useQuery(
    trpc.customers.getByPortalId.queryOptions({ portalId }),
  );

  const verifyPortalAccessMutation = useMutation(
    trpc.customers.verifyPortalAccess.mutationOptions({
      onSuccess: ({ email }) => {
        setSignedInEmail(email);
        setAuthError(null);
        setPortalSessionExpiry(portalId);
      },
      onError: (error) => {
        setSignedInEmail(null);
        setAuthError(error.message || "Unable to sign in to customer portal");
        clearPortalSessionExpiry(portalId);
      },
    }),
  );

  const sendPortalLoginLinkMutation = useMutation(
    trpc.customers.sendPortalLoginLink.mutationOptions({
      onSuccess: (result) => {
        setAuthError(null);
        if (!result.actionLink) {
          setAuthError("Unable to sign in right now");
          setIsSigningIn(false);
          return;
        }

        window.location.assign(result.actionLink);
      },
      onError: (error) => {
        setAuthError(error.message || "Unable to send secure sign-in link");
        setIsSigningIn(false);
      },
    }),
  );

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async (email: string | null) => {
      if (!isMounted) return;

      if (!email) {
        setSignedInEmail(null);
        setIsRestoringSession(false);
        return;
      }

      if (hasExpiredPortalSession(portalId)) {
        clearPortalSessionExpiry(portalId);
        await supabase.auth.signOut();
        setSignedInEmail(null);
        setIsRestoringSession(false);
        return;
      }

      try {
        await verifyPortalAccessMutation.mutateAsync({ portalId });
      } catch {
        await supabase.auth.signOut();
      } finally {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      }
    };

    const hydrate = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      await restoreSession(session?.user?.email ?? null);
    };

    void hydrate();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user?.email) {
        setSignedInEmail(null);
        setIsRestoringSession(false);
        return;
      }

      setIsRestoringSession(true);
      void restoreSession(session.user.email);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [portalId, supabase]);

  const requestsQuery = useQuery({
    ...trpc.customers.getPortalRequests.queryOptions(authInput ?? { portalId }),
    enabled: Boolean(authInput),
    retry: false,
  });

  const messagesQuery = useQuery({
    ...trpc.customers.getPortalMessages.queryOptions(authInput ?? { portalId }),
    enabled: Boolean(authInput),
    retry: false,
  });

  const assetsQuery = useQuery({
    ...trpc.customers.getPortalAssets.queryOptions(authInput ?? { portalId }),
    enabled: Boolean(authInput),
    retry: false,
  });

  const invoicesQuery = useInfiniteQuery({
    ...trpc.customers.getPortalInvoices.infiniteQueryOptions(
      authInput ?? { portalId },
      {
        getNextPageParam: ({ meta }) => meta?.cursor,
      },
    ),
    enabled: Boolean(authInput),
    retry: false,
  });

  const createPortalAttachmentUploadMutation = useMutation(
    trpc.customers.createPortalAttachmentUpload.mutationOptions(),
  );

  const createRequestMutation = useMutation(
    trpc.customers.createPortalRequest.mutationOptions({
      onSuccess: async () => {
        if (!authInput) return;

        await queryClient.invalidateQueries({
          queryKey: trpc.customers.getPortalRequests.queryKey(authInput),
        });

        setRequestTitle("");
        setRequestDetails("");
        setRequestFiles([]);
        setRequestError(null);
        setIsRequestDialogOpen(false);
      },
    }),
  );

  const createPortalMessageMutation = useMutation(
    trpc.customers.createPortalMessage.mutationOptions({
      onSuccess: async () => {
        if (!authInput) return;

        await queryClient.invalidateQueries({
          queryKey: trpc.customers.getPortalMessages.queryKey(authInput),
        });

        setMessageDraft("");
        setMessageFiles([]);
      },
    }),
  );

  const getPortalManageSubscriptionUrlMutation = useMutation(
    trpc.customers.getPortalManageSubscriptionUrl.mutationOptions(),
  );

  const customer = portalData?.customer;
  const summary = portalData?.summary;

  const requests = useMemo(
    () => parsePortalRequests(requestsQuery.data?.requests),
    [requestsQuery.data?.requests],
  );

  const messages = useMemo(
    () => parsePortalMessages(messagesQuery.data?.messages),
    [messagesQuery.data?.messages],
  );

  const requestsByStatus = useMemo(() => {
    const groups: Record<RequestStatus, PortalRequest[]> = {
      backlog: [],
      in_progress: [],
      in_qa: [],
      awaiting_review: [],
      completed: [],
    };

    for (const request of requests) {
      if (!groups[request.status]) {
        groups.backlog.push(request);
        continue;
      }

      groups[request.status].push(request);
    }

    return groups;
  }, [requests]);

  const kanbanGroups = useMemo(
    () =>
      REQUEST_COLUMNS.map((column) => ({
        id: column.status,
        name: column.title,
      })),
    [],
  );

  const kanbanItems = useMemo(
    () =>
      Object.fromEntries(
        requests.map((request) => [request.id, request]),
      ) as Record<string, PortalRequest>,
    [requests],
  );

  const kanbanGroupedItemIds = useMemo(
    () =>
      Object.fromEntries(
        REQUEST_COLUMNS.map((column) => [
          column.status,
          (requestsByStatus[column.status] ?? []).map((request) => request.id),
        ]),
      ),
    [requestsByStatus],
  );
  const selectedRequest = useMemo(
    () => (selectedRequestId ? kanbanItems[selectedRequestId] : null),
    [kanbanItems, selectedRequestId],
  );

  const invoices = useMemo(() => {
    return invoicesQuery.data?.pages.flatMap((page) => page.data) ?? [];
  }, [invoicesQuery.data]);

  const activeRequest = requestsQuery.data
    ?.activeRequest as PortalRequest | null;
  const activeRequestResources = normalizePortalRequestResources(
    activeRequest?.resources,
    activeRequest?.stagingUrl,
  );

  const handlePortalSignIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const email = emailInput.trim().toLowerCase();

    if (!email || sendPortalLoginLinkMutation.isPending) {
      return;
    }

    setAuthError(null);
    setIsSigningIn(true);
    sendPortalLoginLinkMutation.mutate({ portalId, email });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    clearPortalSessionExpiry(portalId);
    setSignedInEmail(null);
    setAuthError(null);
    setIsSigningIn(false);
    setRequestError(null);
    setMessageError(null);
    setBillingError(null);
    setRequestFiles([]);
    setMessageFiles([]);
    setActiveTab("workspace");
    setIsRequestDialogOpen(false);
  };

  const handleManageSubscription = async () => {
    if (!authInput || getPortalManageSubscriptionUrlMutation.isPending) {
      return;
    }

    setBillingError(null);

    try {
      const result =
        await getPortalManageSubscriptionUrlMutation.mutateAsync(authInput);

      if (!result?.url) {
        throw new Error("Missing subscription portal URL");
      }

      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : "Unable to open subscription management right now.",
      );
    }
  };

  const uploadAttachments = async (
    files: File[],
    scope: "request" | "message",
  ): Promise<PortalAttachment[]> => {
    if (!authInput || files.length === 0) {
      return [];
    }

    const attachments: PortalAttachment[] = [];

    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        throw new Error(`File too large: ${file.name} (max 25MB)`);
      }

      const upload = await createPortalAttachmentUploadMutation.mutateAsync({
        ...authInput,
        scope,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
      });

      const { error } = await supabase.storage
        .from("vault")
        .uploadToSignedUrl(upload.path.join("/"), upload.token, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (error) {
        throw new Error(error.message || `Failed to upload ${file.name}`);
      }

      attachments.push({
        name: file.name,
        path: upload.path,
        size: file.size,
        type: file.type || "application/octet-stream",
      });
    }

    return attachments;
  };

  const handleSubmitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authInput || createRequestMutation.isPending) {
      return;
    }

    const title = requestTitle.trim();

    if (title.length < 3) {
      return;
    }

    setRequestError(null);

    try {
      const attachments = await uploadAttachments(requestFiles, "request");

      await createRequestMutation.mutateAsync({
        ...authInput,
        title,
        details: requestDetails.trim() || null,
        attachments,
      });
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : "Failed to submit to queue",
      );
    }
  };

  const handleSendMessage = async () => {
    if (!authInput || createPortalMessageMutation.isPending) {
      return;
    }

    const content = messageDraft.trim();

    if (!content && !messageFiles.length) {
      return;
    }

    setMessageError(null);

    try {
      const attachments = await uploadAttachments(messageFiles, "message");

      await createPortalMessageMutation.mutateAsync({
        ...authInput,
        message: content || "Sent with attachments",
        attachments,
      });
    } catch (error) {
      setMessageError(
        error instanceof Error ? error.message : "Failed to send message",
      );
    }
  };

  const handleDownloadInvoice = (invoice: (typeof invoices)[number]) => {
    setDownloadingId(invoice.id);

    downloadFile(
      `${process.env.NEXT_PUBLIC_API_URL}/files/download/invoice?token=${invoice.token}`,
      `${invoice.invoiceNumber || "invoice"}.pdf`,
    );

    setTimeout(() => {
      setDownloadingId(null);
    }, 1000);
  };

  const subscriptionStatus =
    customer?.team.subscriptionStatus === "past_due" ? "Past due" : "Active";
  const hasActiveSubscription = customer?.team.subscriptionStatus === "active";
  const hasManageableSubscription =
    customer?.team.subscriptionStatus === "active" ||
    customer?.team.subscriptionStatus === "past_due";
  const hideSubscriptionCta = customer?.portalHideSubscriptionCta ?? false;
  const isFixedBilling = customer?.portalBillingType === "fixed";
  const fixedProjectName =
    customer?.portalProjectName?.trim() || "Fixed-Price Project";
  const fixedProjectTotal = customer?.portalProjectTotal?.trim() || null;

  if (isPortalLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  if (!customer || !summary) {
    return null;
  }

  if (isRestoringSession && !signedInEmail) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-10"
        >
          {customer.team.logoUrl ? (
            <div className="mb-5">
              <Image
                src={customer.team.logoUrl}
                alt={customer.team.name || "Company logo"}
                width={88}
                height={88}
                className="object-contain"
              />
            </div>
          ) : null}

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {customer.name} Portal
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {customer.team.name}
              </p>
            </div>

            <div className="flex items-center justify-end gap-4">
              <PortalThemeToggle />
              {signedInEmail ? (
                <>
                  <p className="max-w-[280px] truncate text-sm font-medium text-muted-foreground">
                    {signedInEmail}
                  </p>
                  <button
                    type="button"
                    className="whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => void handleSignOut()}
                  >
                    Sign out
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </motion.div>

        {!signedInEmail ? (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.04 }}
            className="flex min-h-[calc(100vh-220px)] items-center justify-center"
          >
            <div className="w-full max-w-3xl text-center">
              <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                Welcome to your client portal
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                Enter your email to sign in.
              </p>

              <form
                onSubmit={handlePortalSignIn}
                className="mx-auto mt-5 flex w-full max-w-3xl flex-col gap-2 sm:flex-row"
              >
                <Input
                  id="portal-email"
                  type="email"
                  value={emailInput}
                  onChange={(event) => {
                    setEmailInput(event.target.value);
                    setAuthError(null);
                  }}
                  placeholder="founder@startup.com"
                  className="h-11 rounded-full border border-border bg-background px-4 text-sm"
                  autoComplete="email"
                />

                <Button
                  type="submit"
                  disabled={sendPortalLoginLinkMutation.isPending || isSigningIn}
                  className="h-11 shrink-0 whitespace-nowrap rounded-full px-5"
                >
                  {sendPortalLoginLinkMutation.isPending || isSigningIn ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner size={14} />
                      Signing in
                    </span>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>

              {authError ? (
                <p className="mt-3 text-sm text-destructive">{authError}</p>
              ) : null}
            </div>
          </motion.section>
        ) : (
          <>
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.03 }}
              className="mb-6 border-b border-border pb-6"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Active Sprint
                  </span>
                  {activeRequest ? (
                    <>
                      <span className="text-muted-foreground/70">•</span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
                        <span className="relative inline-flex size-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/80" />
                          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
                        </span>
                        {requestStatusLabel(activeRequest.status)}
                      </span>
                    </>
                  ) : null}
                </div>

                {activeRequest ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                        {activeRequest.title}
                      </h2>
                      {activeRequest.details ? (
                        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                          {activeRequest.details}
                        </p>
                      ) : null}
                    </div>

                    {activeRequestResources.length > 0 ? (
                      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                        {activeRequestResources.map((resource, index) => (
                          <Link
                            key={`${resource.url}-${index}`}
                            href={resource.url}
                            target="_blank"
                            className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                          >
                            {resource.label}
                            <ArrowUpRight size={14} />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No resources attached yet.
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No active sprint right now. New requests are prioritized in
                    your workspace board.
                  </p>
                )}
              </div>
            </motion.section>

            <Dialog
              open={isRequestDialogOpen}
              onOpenChange={(open) => {
                setIsRequestDialogOpen(open);
                if (open) setRequestError(null);
              }}
            >
              <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl border-none bg-background p-6 shadow-2xl ring-1 ring-border">
                <DialogHeader>
                  <DialogTitle className="mb-0 text-xl tracking-tight text-foreground">
                    New Request
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Add context, goals, and files so the next sprint starts with
                    everything needed.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmitRequest} className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="portal-request-title"
                      className="text-sm font-medium text-foreground"
                    >
                      Title
                    </label>
                    <Input
                      id="portal-request-title"
                      value={requestTitle}
                      onChange={(event) => setRequestTitle(event.target.value)}
                      placeholder="Build new onboarding flow in Next.js"
                      maxLength={160}
                      className="rounded-xl border-none bg-muted px-4 text-sm ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="portal-request-details"
                      className="text-sm font-medium text-foreground"
                    >
                      Details
                    </label>
                    <Textarea
                      id="portal-request-details"
                      value={requestDetails}
                      onChange={(event) =>
                        setRequestDetails(event.target.value)
                      }
                      placeholder="Outline requirements, references, and acceptance criteria"
                      rows={5}
                      maxLength={2000}
                      className="rounded-xl border-none bg-muted px-4 py-3 text-sm ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>

                  <div className="rounded-xl bg-muted/40 p-3 ring-1 ring-border">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        Attachments
                      </p>
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border hover:bg-muted">
                        <Paperclip size={12} />
                        Add files
                        <input
                          type="file"
                          multiple
                          className="sr-only"
                          onChange={(event) => {
                            setRequestFiles(
                              Array.from(event.target.files ?? []),
                            );
                          }}
                        />
                      </label>
                    </div>

                    {requestFiles.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {requestFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${index}`}
                            className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1 text-xs ring-1 ring-border"
                          >
                            <Paperclip size={11} />
                            <span className="max-w-[170px] truncate">
                              {file.name}
                            </span>
                            <span className="text-muted-foreground">
                              {formatAttachmentSize(file.size)}
                            </span>
                            <button
                              type="button"
                              className="text-muted-foreground transition-colors hover:text-foreground"
                              onClick={() => {
                                setRequestFiles((current) =>
                                  current.filter(
                                    (_, fileIndex) => fileIndex !== index,
                                  ),
                                );
                              }}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        No files selected yet.
                      </p>
                    )}
                  </div>

                  {requestError ? (
                    <p className="text-sm text-destructive">{requestError}</p>
                  ) : null}

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      className="h-10 rounded-full px-5"
                      disabled={
                        createRequestMutation.isPending ||
                        createPortalAttachmentUploadMutation.isPending ||
                        requestTitle.trim().length < 3
                      }
                    >
                      {createRequestMutation.isPending ||
                      createPortalAttachmentUploadMutation.isPending ? (
                        <span className="inline-flex items-center gap-2">
                          <Spinner size={14} />
                          Submitting
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Plus size={14} />
                          Add to Queue
                        </span>
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as PortalTab)}
            >
              <TabsList className="h-auto w-full justify-start gap-6 border-b border-border bg-transparent p-0">
                <TabsTrigger
                  value="workspace"
                  className="h-11 rounded-none border-b-2 border-transparent px-0 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Workspace
                </TabsTrigger>
                <TabsTrigger
                  value="messages"
                  className="h-11 rounded-none border-b-2 border-transparent px-0 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Messages
                </TabsTrigger>
                <TabsTrigger
                  value="vault"
                  className="h-11 rounded-none border-b-2 border-transparent px-0 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Vault
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  className="h-11 rounded-none border-b-2 border-transparent px-0 text-sm font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Billing
                </TabsTrigger>
              </TabsList>

              <TabsContent value="workspace" className="mt-0 pt-6">
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.06 }}
                  className="pb-2"
                >
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-foreground">
                        Request Queue
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Add tasks, share context, and track each stage of
                        delivery.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
                        <CheckCircle2 size={14} />
                        {requests.length} total requests
                      </div>
                      <Button
                        className="h-9 rounded-full px-4"
                        onClick={() => setIsRequestDialogOpen(true)}
                      >
                        <Plus size={14} className="mr-1" />
                        New Request
                      </Button>
                    </div>
                  </div>

                  {!hasActiveSubscription && !hideSubscriptionCta ? (
                    <div className="mb-5 rounded-xl border border-border bg-muted/50 px-5 py-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        Ongoing Support
                      </p>
                      <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                        Ready for your next build?
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Move from one-off projects to ongoing product support
                        with a monthly subscription.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="h-9 rounded-full border-border bg-background px-4 text-foreground hover:bg-muted"
                          onClick={() => void handleManageSubscription()}
                          disabled={
                            getPortalManageSubscriptionUrlMutation.isPending
                          }
                        >
                          {getPortalManageSubscriptionUrlMutation.isPending ? (
                            <span className="inline-flex items-center gap-2">
                              <Spinner size={14} />
                              Opening
                            </span>
                          ) : (
                            "Explore Subscriptions"
                          )}
                        </Button>
                        <Button
                          className="h-9 rounded-full px-4"
                          onClick={() => setIsRequestDialogOpen(true)}
                        >
                          Start New Project
                        </Button>
                      </div>
                      {billingError ? (
                        <p className="mt-2 text-xs text-destructive">
                          {billingError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {requestsQuery.isLoading ? (
                    <div className="flex justify-center rounded-xl bg-muted/40 px-4 py-12 ring-1 ring-border">
                      <Spinner size={18} />
                    </div>
                  ) : (
                    <div className="overflow-x-auto pb-1">
                      <BaseKanbanLayout<PortalRequest>
                        items={kanbanItems}
                        groups={kanbanGroups}
                        groupedItemIds={kanbanGroupedItemIds}
                        showEmptyGroups={true}
                        className="w-max min-w-full gap-3 px-1 py-0"
                        groupClassName="h-[560px] w-[280px] rounded-xl border border-border bg-muted/40 p-3 pt-0"
                        renderGroupHeader={({ group, itemCount }) => (
                          <div className="flex items-center justify-between px-1 py-2">
                            <h6 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {group.name}
                            </h6>
                            <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-border">
                              {itemCount}
                            </span>
                          </div>
                        )}
                        renderItem={(request) => {
                          const requestResources =
                            normalizePortalRequestResources(
                              request.resources,
                              request.stagingUrl,
                            );

                          return (
                            <article
                              className="cursor-pointer space-y-3 rounded-xl border border-black/10 bg-background p-3 shadow-sm transition-colors hover:border-black/20 dark:border-white/15 dark:hover:border-white/25"
                              onClick={() => setSelectedRequestId(request.id)}
                            >
                              <div>
                                <p className="text-sm font-medium">
                                  {request.title}
                                </p>
                                {request.details ? (
                                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                                    {request.details}
                                  </p>
                                ) : null}
                              </div>

                              <div className="space-y-2 border-border border-t pt-3">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Attached Resources
                                </p>

                                {requestResources.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {requestResources.map((resource, index) => (
                                      <a
                                        key={`${resource.url}-${index}`}
                                        href={resource.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                        className="group flex w-full items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground hover:bg-muted"
                                      >
                                        <span className="min-w-0 flex flex-1 items-center gap-2 truncate text-sm">
                                          <Link2
                                            size={12}
                                            className="shrink-0 text-muted-foreground"
                                          />
                                          <span className="truncate">
                                            {resource.label}
                                          </span>
                                        </span>
                                        <ArrowUpRight
                                          size={12}
                                          className="shrink-0 text-muted-foreground"
                                        />
                                      </a>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    No resources attached yet.
                                  </p>
                                )}
                              </div>

                              {request.attachments?.length ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {request.attachments
                                    .slice(0, 3)
                                    .map((attachment) => (
                                      <a
                                        key={attachment.path.join("/")}
                                        href={attachment.downloadUrl ?? "#"}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                        className={cn(
                                          "inline-flex items-center gap-1 rounded-full bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border",
                                          !attachment.downloadUrl &&
                                            "pointer-events-none opacity-60",
                                        )}
                                      >
                                        <Paperclip size={10} />
                                        <span className="max-w-[90px] truncate">
                                          {attachment.name}
                                        </span>
                                      </a>
                                    ))}
                                </div>
                              ) : null}

                              {request.createdAt ? (
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                  {format(
                                    new TZDate(request.createdAt, "UTC"),
                                    "MMM d, yyyy",
                                  )}
                                </p>
                              ) : null}
                            </article>
                          );
                        }}
                      />
                    </div>
                  )}
                </motion.section>
              </TabsContent>

              <TabsContent value="messages" className="mt-0 pt-6">
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.09 }}
                >
                  <div className="border-b border-border pb-4">
                    <h2 className="text-xl font-semibold tracking-tight text-foreground">
                      Messages
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Direct updates between you and your freelancer.
                    </p>
                  </div>

                  <div className="flex min-h-[520px] flex-col">
                    <div className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-4 py-5 sm:px-5">
                      {messagesQuery.isLoading ? (
                        <div className="flex justify-center py-14">
                          <Spinner size={18} />
                        </div>
                      ) : messages.length ? (
                        messages.map((message) => {
                          const isFreelancer =
                            message.senderType === "freelancer";

                          return (
                            <div
                              key={message.id}
                              className={cn(
                                "flex",
                                isFreelancer ? "justify-start" : "justify-end",
                              )}
                            >
                              <div
                                className={cn(
                                  "max-w-[76%] rounded-lg border px-3 py-2 shadow-sm",
                                  isFreelancer
                                    ? "border-border bg-background text-foreground"
                                    : "border-primary bg-primary text-primary-foreground",
                                )}
                              >
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="text-xs font-semibold">
                                    {message.senderName ||
                                      (isFreelancer ? "Freelancer" : "Client")}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[11px]",
                                      isFreelancer
                                        ? "text-muted-foreground"
                                        : "text-primary-foreground/70",
                                    )}
                                  >
                                    {message.createdAt
                                      ? format(
                                          new TZDate(message.createdAt, "UTC"),
                                          "MMM d, yyyy h:mm a",
                                        )
                                      : ""}
                                  </span>
                                </div>

                                <p className="whitespace-pre-wrap text-sm">
                                  {message.message}
                                </p>

                                {message.attachments?.length ? (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {message.attachments.map((attachment) => (
                                      <a
                                        key={attachment.path.join("/")}
                                        href={attachment.downloadUrl ?? "#"}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={cn(
                                          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]",
                                          isFreelancer
                                            ? "border-border bg-muted/40 text-foreground hover:bg-muted"
                                            : "border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20",
                                          !attachment.downloadUrl &&
                                            "pointer-events-none opacity-60",
                                        )}
                                      >
                                        <Paperclip size={10} />
                                        <span className="max-w-[130px] truncate">
                                          {attachment.name}
                                        </span>
                                      </a>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-14 text-center text-sm text-muted-foreground">
                          No messages yet. Start the conversation below.
                        </div>
                      )}
                    </div>

                    <form
                      className="border-t border-border bg-background px-4 py-4 sm:px-5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleSendMessage();
                      }}
                    >
                      {messageFiles.length > 0 ? (
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {messageFiles.map((file, index) => (
                            <div
                              key={`${file.name}-${index}`}
                              className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-foreground"
                            >
                              <Paperclip size={11} />
                              <span className="max-w-[160px] truncate">
                                {file.name}
                              </span>
                              <button
                                type="button"
                                className="text-muted-foreground transition-colors hover:text-foreground"
                                onClick={() => {
                                  setMessageFiles((current) =>
                                    current.filter(
                                      (_, fileIndex) => fileIndex !== index,
                                    ),
                                  );
                                }}
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex items-center gap-2">
                        <label className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted px-3 text-foreground transition-colors hover:bg-muted">
                          <Paperclip size={14} />
                          <input
                            type="file"
                            multiple
                            className="sr-only"
                            onChange={(event) => {
                              setMessageFiles(
                                Array.from(event.target.files ?? []),
                              );
                            }}
                          />
                        </label>
                        <Input
                          value={messageDraft}
                          onChange={(event) =>
                            setMessageDraft(event.target.value)
                          }
                          placeholder="Send a message to your freelancer"
                          maxLength={5000}
                          className="h-11 rounded-full border-none bg-muted px-4 text-sm shadow-inner shadow-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <Button
                          type="submit"
                          className="h-11 rounded-full px-5"
                          disabled={
                            createPortalMessageMutation.isPending ||
                            createPortalAttachmentUploadMutation.isPending ||
                            (!messageDraft.trim() && !messageFiles.length)
                          }
                        >
                          {createPortalMessageMutation.isPending ||
                          createPortalAttachmentUploadMutation.isPending ? (
                            <span className="inline-flex items-center gap-2">
                              <Spinner size={14} />
                              Sending
                            </span>
                          ) : (
                            "Send"
                          )}
                        </Button>
                      </div>

                      {messageError ? (
                        <p className="mt-2 text-sm text-destructive">
                          {messageError}
                        </p>
                      ) : null}
                    </form>
                  </div>
                </motion.section>
              </TabsContent>

              <TabsContent value="vault" className="mt-0 pt-6">
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.12 }}
                >
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    Asset Vault
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Shared assets and deliverables linked to this workspace.
                  </p>

                  {assetsQuery.isLoading ? (
                    <div className="mt-4 flex justify-center rounded-xl bg-muted/40 px-4 py-12 ring-1 ring-border">
                      <Spinner size={18} />
                    </div>
                  ) : assetsQuery.data?.data.length ? (
                    <div className="mt-4 space-y-2">
                      {assetsQuery.data.data.map((asset) => (
                        <div
                          key={asset.id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-border"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {asset.title ||
                                asset.fileName ||
                                "Untitled asset"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {asset.fileName || "File"}
                              {asset.createdAt
                                ? ` • ${format(new TZDate(asset.createdAt, "UTC"), "MMM d, yyyy")}`
                                : ""}
                            </p>
                          </div>

                          {asset.downloadUrl ? (
                            <Link href={asset.downloadUrl} target="_blank">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full border-border bg-background px-4"
                              >
                                Download
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full border-border bg-background px-4"
                              disabled
                            >
                              Unavailable
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground ring-1 ring-border">
                      No customer-linked vault assets yet.
                    </div>
                  )}
                </motion.section>
              </TabsContent>

              <TabsContent value="billing" className="mt-0 pt-6">
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.15 }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-foreground">
                        Billing & Invoicing
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {isFixedBilling
                          ? "Project summary and invoice history for this account."
                          : "Plan overview and invoice history for this account."}
                      </p>
                    </div>

                    {!isFixedBilling && hasManageableSubscription ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full border-border bg-background px-4"
                        onClick={() => void handleManageSubscription()}
                        disabled={
                          getPortalManageSubscriptionUrlMutation.isPending
                        }
                      >
                        {getPortalManageSubscriptionUrlMutation.isPending ? (
                          <span className="inline-flex items-center gap-2">
                            <Spinner size={14} />
                            Opening
                          </span>
                        ) : (
                          "Manage Subscription"
                        )}
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-border">
                      <div className="mb-2 flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
                        <span>{isFixedBilling ? "Project" : "Plan"}</span>
                        {!isFixedBilling && hasManageableSubscription ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 rounded-full px-2 text-[11px] text-foreground hover:bg-muted"
                            onClick={() => void handleManageSubscription()}
                            disabled={
                              getPortalManageSubscriptionUrlMutation.isPending
                            }
                          >
                            Manage
                          </Button>
                        ) : null}
                      </div>
                      <div
                        className={cn(
                          "text-[14px]",
                          isFixedBilling || hasManageableSubscription
                            ? "font-semibold text-foreground"
                            : "font-medium text-muted-foreground",
                        )}
                      >
                        {isFixedBilling
                          ? fixedProjectName
                          : hasManageableSubscription
                            ? formatPlan(customer.team.plan)
                            : "No active plan"}
                      </div>
                      <div className="mt-1 text-[12px] text-muted-foreground">
                        {isFixedBilling ? (
                          fixedProjectTotal ? (
                            `Contract total ${fixedProjectTotal}`
                          ) : (
                            "Fixed-price contract"
                          )
                        ) : hasManageableSubscription ? (
                          subscriptionStatus
                        ) : (
                          <Link
                            href="https://connorco.dev/pricing"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            Explore services
                            <ArrowUpRight size={12} />
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-border">
                      <div className="mb-2 text-[12px] text-muted-foreground">
                        Total Amount
                      </div>
                      <div className="text-[14px] font-semibold text-foreground">
                        {formatAmount({
                          amount: summary.totalAmount,
                          currency: summary.currency,
                        })}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-border">
                      <div className="mb-2 text-[12px] text-muted-foreground">
                        Paid
                      </div>
                      <div className="text-[14px] font-semibold text-foreground">
                        {formatAmount({
                          amount: summary.paidAmount,
                          currency: summary.currency,
                        })}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-border">
                      <div className="mb-2 text-[12px] text-muted-foreground">
                        Outstanding
                      </div>
                      <div className="text-[14px] font-semibold text-foreground">
                        {formatAmount({
                          amount: summary.outstandingAmount,
                          currency: summary.currency,
                        })}
                      </div>
                    </div>
                  </div>

                  {billingError ? (
                    <p className="mt-3 text-sm text-destructive">
                      {billingError}
                    </p>
                  ) : null}

                  {invoicesQuery.isLoading ? (
                    <div className="mt-5 flex justify-center rounded-xl bg-muted/40 px-4 py-12 ring-1 ring-border">
                      <Spinner size={18} />
                    </div>
                  ) : invoices.length > 0 ? (
                    <div className="mt-5 overflow-hidden rounded-xl ring-1 ring-border">
                      <div className="grid grid-cols-[minmax(84px,1.2fr)_minmax(72px,1fr)_minmax(72px,1fr)_minmax(72px,1fr)_minmax(64px,0.8fr)_70px] items-center gap-2 bg-muted/60 px-3 py-3 text-[12px] font-semibold text-muted-foreground">
                        <div>Invoice</div>
                        <div>Date</div>
                        <div>Due Date</div>
                        <div className="text-right">Amount</div>
                        <div className="text-right">Status</div>
                        <div className="text-right">PDF</div>
                      </div>

                      <div className="divide-y divide-border bg-background">
                        {invoices.map((invoice) => (
                          <div
                            key={invoice.id}
                            className="grid grid-cols-[minmax(84px,1.2fr)_minmax(72px,1fr)_minmax(72px,1fr)_minmax(72px,1fr)_minmax(64px,0.8fr)_70px] items-center gap-2 px-3 py-3 transition-colors hover:bg-muted/40"
                          >
                            <Link
                              href={`/i/${invoice.token}`}
                              target="_blank"
                              className="text-[12px] text-foreground hover:underline"
                            >
                              {invoice.invoiceNumber || "-"}
                            </Link>
                            <div className="text-[12px] text-muted-foreground">
                              {invoice.issueDate
                                ? format(
                                    new TZDate(invoice.issueDate, "UTC"),
                                    "MMM d, yyyy",
                                  )
                                : "-"}
                            </div>
                            <div className="text-[12px] text-muted-foreground">
                              {invoice.dueDate
                                ? format(
                                    new TZDate(invoice.dueDate, "UTC"),
                                    "MMM d, yyyy",
                                  )
                                : "-"}
                            </div>
                            <div className="text-right text-[12px] text-foreground">
                              {invoice.amount != null && invoice.currency
                                ? formatAmount({
                                    amount: invoice.amount,
                                    currency: invoice.currency,
                                  })
                                : "-"}
                            </div>
                            <div className="text-right">
                              <InvoiceStatus status={invoice.status as any} />
                            </div>
                            <div className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-full px-2 text-xs"
                                onClick={() => handleDownloadInvoice(invoice)}
                              >
                                {downloadingId === invoice.id ? (
                                  <Spinner size={12} />
                                ) : (
                                  "Download"
                                )}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-xl bg-muted/40 px-4 py-12 text-center text-sm text-muted-foreground ring-1 ring-border">
                      No invoices yet.
                    </div>
                  )}

                  {invoicesQuery.hasNextPage ? (
                    <div className="mt-4">
                      <Button
                        variant="outline"
                        className="w-full rounded-full border-border bg-background"
                        onClick={() => invoicesQuery.fetchNextPage()}
                        disabled={invoicesQuery.isFetchingNextPage}
                      >
                        {invoicesQuery.isFetchingNextPage ? (
                          <span className="inline-flex items-center gap-2">
                            <Spinner size={14} />
                            Loading
                          </span>
                        ) : (
                          "Load more invoices"
                        )}
                      </Button>
                    </div>
                  ) : null}
                </motion.section>
              </TabsContent>
            </Tabs>

            <Dialog
              open={Boolean(selectedRequest)}
              onOpenChange={(open) => {
                if (!open) setSelectedRequestId(null);
              }}
            >
              <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl border-none bg-background p-6 shadow-2xl ring-1 ring-border">
                {selectedRequest ? (
                  <>
                    <DialogHeader>
                      <DialogTitle className="text-xl tracking-tight text-foreground">
                        {selectedRequest.title}
                      </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-4 ring-1 ring-border">
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Status
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {requestStatusLabel(selectedRequest.status)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Submitted
                          </p>
                          <p className="mt-1 text-sm text-foreground">
                            {selectedRequest.createdAt
                              ? format(
                                  new TZDate(selectedRequest.createdAt, "UTC"),
                                  "MMM d, yyyy 'at' h:mm a",
                                )
                              : "-"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Client Request
                        </p>
                        <p className="rounded-xl bg-muted/40 p-4 text-sm leading-relaxed text-foreground ring-1 ring-border">
                          {selectedRequest.details?.trim()
                            ? selectedRequest.details
                            : "No additional details provided."}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Attached Resources
                        </p>
                        {normalizePortalRequestResources(
                          selectedRequest.resources,
                          selectedRequest.stagingUrl,
                        ).length ? (
                          <div className="space-y-1.5">
                            {normalizePortalRequestResources(
                              selectedRequest.resources,
                              selectedRequest.stagingUrl,
                            ).map((resource, index) => (
                              <a
                                key={`${resource.url}-${index}`}
                                href={resource.url}
                                target="_blank"
                                rel="noreferrer"
                                className="group flex w-full items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground hover:bg-muted"
                              >
                                <span className="min-w-0 flex flex-1 items-center gap-2 truncate text-sm">
                                  <Link2
                                    size={12}
                                    className="shrink-0 text-muted-foreground"
                                  />
                                  <span className="truncate">
                                    {resource.label}
                                  </span>
                                </span>
                                <ArrowUpRight
                                  size={12}
                                  className="shrink-0 text-muted-foreground"
                                />
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No resources attached.
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Attachments
                        </p>
                        {selectedRequest.attachments?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedRequest.attachments.map((attachment) => (
                              <a
                                key={attachment.path.join("/")}
                                href={attachment.downloadUrl ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                  "inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border",
                                  attachment.downloadUrl
                                    ? "hover:bg-muted"
                                    : "opacity-60",
                                )}
                              >
                                <Paperclip size={12} />
                                <span className="max-w-[220px] truncate">
                                  {attachment.name}
                                </span>
                                <span className="text-muted-foreground">
                                  {formatAttachmentSize(attachment.size)}
                                </span>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No files were attached.
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>

      <div className="fixed bottom-4 right-4 hidden md:block">
        <a
          href="https://app.connorco.dev"
          target="_blank"
          rel="noreferrer"
          className="text-[9px] text-muted-foreground"
        >
          Powered by <span className="text-primary">Connor & Co</span>
        </a>
      </div>
    </div>
  );
}
