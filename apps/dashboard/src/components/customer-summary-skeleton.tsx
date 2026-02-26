"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@connorco/ui/card";
import { Skeleton } from "@connorco/ui/skeleton";

export function CustomerSummarySkeleton() {
  return (
    <Card className="hidden sm:block">
      <CardHeader className="pb-2">
        <CardTitle className="font-medium text-2xl font-serif">
          <Skeleton className="h-[32px] w-24" />
        </CardTitle>
      </CardHeader>

      <CardContent className="pb-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[26px] w-28" />
          <Skeleton className="h-[22px] w-44" />
        </div>
      </CardContent>
    </Card>
  );
}
