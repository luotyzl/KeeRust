import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import type { CustomField } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-muted-foreground text-xs font-semibold">{children}</div>;
}

// Add / edit a single custom field. `initial` is null when adding a new one.
export default function EditCustomFieldDialog({
  open,
  initial,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initial: CustomField | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (field: CustomField) => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [concealable, setConcealable] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Seed the inputs each time the dialog opens for a (possibly different) field.
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setValue(initial?.value ?? "");
      setConcealable(initial?.protected ?? false);
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [open, initial]);

  function submit() {
    const n = name.trim();
    if (!n) return;
    onSubmit({ name: n, value, protected: concealable });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter confirms (plain Enter inserts a newline in the value).
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Custom Field" : "Add Custom Field"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <FieldLabel>Name</FieldLabel>
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Value</FieldLabel>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-h-40"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={concealable}
              onCheckedChange={(v) => setConcealable(v === true)}
            />
            Concealable
          </label>

          <div className="text-muted-foreground flex items-start gap-2.5 text-xs">
            <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full">
              <HelpCircle className="size-4" />
            </span>
            <p className="leading-relaxed">
              Concealable means this field looks and behaves like a password field. You
              can conceal and reveal it in the UI.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!name.trim()} onClick={submit}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
