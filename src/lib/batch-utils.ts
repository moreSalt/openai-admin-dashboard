export function statusTone(s: string): "success" | "warn" | "danger" | "info" | "neutral" {
  if (s === "completed") return "success";
  if (s === "failed" || s === "expired" || s === "cancelled") return "danger";
  if (s === "cancelling") return "warn";
  if (s === "validating" || s === "in_progress" || s === "finalizing") return "info";
  return "neutral";
}
