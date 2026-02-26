"use client";

import { Button } from "@connorco/ui/button";
import { cn } from "@connorco/ui/cn";
import { Icons } from "@connorco/ui/icons";

interface HorizontalPaginationProps {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onScrollLeft: () => void;
  onScrollRight: () => void;
  className?: string;
}

export function HorizontalPagination({
  canScrollLeft,
  canScrollRight,
  onScrollLeft,
  onScrollRight,
  className,
}: HorizontalPaginationProps) {
  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Button
        variant="outline"
        size="sm"
        disabled={!canScrollLeft}
        className="size-6 p-0"
        onClick={onScrollLeft}
      >
        <Icons.ArrowBack
          className={cn("size-3.5", canScrollLeft && "text-primary")}
        />
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!canScrollRight}
        className="size-6 p-0"
        onClick={onScrollRight}
      >
        <Icons.ArrowForward
          className={cn("size-3.5", canScrollRight && "text-primary")}
        />
      </Button>
    </div>
  );
}
