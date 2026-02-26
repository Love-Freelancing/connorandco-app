"use client";

import { Card } from "@connorco/ui/card";

export function ManageSubscription() {
  return (
    <div>
      <h2 className="text-lg font-medium leading-none tracking-tight mb-4">
        Access
      </h2>

      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          All features are enabled for free.
        </p>
      </Card>
    </div>
  );
}
