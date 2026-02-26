import type { Metadata } from "next";
import { AccountSettings } from "@/components/account-settings";

export const metadata: Metadata = {
  title: "Account Settings | Connor & Co",
};

export default async function Account() {
  return <AccountSettings />;
}
