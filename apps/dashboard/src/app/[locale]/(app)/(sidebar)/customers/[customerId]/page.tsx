import { Button } from "@connorco/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { CustomerDetails } from "@/components/customer-details";
import { ScrollableContent } from "@/components/scrollable-content";

export const metadata: Metadata = {
  title: "Customer | Connor & Co",
};

type Props = {
  params: Promise<{ customerId: string }>;
};

export default async function Page(props: Props) {
  const { customerId } = await props.params;

  return (
    <ScrollableContent>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
        <div className="mb-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/customers">Back to customers</Link>
          </Button>
        </div>

        <CustomerDetails customerId={customerId} mode="page" />
      </div>
    </ScrollableContent>
  );
}
