"use client";

import { createClient } from "@connorco/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@connorco/ui/alert-dialog";
import { Button } from "@connorco/ui/button";
import { cn } from "@connorco/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@connorco/ui/dialog";
import { Input } from "@connorco/ui/input";
import { Spinner } from "@connorco/ui/spinner";
import { Textarea } from "@connorco/ui/textarea";
import { useToast } from "@connorco/ui/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { Link2, MessageSquare, Paperclip, Plus, Upload, X } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { BaseKanbanLayout } from "@/components/kanban/layout";
import { useUserQuery } from "@/hooks/use-user";
import { useTRPC } from "@/trpc/client";
import { resumableUpload } from "@/utils/upload";

type Props = {
  customerId: string;
  section?: "pipeline" | "messages";
};

type RequestStatus =
  | "backlog"
  | "in_progress"
  | "in_qa"
  | "awaiting_review"
  | "completed";

const STATUS_OPTIONS: Array<{ value: RequestStatus; label: string }> = [
  { value: "backlog", label: "Backlog" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_qa", label: "In QA" },
  { value: "awaiting_review", label: "Awaiting Review" },
  { value: "completed", label: "Completed" },
];

const REQUEST_COLUMNS: Array<{ status: RequestStatus; title: string }> = [
  { status: "backlog", title: "Backlog" },
  { status: "in_progress", title: "In Progress" },
  { status: "in_qa", title: "In QA" },
  { status: "awaiting_review", title: "Awaiting Review" },
  { status: "completed", title: "Completed" },
];

type MessageAttachment = {
  name: string;
  path: string[];
  size: number;
  type: string;
  downloadUrl?: string | null;
};

type RequestResource = {
  label: string;
  url: string;
};

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeRequestResources(
  rawResources: unknown,
  legacyStagingUrl?: string | null,
): RequestResource[] {
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
      .filter(Boolean) as RequestResource[];

    return normalized;
  }

  if (legacyStagingUrl && isValidHttpUrl(legacyStagingUrl)) {
    return [{ label: "Live Staging", url: legacyStagingUrl }];
  }

  return [];
}

export function CustomerPortalRequestsManager({
  customerId,
  section = "pipeline",
}: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: user } = useUserQuery();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageFileInputRef = useRef<HTMLInputElement>(null);

  const [resourceDrafts, setResourceDrafts] = useState<
    Record<string, RequestResource[]>
  >({});
  const [resourceEditor, setResourceEditor] = useState<
    Record<
      string,
      {
        open: boolean;
        label: string;
        url: string;
      }
    >
  >({});
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [isUploadingAssets, setIsUploadingAssets] = useState(false);

  const [messageDraft, setMessageDraft] = useState("");
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    requestId: string;
    sourceStatus: RequestStatus;
    targetStatus: RequestStatus;
  } | null>(null);

  const { data: requestsData } = useQuery(
    trpc.customers.getCustomerPortalRequests.queryOptions({ customerId }),
  );
  const requests = requestsData ?? [];

  const { data: messagesData } = useQuery(
    trpc.customers.getCustomerPortalMessages.queryOptions({ customerId }),
  );
  const messages = messagesData ?? [];

  useEffect(() => {
    const nextDrafts = Object.fromEntries(
      requests.map((request) => {
        const typedRequest = request as {
          id: string;
          resources?: unknown;
          stagingUrl?: string | null;
        };

        return [
          typedRequest.id,
          normalizeRequestResources(
            typedRequest.resources,
            typedRequest.stagingUrl,
          ),
        ];
      }),
    );

    setResourceDrafts((previous) => {
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(nextDrafts);

      if (
        previousKeys.length === nextKeys.length &&
        nextKeys.every(
          (key) =>
            JSON.stringify(previous[key] ?? []) ===
            JSON.stringify(nextDrafts[key] ?? []),
        )
      ) {
        return previous;
      }

      return nextDrafts;
    });
  }, [requestsData]);

  const updateRequestMutation = useMutation(
    trpc.customers.updateCustomerPortalRequest.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.customers.getCustomerPortalRequests.queryKey({
            customerId,
          }),
        });
      },
      onError: (error) => {
        toast({
          variant: "error",
          duration: 3000,
          title: error.message || "Failed to update request",
        });
      },
      onSettled: () => {
        setUpdatingKey(null);
      },
    }),
  );

  const processDocumentMutation = useMutation(
    trpc.documents.processDocument.mutationOptions(),
  );

  const createCustomerPortalMessageMutation = useMutation(
    trpc.customers.createCustomerPortalMessage.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.customers.getCustomerPortalMessages.queryKey({
            customerId,
          }),
        });
      },
    }),
  );

  const requestsByStatus = useMemo(() => {
    const grouped: Record<RequestStatus, typeof requests> = {
      backlog: [],
      in_progress: [],
      in_qa: [],
      awaiting_review: [],
      completed: [],
    };

    for (const request of requests) {
      grouped[request.status as RequestStatus]?.push(request);
    }

    return grouped;
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
      ) as Record<string, (typeof requests)[number]>,
    [requests],
  );
  const selectedRequest = useMemo(
    () => (selectedRequestId ? kanbanItems[selectedRequestId] : null),
    [kanbanItems, selectedRequestId],
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

  const saveStatus = (requestId: string, status: RequestStatus) => {
    setUpdatingKey(`${requestId}:status`);
    updateRequestMutation.mutate({
      customerId,
      requestId,
      status,
    });
  };

  const saveResources = (requestId: string, resources: RequestResource[]) => {
    setUpdatingKey(`${requestId}:resources`);
    updateRequestMutation.mutate({
      customerId,
      requestId,
      resources,
    });
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleMessageFileClick = () => {
    messageFileInputRef.current?.click();
  };

  const handleUploadFromCustomerContext = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";

    if (!files.length || !user?.teamId || isUploadingAssets) {
      return;
    }

    setIsUploadingAssets(true);

    try {
      const path = [user.teamId, "customers", customerId, "assets"];

      const uploaded = (await Promise.all(
        files.map((file) =>
          resumableUpload(supabase, {
            bucket: "vault",
            path,
            file,
          }),
        ),
      )) as Array<{ filename: string; file: File }>;

      await processDocumentMutation.mutateAsync(
        uploaded.map((item) => ({
          filePath: [...path, item.filename],
          mimetype: item.file.type,
          size: item.file.size,
          objectId: customerId,
        })),
      );

      toast({
        title: "Customer assets uploaded",
        variant: "success",
        duration: 2500,
      });
    } catch {
      toast({
        title: "Failed to upload customer assets",
        variant: "error",
        duration: 3000,
      });
    } finally {
      setIsUploadingAssets(false);
    }
  };

  const uploadMessageAttachments = async (): Promise<MessageAttachment[]> => {
    if (!user?.teamId || messageFiles.length === 0) {
      return [];
    }

    const basePath = [user.teamId, "customers", customerId, "messages"];

    const uploaded = (await Promise.all(
      messageFiles.map((file) =>
        resumableUpload(supabase, {
          bucket: "vault",
          path: basePath,
          file,
        }),
      ),
    )) as Array<{ filename: string; file: File }>;

    return uploaded.map((item) => ({
      name: item.filename,
      path: [...basePath, item.filename],
      size: item.file.size,
      type: item.file.type || "application/octet-stream",
    }));
  };

  const handleSendMessage = async () => {
    const content = messageDraft.trim();

    if (!content && !messageFiles.length) {
      return;
    }

    setIsSendingMessage(true);

    try {
      const attachments = await uploadMessageAttachments();

      await createCustomerPortalMessageMutation.mutateAsync({
        customerId,
        message: content || "Sent with attachments",
        attachments,
      });

      setMessageDraft("");
      setMessageFiles([]);
      toast({
        title: "Message sent",
        variant: "success",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
        duration: 3000,
      });
    } finally {
      setIsSendingMessage(false);
    }
  };

  return (
    <div className="space-y-7">
      {section === "pipeline" ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-4 ring-1 ring-border">
          <div>
            <h4 className="text-base font-semibold tracking-tight text-foreground">
              Portal Collaboration
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage queue status and keep client delivery moving.
            </p>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUploadFromCustomerContext}
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.pdf,.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.txt,.csv,.md,.rtf,.zip"
            />

            <Button
              variant="outline"
              size="sm"
              onClick={handleUploadClick}
              disabled={isUploadingAssets}
            >
              {isUploadingAssets ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size={14} />
                  Uploading
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Upload size={14} />
                  Upload customer assets
                </span>
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {section === "pipeline" ? (
        <section className="space-y-3">
          <div className="mb-2 flex items-center justify-between">
            <h5 className="text-base font-semibold tracking-tight text-foreground">
              Delivery Pipeline
            </h5>
            <span className="text-sm text-muted-foreground">
              {requests.length} requests
            </span>
          </div>

          <div className="overflow-x-auto pb-2 [scrollbar-gutter:stable_both-edges]">
            <BaseKanbanLayout<(typeof requests)[number]>
              items={kanbanItems}
              groups={kanbanGroups}
              groupedItemIds={kanbanGroupedItemIds}
              showEmptyGroups={true}
              enableDragDrop={true}
              onDrop={async (
                sourceId,
                _,
                sourceGroupId,
                destinationGroupId,
              ) => {
                const request = kanbanItems[sourceId];
                if (!request) return;

                const sourceStatus = sourceGroupId as RequestStatus;
                const targetStatus = destinationGroupId as RequestStatus;

                if (sourceStatus === targetStatus) return;

                setPendingStatusChange({
                  requestId: request.id,
                  sourceStatus,
                  targetStatus,
                });
              }}
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
                const typedRequest = request as {
                  resources?: unknown;
                  stagingUrl?: string | null;
                };
                const resources =
                  resourceDrafts[request.id] ??
                  normalizeRequestResources(
                    typedRequest.resources,
                    typedRequest.stagingUrl,
                  );
                const editor = resourceEditor[request.id] ?? {
                  open: false,
                  label: "",
                  url: "",
                };
                const isSavingResources =
                  updatingKey === `${request.id}:resources`;

                return (
                  <article
                    className="space-y-3 rounded-xl border border-black/10 bg-background p-3 shadow-sm transition-colors hover:border-black/20 dark:border-white/15 dark:hover:border-white/25"
                    onClick={() => setSelectedRequestId(request.id)}
                  >
                    <div>
                      <p className="text-sm font-medium">{request.title}</p>
                      {request.details ? (
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {request.details}
                        </p>
                      ) : null}
                    </div>

                    <div
                      className="space-y-2 border-t border-border pt-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Attached Resources
                      </p>

                      {resources.length > 0 ? (
                        <div className="space-y-1.5">
                          {resources.map((resource, index) => (
                            <div
                              key={`${resource.url}-${index}`}
                              className="group flex w-full items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground hover:bg-muted"
                            >
                              <a
                                href={resource.url}
                                target="_blank"
                                rel="noreferrer"
                                className="min-w-0 flex flex-1 items-center gap-2 truncate text-sm hover:text-foreground"
                              >
                                <Link2
                                  size={12}
                                  className="shrink-0 text-muted-foreground"
                                />
                                <span className="truncate">
                                  {resource.label}
                                </span>
                              </a>
                              <button
                                type="button"
                                className="ml-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                                onClick={() => {
                                  const nextResources = resources.filter(
                                    (_, resourceIndex) =>
                                      resourceIndex !== index,
                                  );
                                  setResourceDrafts((previous) => ({
                                    ...previous,
                                    [request.id]: nextResources,
                                  }));
                                  saveResources(request.id, nextResources);
                                }}
                                disabled={
                                  isSavingResources ||
                                  updateRequestMutation.isPending
                                }
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No resources attached yet.
                        </p>
                      )}

                      {editor.open ? (
                        <div className="space-y-2 pt-1">
                          <Input
                            value={editor.label}
                            onChange={(event) =>
                              setResourceEditor((previous) => ({
                                ...previous,
                                [request.id]: {
                                  ...editor,
                                  label: event.target.value,
                                },
                              }))
                            }
                            placeholder="Label (e.g. Figma File)"
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <Input
                            value={editor.url}
                            onChange={(event) =>
                              setResourceEditor((previous) => ({
                                ...previous,
                                [request.id]: {
                                  ...editor,
                                  url: event.target.value,
                                },
                              }))
                            }
                            placeholder="https://..."
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <div className="flex items-center justify-end gap-3 pt-1">
                            <button
                              type="button"
                              className="text-sm text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setResourceEditor((previous) => ({
                                  ...previous,
                                  [request.id]: {
                                    open: false,
                                    label: "",
                                    url: "",
                                  },
                                }))
                              }
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => {
                                const nextLabel = editor.label.trim();
                                const nextUrl = editor.url.trim();

                                if (!nextLabel) {
                                  toast({
                                    variant: "error",
                                    duration: 2500,
                                    title: "Resource label is required",
                                  });
                                  return;
                                }

                                if (!isValidHttpUrl(nextUrl)) {
                                  toast({
                                    variant: "error",
                                    duration: 2500,
                                    title:
                                      "Resource URL must be a valid http(s) URL",
                                  });
                                  return;
                                }

                                const nextResources = [
                                  ...resources,
                                  { label: nextLabel, url: nextUrl },
                                ].slice(0, 10);

                                setResourceDrafts((previous) => ({
                                  ...previous,
                                  [request.id]: nextResources,
                                }));
                                setResourceEditor((previous) => ({
                                  ...previous,
                                  [request.id]: {
                                    open: false,
                                    label: "",
                                    url: "",
                                  },
                                }));

                                saveResources(request.id, nextResources);
                              }}
                              disabled={
                                isSavingResources ||
                                updateRequestMutation.isPending
                              }
                            >
                              {isSavingResources ? (
                                <Spinner size={12} />
                              ) : (
                                "Add"
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setResourceEditor((previous) => ({
                              ...previous,
                              [request.id]: {
                                open: true,
                                label: "",
                                url: "",
                              },
                            }))
                          }
                        >
                          <Plus size={12} />
                          Add Link
                        </button>
                      )}
                    </div>
                  </article>
                );
              }}
            />
          </div>
        </section>
      ) : null}

      {section === "messages" ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} />
            <h5 className="text-base font-semibold tracking-tight text-foreground">
              Message Thread
            </h5>
          </div>

          <div className="max-h-[250px] space-y-2 overflow-y-auto pr-1">
            {messages.length ? (
              messages.map((message) => {
                const isFreelancer = message.senderType === "freelancer";

                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      isFreelancer ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[76%] rounded-lg border px-3 py-2",
                        isFreelancer
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background",
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span className="font-medium">
                          {message.senderName ||
                            (isFreelancer ? "You" : "Client")}
                        </span>
                        <span
                          className={cn(
                            isFreelancer
                              ? "text-primary-foreground/80"
                              : "text-muted-foreground",
                          )}
                        >
                          {message.createdAt
                            ? formatDistanceToNowStrict(
                                parseISO(message.createdAt),
                                {
                                  addSuffix: true,
                                },
                              )
                            : ""}
                        </span>
                      </div>

                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {message.message}
                      </p>

                      {message.attachments?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {message.attachments.map((attachment) => {
                            const downloadUrl = (
                              attachment as MessageAttachment & {
                                downloadUrl?: string | null;
                              }
                            ).downloadUrl;

                            return (
                              <a
                                key={attachment.path.join("/")}
                                href={downloadUrl ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                                  isFreelancer
                                    ? "border-white/25 bg-white/10 text-white hover:bg-white/20"
                                    : "border-border bg-muted/40 text-foreground hover:bg-muted",
                                  !downloadUrl &&
                                    "pointer-events-none opacity-60",
                                )}
                              >
                                <Paperclip size={11} />
                                <span className="max-w-[160px] truncate">
                                  {attachment.name}
                                </span>
                              </a>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No messages yet.
              </div>
            )}
          </div>

          <div className="border-t border-border pt-3">
            <Textarea
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              placeholder="Send a message to the client..."
              rows={3}
              maxLength={5000}
              className="h-24 resize-none border border-border bg-background text-sm"
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                ref={messageFileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  setMessageFiles((current) => [...current, ...files]);
                  event.currentTarget.value = "";
                }}
              />

              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/40"
                onClick={handleMessageFileClick}
              >
                <Paperclip size={12} />
                Attach files
              </button>

              <span className="text-xs text-muted-foreground">
                Optional, up to 25MB per file
              </span>

              <Button
                size="sm"
                className="ml-auto"
                onClick={handleSendMessage}
                disabled={
                  isSendingMessage ||
                  createCustomerPortalMessageMutation.isPending
                }
              >
                {isSendingMessage ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner size={14} />
                    Sending
                  </span>
                ) : (
                  "Send message"
                )}
              </Button>
            </div>

            {messageFiles.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {messageFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                  >
                    <Paperclip size={11} />
                    <span className="max-w-[150px] truncate">{file.name}</span>
                    <span className="text-muted-foreground">
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setMessageFiles((current) =>
                          current.filter((_, fileIndex) => fileIndex !== index),
                        );
                      }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <Dialog
        open={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) setSelectedRequestId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-2xl">
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
                      {STATUS_OPTIONS.find(
                        (option) => option.value === selectedRequest.status,
                      )?.label ?? selectedRequest.status}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Submitted
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {selectedRequest.createdAt
                        ? format(
                            parseISO(selectedRequest.createdAt),
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
                  {normalizeRequestResources(
                    (selectedRequest as { resources?: unknown }).resources,
                    (selectedRequest as { stagingUrl?: string | null })
                      .stagingUrl,
                  ).length ? (
                    <div className="flex flex-wrap gap-2">
                      {normalizeRequestResources(
                        (selectedRequest as { resources?: unknown }).resources,
                        (selectedRequest as { stagingUrl?: string | null })
                          .stagingUrl,
                      ).map((resource, index) => (
                        <a
                          key={`${resource.url}-${index}`}
                          href={resource.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border hover:bg-muted/80"
                        >
                          <Link2 size={12} />
                          <span>{resource.label}</span>
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
                      {selectedRequest.attachments.map((attachment) => {
                        const typedAttachment = attachment as MessageAttachment;
                        const attachmentUrl = typedAttachment.downloadUrl;

                        return (
                          <a
                            key={typedAttachment.path.join("/")}
                            href={attachmentUrl ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              "inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border",
                              attachmentUrl
                                ? "hover:bg-muted/80"
                                : "opacity-60",
                            )}
                          >
                            <Paperclip size={12} />
                            <span className="max-w-[220px] truncate">
                              {typedAttachment.name}
                            </span>
                            <span className="text-muted-foreground">
                              {formatFileSize(typedAttachment.size)}
                            </span>
                          </a>
                        );
                      })}
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

      <AlertDialog
        open={Boolean(pendingStatusChange)}
        onOpenChange={(open) => {
          if (!open) setPendingStatusChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move request to new stage?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatusChange
                ? `This will move "${kanbanItems[pendingStatusChange.requestId]?.title ?? "request"}" from ${
                    STATUS_OPTIONS.find(
                      (option) =>
                        option.value === pendingStatusChange.sourceStatus,
                    )?.label ?? pendingStatusChange.sourceStatus
                  } to ${
                    STATUS_OPTIONS.find(
                      (option) =>
                        option.value === pendingStatusChange.targetStatus,
                    )?.label ?? pendingStatusChange.targetStatus
                  }.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingStatusChange) return;

                saveStatus(
                  pendingStatusChange.requestId,
                  pendingStatusChange.targetStatus,
                );
                setPendingStatusChange(null);
              }}
            >
              Confirm move
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
