import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { parseOtpUri, computeTOTP } from "@/lib/totp";
import { copyText } from "@/stores/toast";
import { Button } from "@/components/ui/button";

export default function OtpWidget({ otpUri }: { otpUri: string }) {
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
  const display =
    code.length % 2 === 0 ? `${code.slice(0, code.length / 2)} ${code.slice(code.length / 2)}` : code;

  const frac = period > 0 ? remaining / period : 0;
  const ringColor =
    remaining <= 5 ? "text-destructive" : remaining <= 10 ? "text-yellow-500" : "text-primary";

  const R = 10;
  const C = 2 * Math.PI * R;

  return (
    <div className="space-y-0.5">
      <div className="text-muted-foreground text-xs">2FA Code</div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono-code text-2xl font-bold tracking-[0.1em] tabular-nums">
          {display}
        </span>
        <div className="flex items-center gap-0.5">
          <div className="flex size-7 items-center justify-center" title={`${remaining}s`}>
            <svg className="size-7 -rotate-90" viewBox="0 0 24 24">
              <circle
                cx="12"
                cy="12"
                r={R}
                fill="none"
                strokeWidth="2.5"
                stroke="currentColor"
                className="text-muted"
              />
              <circle
                cx="12"
                cy="12"
                r={R}
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                stroke="currentColor"
                className={"transition-all " + ringColor}
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
              />
            </svg>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Copy"
            onClick={() => code !== "------" && copyText(code, "OTP")}
          >
            <Copy />
          </Button>
        </div>
      </div>
    </div>
  );
}
