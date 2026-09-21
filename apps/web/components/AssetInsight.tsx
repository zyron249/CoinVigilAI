"use client";

import { useEffect, useState } from "react";
import { getAssetInsight, type AskAnswer } from "../lib/api";
import { AskPanel } from "./AskPanel";
import { StatusBadge } from "./StatusBadge";

export function AssetInsight({ coinId }: { coinId: string }) {
  const [insight, setInsight] = useState<AskAnswer | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    setBusy(true);
    getAssetInsight(coinId)
      .then((payload) => {
        if (!active) return;
        setInsight(payload);
        setBusy(false);
      })
      .catch(() => {
        if (!active) return;
        setInsight(null);
        setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [coinId]);

  const failed = Boolean(insight?.error || insight?.engine === "unavailable");

  return (
    <div className="insight-stack" id="ai-insight">
      {busy && !insight ? (
        <section className="card insight-card desk-skeleton" id="ai-insight-tldr" aria-busy="true">
          <div className="skeleton skeleton-chip" />
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-copy" />
          <div className="skeleton skeleton-row" />
        </section>
      ) : null}
      {!busy && (!insight || failed) ? (
        <section className="card insight-card" id="ai-insight-tldr">
          <div className="section-heading">
            <div>
              <div className="eyebrow">AI INSIGHT</div>
              <h2>Insight unavailable</h2>
            </div>
          </div>
          <p>
            {insight?.answer || "Tools could not build a TLDR for this asset. CoinVigil does not invent a fill-in."}
          </p>
          <p className="brief-disclaimer">
            You are interacting with CoinVigil AI. Informational research only — not financial advice.
          </p>
        </section>
      ) : null}
      {insight && !failed ? (
        <section className="card insight-card" id="ai-insight-tldr">
          <div className="section-heading">
            <div>
              <div className="eyebrow">AI INSIGHT</div>
              <h2>What moved, from tools</h2>
            </div>
            <StatusBadge source={insight.data_source} />
          </div>
          <p className="ask-engine muted">
            {insight.generated ? "AI-generated" : "Heuristic tools"} · {insight.engine}
            {insight.tools_used.length ? ` · ${insight.tools_used.join(", ")}` : ""}
          </p>
          <p>{insight.answer}</p>
          {insight.citations.length ? (
            <ul className="ask-cites">
              {insight.citations.map((cite, index) => (
                <li key={`${cite.kind}-${cite.label}-${index}`}>
                  {cite.url ? <a href={cite.url} target="_blank" rel="noopener noreferrer">{cite.label}</a> : cite.label}
                  {cite.detail ? <em> · {cite.detail}</em> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted insight-loading">No citations this pass — the gap stays empty instead of being padded.</p>
          )}
          <p className="brief-disclaimer">{insight.disclaimer}</p>
        </section>
      ) : null}
      <AskPanel coinId={coinId} heading="Ask about this asset" compact />
    </div>
  );
}
