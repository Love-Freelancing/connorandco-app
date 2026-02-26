"use client";

import dynamic from "next/dynamic";

const PortalContent = dynamic(
  () => import("./portal-content").then((mod) => mod.PortalContent),
  { ssr: false },
);

type Props = {
  portalId: string;
};

export function PortalContentClient({ portalId }: Props) {
  return <PortalContent portalId={portalId} />;
}
