import { BatchesClient } from "./batches-client";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function BatchesPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Batches"
        description="List, monitor, and cancel OpenAI batch jobs."
      />
      <BatchesClient />
    </div>
  );
}
