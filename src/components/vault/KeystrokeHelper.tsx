import type { MouseEvent } from "react";

// Clickable token palette shown under the keystrokes input. Calls onInsert with
// the token; the parent owns the input and performs the cursor insertion.
const FIELD_TOKENS = [
  "{TITLE}", "{USERNAME}", "{URL}", "{PASSWORD}", "{NOTES}", "{GROUP}",
  "{TOTP}", "{S:Custom Field Name}",
];
const MOD_TOKENS = [
  { label: "+ (shift)", ins: "+" },
  { label: "% (alt)", ins: "%" },
  { label: "^ (ctrl)", ins: "^" },
];
const KEY_TOKENS = [
  "{TAB}", "{ENTER}", "{SPACE}", "{DELAY=ms}", "{UP}", "{DOWN}", "{LEFT}", "{RIGHT}", "{HOME}", "{END}",
  "{+}", "{%}", "{^}", "{~}", "{(}", "{)}", "{[}", "{]}", "{{}", "{}}",
];

export default function KeystrokeHelper({
  onInsert,
}: {
  onInsert: (token: string) => void;
}) {
  // mousedown + preventDefault so clicking a token doesn't blur the input.
  const pick = (ev: MouseEvent, token: string) => {
    ev.preventDefault();
    onInsert(token);
  };

  return (
    <div className="at-helper">
      <div className="at-helper-block">
        <div className="at-helper-head">
          <span>Entry fields:</span>
          <a
            className="at-helper-more"
            href="https://keepass.info/help/base/autotype.html"
            target="_blank"
            rel="noreferrer"
          >
            more…
          </a>
        </div>
        <div className="at-helper-tokens">
          {FIELD_TOKENS.map((t) => (
            <a key={t} onMouseDown={(e) => pick(e, t)}>
              {t}
            </a>
          ))}
        </div>
      </div>
      <div className="at-helper-block">
        <div className="at-helper-head">
          <span>Modifier keys:</span>
        </div>
        <div className="at-helper-tokens">
          {MOD_TOKENS.map((m) => (
            <a key={m.ins} onMouseDown={(e) => pick(e, m.ins)}>
              {m.label}
            </a>
          ))}
        </div>
      </div>
      <div className="at-helper-block">
        <div className="at-helper-head">
          <span>Keys:</span>
        </div>
        <div className="at-helper-tokens">
          {KEY_TOKENS.map((t) => (
            <a key={t} onMouseDown={(e) => pick(e, t)}>
              {t}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
