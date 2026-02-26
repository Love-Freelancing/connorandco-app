"use client";

import { Button } from "@connorco/ui/button";
import { Icons } from "@connorco/ui/icons";
import { Sheet, SheetContent, SheetHeader } from "@connorco/ui/sheet";
import { useProductParams } from "@/hooks/use-product-params";
import { useTeamQuery } from "@/hooks/use-team";
import { ProductForm } from "../forms/product-form";

export function ProductCreateSheet() {
  const { setParams, createProduct } = useProductParams();
  const { data: team } = useTeamQuery();
  const defaultCurrency = team?.baseCurrency || "USD";

  const isOpen = Boolean(createProduct);

  return (
    <Sheet open={isOpen} onOpenChange={() => setParams(null)}>
      <SheetContent>
        <SheetHeader className="mb-6 flex justify-between items-center flex-row">
          <h2 className="text-xl">Create Product</h2>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setParams(null)}
            className="p-0 m-0 size-auto hover:bg-transparent"
          >
            <Icons.Close className="size-5" />
          </Button>
        </SheetHeader>

        <ProductForm defaultCurrency={defaultCurrency} />
      </SheetContent>
    </Sheet>
  );
}
