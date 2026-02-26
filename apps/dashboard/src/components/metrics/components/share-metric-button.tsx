"use client";

import { Button } from "@connorco/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@connorco/ui/dropdown-menu";
import { Icons } from "@connorco/ui/icons";
import { useState } from "react";
import type { ReportType } from "../utils/chart-types";
import { ShareMetricModal } from "./share-metric-modal";

interface ShareMetricButtonProps {
  type: ReportType;
  from: string;
  to: string;
  currency?: string;
}

export function ShareMetricButton({
  type,
  from,
  to,
  currency,
}: ShareMetricButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs border border-border"
            aria-label="More options"
          >
            <Icons.MoreVertical size={12} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" portal={false}>
          <DropdownMenuItem onClick={() => setIsOpen(true)} className="text-xs">
            Share
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareMetricModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        type={type}
        from={from}
        to={to}
        currency={currency}
      />
    </>
  );
}
