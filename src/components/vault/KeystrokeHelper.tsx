import type { MouseEvent } from "react";

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

function TokenLink({
  text,
  token,
  onPick,
}: {
  text: string;
  token: string;
  onPick: (ev: MouseEvent, token: string) => void;
}) {
  return (
    <a
      className="font-mono-code text-primary hover:bg-muted cursor-pointer rounded px-1 py-0.5 text-xs whitespace-nowrap"
      onMouseDown={(e) => onPick(e, token)}
    >
      {text}
    </a>
  );
}

// Clickable token palette shown under the keystrokes input.
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
    <div className="bg-popover absolute top-[calc(100%+4px)] right-0 left-0 z-50 max-h-72 overflow-y-auto rounded-md border p-3 shadow-md">
      <div className="mb-2.5">
        <div className="text-muted-foreground mb-1.5 flex items-baseline justify-between text-xs">
          <span>Entry fields:</span>
          <a
            className="text-primary hover:underline"
            href="https://keepass.info/help/base/autotype.html"
            target="_blank"
            rel="noreferrer"
          >
            more…
          </a>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {FIELD_TOKENS.map((t) => (
            <TokenLink key={t} text={t} token={t} onPick={pick} />
          ))}
        </div>
      </div>
      <div className="mb-2.5">
        <div className="text-muted-foreground mb-1.5 text-xs">Modifier keys:</div>
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {MOD_TOKENS.map((m) => (
            <TokenLink key={m.ins} text={m.label} token={m.ins} onPick={pick} />
          ))}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground mb-1.5 text-xs">Keys:</div>
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {KEY_TOKENS.map((t) => (
            <TokenLink key={t} text={t} token={t} onPick={pick} />
          ))}
        </div>
      </div>
    </div>
  );
}
