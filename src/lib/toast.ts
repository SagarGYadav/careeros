import { toast } from "sonner";

/**
 * Success toast with an Undo button for reversible actions (SPEC §21). Destructive, irreversible actions use a
 * confirm dialog instead.
 */
export function toastWithUndo(message: string, onUndo: () => void | Promise<void>, durationMs = 6000) {
  toast.success(message, {
    duration: durationMs,
    action: { label: "Undo", onClick: () => void onUndo() },
  });
}
