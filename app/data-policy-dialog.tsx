"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DATA_POLICY } from "./data-policy";

// Shows text between backticks as inline code, as Markdown would.
function withInlineCode(text: string) {
  return text.split("`").map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="bg-muted rounded px-1 font-mono text-xs">
        {part}
      </code>
    ) : (
      part
    ),
  );
}

export function DataPolicyDialog() {
  return (
    <Dialog>
      <DialogTrigger className="underline underline-offset-4">
        How we use your key
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Data use policy</DialogTitle>
          <DialogDescription>
            How this site uses your Torn API key and the data it fetches, as
            Torn&apos;s API Terms of Service require.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-4 text-sm">
          {DATA_POLICY.map((row) => (
            <div key={row.column} className="grid gap-1 border-t pt-3">
              <dt className="font-semibold">{row.heading}</dt>
              <dd className="text-muted-foreground text-xs">{row.question}</dd>
              <dd className="font-medium">
                {row.value}
                {row.specify ? `: ${row.specify}` : ""}
              </dd>
              {row.notes.length > 0 && (
                <dd>
                  <ul className="list-disc space-y-1 pl-5">
                    {row.notes.map((note) => (
                      <li key={note}>{withInlineCode(note)}</li>
                    ))}
                  </ul>
                </dd>
              )}
              {row.links.map((link) => (
                <dd key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    {link.label}
                  </a>
                </dd>
              ))}
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
