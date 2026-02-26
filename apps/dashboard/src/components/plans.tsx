"use client";

import { Card } from "@connorco/ui/card";
import { Check } from "lucide-react";

export function Plans() {
  return (
    <Card className="p-6">
      <h2 className="text-xl mb-3 text-left">All features included</h2>
      <ul className="space-y-2">
        <li className="flex items-start">
          <Check className="h-4 w-4 text-primary flex-shrink-0 mr-2" />
          <span className="text-xs">Unlimited access to all Connor & Co features</span>
        </li>
        <li className="flex items-start">
          <Check className="h-4 w-4 text-primary flex-shrink-0 mr-2" />
          <span className="text-xs">No subscriptions, no trial period</span>
        </li>
        <li className="flex items-start">
          <Check className="h-4 w-4 text-primary flex-shrink-0 mr-2" />
          <span className="text-xs">No plan limits</span>
        </li>
      </ul>
    </Card>
  );
}
