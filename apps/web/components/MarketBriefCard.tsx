"use client";

import { useEffect, useState } from "react";
import type { MarketBrief } from "../lib/api";
import { getMarketBrief } from "../lib/api";
import { StatusBadge } from "./StatusBadge";

export function MarketBriefCard({
  initial = null,
  refresh = false,
}: {
  initial?: MarketBrief | null;
  refresh?: boolean;
}) {
  const [brief, setBrief] = useState<MarketBrief | null>(initial);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">(initial ? "ready" : "loading");

  useEffect(() => {
    if (!refresh && initial) return;
    let active = true;
    setStatus(initial ? "ready" : "loading");
    getMarketBrief()
      .then((payload) => {
        if (!active) return;
        setBrief(payload);
        setStatus(payload ? "ready" : "empty");
      })
      .catch(() => {
        if (active) setStatus(initial ? "ready" : "empty");
      });
    return () => {
      active = false;
    };
  }, [refresh, initial]);

  const engineLabel = brief?.generated
    ? `AI-generated · ${brief.engine}`
    : "Heuristic fallback · no council vote yet";

  return (
    <section className="card market-brief" id="ai-brief" aria-live="polite">
      <div className="section-heading">
        <div>
          <div className="eyebrow">AI MARKET BRIEF</div>
          <h2>{brief?.headline || "Market tone"}</h2>
        </div>
        <div className="brief-meta">
          {brief ? <span className={`tone-pill ${brief.tone}`}>{brief.tone}</span> : null}
          <StatusBadge source={brief?.data_source} />
        </div>
      </div>
      <div className="brief-body">
        {status === "loading" && !brief ? (
          <p className="muted">Loading the market brief. If no AI keys are set, this uses the labeled heuristic fallback — not a live model vote.</p>
        ) : null}
        {status === "empty" && !brief ? (
          <p className="muted">Market brief unavailable. The rankings table below still uses its own labeled market source.</p>
        ) : null}
        {brief ? (
          <>
            <p>{brief.summary}</p>
            <ul>
              {brief.bullets.map((bullet, index) => <li key={`${index}:${bullet.slice(0, 48)}`}>{bullet}</li>)}
            </ul>
            <div className="brief-labels">
              <span className="pill">{brief.generated ? "AI-generated" : "Heuristic"}</span>
              <span className="muted">{engineLabel}</span>
              {brief.grounded ? <span className="muted">Tool-grounded (markets / movers / global).</span> : null}
              {brief.providers_responded.length > 0 ? (
                <span className="muted">Responded: {brief.providers_responded.join(", ")}.</span>
              ) : (
                <span className="muted">No AI keys configured — this is the quantitative fallback, not a live model vote.</span>
              )}
            </div>
            <p className="brief-disclaimer">
              {brief.generated ? "You are reading AI-generated research. " : ""}
              {brief.disclaimer}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
