// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

import { CopyButton } from "./copy-button";

export function CodeBlock({
  code,
  caption,
  copy = true,
}: {
  code: string;
  caption?: string;
  copy?: boolean;
}) {
  return (
    <figure className="fab-code flex flex-col gap-2">
      <pre
        tabIndex={0}
        role="region"
        aria-label={caption ?? "Code sample"}
        className="relative overflow-x-auto rounded-lg border border-border bg-card p-4 pr-12"
      >
        <code className="font-mono text-sm text-foreground">{code}</code>
        {copy ? (
          <span className="absolute top-2 right-2">
            <CopyButton text={code} />
          </span>
        ) : null}
      </pre>
      {caption ? (
        <figcaption className="text-sm text-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
