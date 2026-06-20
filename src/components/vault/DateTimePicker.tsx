import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const pad = (n: number) => String(n).padStart(2, "0");

// Local "YYYY-MM-DDTHH:MM:SS" — the wire format the backend parses.
function toStr(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export default function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date & time",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const parsed = value ? new Date(value) : undefined;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
  const timeStr = date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "00:00";

  function setDatePart(d?: Date) {
    if (!d) return;
    const base = date ?? new Date();
    d.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onChange(toStr(d));
  }

  function setTimePart(t: string) {
    const [h, m] = t.split(":").map(Number);
    const base = date ? new Date(date) : new Date();
    base.setHours(h || 0, m || 0, 0, 0);
    onChange(toStr(base));
  }

  const label = date
    ? date.toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={"w-full justify-start text-left font-normal " + (date ? "" : "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={setDatePart} autoFocus />
        <div className="border-t p-3">
          <label className="text-muted-foreground mb-1.5 block text-xs font-semibold">Time</label>
          <Input type="time" value={timeStr} onChange={(e) => setTimePart(e.target.value)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
