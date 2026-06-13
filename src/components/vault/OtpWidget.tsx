import { useEffect, useRef, useState } from "react";
import { parseOtpUri, computeTOTP } from "../../lib/totp";
import { copyText } from "../../stores/toast";

export default function OtpWidget({ otpUri }: { otpUri: string }) {
  const [code, setCode] = useState("------");
  const [pct, setPct] = useState(100);
  const [remaining, setRemaining] = useState(0);
  const [barClass, setBarClass] = useState("");
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
      setBarClass(rem <= 5 ? "danger" : rem <= 10 ? "warn" : "");

      if (elapsed === 0 || codeRef.current === "------") {
        const c = await computeTOTP(
          params.secret,
          params.period,
          params.digits,
          params.algorithm
        );
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

  async function copyCode() {
    if (code && code !== "------") await copyText(code, "OTP");
  }

  return (
    <div className="detail-field">
      <div className="detail-label">One-Time Password</div>
      <div className="otp-widget">
        <span className="otp-code">{code}</span>
        <div className="otp-progress">
          <div className={"otp-bar" + (barClass ? " " + barClass : "")} style={{ width: pct + "%" }} />
        </div>
        <span className="otp-secs">{remaining}s</span>
        <button className="icon-btn" onClick={copyCode}>
          Copy
        </button>
      </div>
    </div>
  );
}
