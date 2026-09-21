"use client";

import { useState } from "react";

export function NewsletterCard() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);

  return (
    <section className="card newsletter-card">
      <div className="eyebrow">STAY AHEAD</div>
      <h2>No inbox backend here</h2>
      <p className="muted">
        This form does not email you. CoinVigil has no newsletter server on this instance — a “subscribed” state would be fake.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setNote("Not sent. There is no email/push backend. Watch Alerts in this browser instead.");
        }}
      >
        <label className="sr-only" htmlFor="newsletter-email">Email</label>
        <input
          id="newsletter-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit">Subscribe (disabled path)</button>
      </form>
      {note ? <p className="muted" role="status">{note}</p> : null}
    </section>
  );
}
