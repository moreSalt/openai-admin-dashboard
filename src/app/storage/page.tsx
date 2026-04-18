import { PageHeader } from "@/components/page-header";
import { StorageClient } from "./storage-client";

export const dynamic = "force-dynamic";

export default function StoragePage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Storage"
        description="Files uploaded to the OpenAI Files API."
      />
      <StorageClient />
    </div>
  );
}
