import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Upgrade | Connor & Co",
};

export default async function UpgradePage() {
  redirect("/");
}
