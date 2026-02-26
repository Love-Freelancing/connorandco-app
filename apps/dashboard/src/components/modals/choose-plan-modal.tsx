"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@connorco/ui/dialog";
import Link from "next/link";
import { Plans } from "../plans";

export function ChoosePlanModal({
  isOpen,
  onOpenChange,
  daysLeft: _daysLeft,
  hasDiscount: _hasDiscount,
  discountPrice: _discountPrice,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  daysLeft?: number;
  hasDiscount?: boolean;
  discountPrice?: number;
}) {
  const handleClose = (value: boolean) => {
    onOpenChange(value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[696px]">
        <div className="p-8">
          <DialogHeader>
            <DialogTitle>All features are free</DialogTitle>
          </DialogHeader>
          <DialogDescription className="mb-8">
            Connor & Co has no trial period and no paid plan requirement.
          </DialogDescription>

          <Plans />

          <p className="text-xs text-muted-foreground mt-4">
            You have full access to every feature,{" "}
            <Link href="/support">contact us</Link> if you have any questions.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
