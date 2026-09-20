"use client";

import { useEffect, useState } from "react";
import type { MarketBrief } from "../lib/api";
import { getMarketBrief } from "../lib/api";
import { sourceLabel } from "../lib/format";

export function MarketBriefCard() {
  const [brief, setBrief] = useState<MarketBrief | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    let active = true;
    getMarketBrief()
      .then((payload) => {
        if (!active) return;
        setBrief(payload);
        setStatus(payload ? "ready" : "empty");
      })
      .catch(() => {
        if (active) setStatus("empty");
      });
    return () => {
      active = false;
    };
  }, []);

  const source = sourceLabel(brief?.data_source);
  const engineLabel = brief?.generated
    ? `AI-generated · ${brief.engine}`
    : "Heuristic fallback · no council vote yet";

  return (
    <section className="card market-brief" id="ai-brief">
      <div className="section-heading">
        <div>
          <div className="eyebrow">AI MARKET BRIEF</div>
          <h2>{brief?.headline || "Market tone"}</h2>
        </div>
        <div className="brief-meta">
          {brief ? <span className={`tone-pill ${brief.tone}`}>{brief.tone}</span> : null}
          <span className={source.demo ? "live-dot demo" : "live-dot"}>{source.text}</span>
        </div>
      </div>
      <div className="brief-body">
        {status === "loading" ? (
          <p className="muted">Loading an optional council/Grok brief… heuristic fallback if no keys are set.</p>
        ) : null}
        {status === "empty" ? (
          <p className="muted">Market brief unavailable. Rankings table below still uses the labeled market source.</p>
        ) : null}
        {brief ? (
          <>
            <p>{brief.summary}</p>
            <ul>
              {brief.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ul>
            <div className="brief-labels">
              <span className="pill">{brief.generated ? "AI-generated" : "Heuristic"}</span>
              <span className="muted">{engineLabel}</span>
              {brief.providers_responded.length > 0 ? (
                <span className="muted">Responded: {brief.providers_responded.join(", ")}</span>
              ) : (
                <span className="muted">Set XAI_API_KEY or another council key to replace the heuristic.</span>
              )}
            </div>
            <p className="brief-disclaimer">{brief.disclaimer}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
