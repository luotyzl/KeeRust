import { useModals, closeCreateModal } from "@/stores/modals";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Modal for creating a new entry/group. The form itself is pending a mockup —
// this is a placeholder that wires up the dialog open/close from the New menu.
export default function CreateModal() {
  const visible = useModals((s) => s.createVisible);
  const kind = useModals((s) => s.createKind);

  const title = kind === "entry" ? "New Entry" : "New Group";

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && closeCreateModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Coming soon.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
