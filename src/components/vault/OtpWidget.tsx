import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { parseOtpUri, computeTOTP } from "@/lib/totp";
import { copyText } from "@/stores/toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export default function OtpWidget({ otpUri }: { otpUri: string }) {
  const [code, setCode] = useState("------");
  const [pct, setPct] = useState(100);
  const [remaining, setRemaining] = useState(0);
  const codeRef = useRef("------");

  useEffect(() => {
    const params = parseOtpUri(otpUri);
    if (!params.secret) return;
    let cancelled = false;

    async function refresh() {
      const now = Math.floor(Date.now() / 1000);
      const elapsed = now % params.period;
      const rem = params.period - elapsed;
      setRemaining(rem);
      setPct((rem / params.period) * 100);
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

  const barColor =
    remaining <= 5 ? "bg-destructive" : remaining <= 10 ? "bg-yellow-500" : "bg-primary";

  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        One-Time Password
      </div>
      <div className="bg-muted/40 flex items-center gap-3 rounded-md border px-3 py-2">
        <span className="font-mono-code text-primary text-xl font-bold tracking-[0.15em] tabular-nums">
          {code}
        </span>
        <Progress value={pct} className="h-1.5 flex-1" indicatorClassName={barColor} />
        <span className="text-muted-foreground w-7 text-right text-xs tabular-nums">
          {remaining}s
        </span>
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
  );
}
