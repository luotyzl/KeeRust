import { useEffect, useRef, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { parseOtpUri, computeTOTP } from "@/lib/totp";
import { copyText } from "@/stores/toast";
import { Button } from "@/components/ui/button";

// When `onRemove` is supplied (e.g. in the edit form) the copy button is
// replaced by a remove button so a configured code can be cleared.
export default function OtpWidget({
  otpUri,
  onRemove,
}: {
  otpUri: string;
  onRemove?: () => void;
}) {
  const [code, setCode] = useState("------");
  const [remaining, setRemaining] = useState(0);
  const [period, setPeriod] = useState(30);
  const codeRef = useRef("------");

  useEffect(() => {
    const params = parseOtpUri(otpUri);
    if (!params.secret) return;
    setPeriod(params.period);
    let cancelled = false;

    async function refresh() {
      const now = Math.floor(Date.now() / 1000);
      const elapsed = now % params.period;
      const rem = params.period - elapsed;
      setRemaining(rem);
      if (elapsed === 0 || codeRef.current === "------") {
        const c = await computeTOTP(params.secret, params.period, params.digits, params.algorithm);
        if (!cancelled) {
          codeRef.current = c || "------";
          setCode(codeRef.current);
        }
      }
    }

    refresh();
    const id = setInterval(refresh, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [otpUri]);

  // Split the code into two groups for readability (e.g. "315 076").
  const display = code;

  const frac = period > 0 ? remaining / period : 0;
  const barColor =
    remaining <= 5 ? "bg-destructive" : remaining <= 10 ? "bg-yellow-500" : "bg-primary";

  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground text-xs">2FA Code</div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono-code text-2xl font-bold tracking-[0.1em] tabular-nums">
          {display}
        </span>
        {onRemove ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            title="Remove 2FA"
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            title="Copy"
            onClick={() => code !== "------" && copyText(code, "OTP")}
          >
            <Copy />
          </Button>
        )}
      </div>
      <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
        <div
          className={"h-full rounded-full transition-all duration-1000 ease-linear " + barColor}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
    </div>
  );
}
