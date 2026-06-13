import { useModals, closeXmlModal } from "@/stores/modals";
import { copyText } from "@/stores/toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function XmlModal() {
  const visible = useModals((s) => s.xmlVisible);
  const content = useModals((s) => s.xmlContent);

  return (
    <Dialog open={visible} onOpenChange={(o) => !o && closeXmlModal()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Entry XML</DialogTitle>
        </DialogHeader>
        <pre className="font-mono-code bg-muted text-muted-foreground max-h-[60vh] overflow-auto rounded-md border p-3 text-xs leading-relaxed whitespace-pre">
          {content}
        </pre>
        <DialogFooter>
          <Button variant="outline" onClick={() => copyText(content, "XML")}>
            Copy
          </Button>
          <Button variant="outline" onClick={closeXmlModal}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
