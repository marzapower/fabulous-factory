// Built with Fabulous Factory — https://github.com/marzapower/fabulous-factory
// This credit line is free to keep and gives the project a hand. Thank you!

export function WhyItHolds() {
  return (
    <section className="fab-safety border-y border-border bg-muted/20">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <p className="font-mono text-sm text-fab-marker">// why it doesn&rsquo;t fall over</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            The safety net is built in, not remembered
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            The important rules — checking who&rsquo;s allowed to do what, never leaking a secret,
            protecting a payment — are enforced automatically. No one has to remember to add them,
            because there&rsquo;s no way to leave them out.
          </p>
          <p className="mt-4 text-lg text-muted-foreground">
            If a piece isn&rsquo;t set up yet — no email account connected, no AI key added —
            nothing breaks. That one feature just waits quietly until you switch it on.
          </p>
        </div>
      </div>
    </section>
  );
}
