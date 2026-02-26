import { Logo } from "./assets/logo";

// Shared base config - used by both server and client configs
export const baseConfig = {
  name: "Fortnox",
  id: "fortnox",
  category: "accounting",
  active: true,
  beta: true,
  logo: Logo,
  short_description:
    "Export transactions and receipts to Fortnox. Keep your Swedish accounting compliant and up-to-date.",
  description:
    "Connect Connor & Co with Fortnox to streamline your Swedish accounting workflow.\n\n**Manual Transaction Export**\nExport enriched transactions from Connor & Co to Fortnox as vouchers. Review and categorize transactions in Connor & Co first, then push them to Fortnox with a single click. Vouchers are created as finalized entries - the review happens in Connor & Co before export.\n\n**Receipt & Invoice Attachments**\nReceipts and invoices matched to transactions in Connor & Co are automatically attached to the corresponding vouchers in Fortnox, making audit preparation effortless.\n\n**Smart Account Mapping**\nTransaction categories from Connor & Co are mapped to your Fortnox chart of accounts using Swedish BAS standards.",
  settings: [],
  config: {},
};
