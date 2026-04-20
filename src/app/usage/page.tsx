import { PageHeader } from "@/components/page-header";
import { UsageClient } from "./usage-client";

export const dynamic = "force-dynamic";

export default function UsagePage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Usage"
        description="Organization-wide token and cost usage from the OpenAI Admin API."
      />
      <UsageClient />
    </div>
  );
}
