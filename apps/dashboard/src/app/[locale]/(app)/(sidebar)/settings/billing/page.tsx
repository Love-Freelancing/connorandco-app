import type { Metadata } from "next";
import { Card } from "@connorco/ui/card";

export const metadata: Metadata = {
  title: "Billing | Connor & Co",
};

export default async function Billing() {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">
        Connor & Co is free to use. All features are available without a trial or
        subscription.
      </p>
    </Card>
  );
}
