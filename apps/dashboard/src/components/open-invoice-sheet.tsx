"use client";

import { Button } from "@connorco/ui/button";
import { Icons } from "@connorco/ui/icons";
import { useInvoiceParams } from "@/hooks/use-invoice-params";

export function OpenInvoiceSheet() {
  const { setParams } = useInvoiceParams();

  return (
    <div>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setParams({ type: "create" })}
      >
        <Icons.Add />
      </Button>
    </div>
  );
}
