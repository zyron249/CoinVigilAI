import type { CouncilProvider, CouncilProviderResult } from "../lib/api";

function providerLabel(provider: string, roster: CouncilProvider[]) {
  return roster.find((item) => item.provider === provider)?.label ?? provider;
}

export function CouncilRoster({
  providers,
  configured,
  supported,
  results = [],
}: {
  providers: CouncilProvider[];
  configured: number;
  supported: number;
  results?: CouncilProviderResult[];
}) {
  const resultByProvider = new Map(results.map((result) => [result.provider, result]));

  return (
    <section className="card council-roster" id="ai-council">
      <div className="section-heading">
        <div>
          <div className="eyebrow">AI COUNCIL</div>
          <h2>AI Token Analysis</h2>
        </div>
        <span className="muted">{configured} of {supported} providers configured</span>
      </div>
      <p className="council-copy">
        {configured === 0
          ? `Models offline — ${configured} of ${supported} keys set. Heuristic tools only. CoinVigil does not fake a BULLISH 78% multi-model vote.`
          : `Grok (xAI) and the other council models vote only when their API keys are set. Missing keys are skipped.`}
      </p>
      {configured === 0 ? (
        <div className="consensus-offline">
          <strong>No live consensus</strong>
          <span>Use the labeled market brief. Fake GPT-4/Claude rows are not shown.</span>
        </div>
      ) : null}
      <div className="council-providers">
        {providers.map((provider) => {
          const result = resultByProvider.get(provider.provider);
          const state = result
            ? result.status
            : provider.configured
              ? "ready"
              : "optional";
          return (
            <article className={`council-chip ${provider.provider === "xai" ? "featured" : ""}`} key={provider.provider}>
              <div className="council-chip-top">
                <strong>{provider.label}</strong>
                <span className={`pill ${provider.configured || result ? "ready" : "optional"}`}>{state}</span>
              </div>
              <span>{provider.model || "model unset"}</span>
              {result?.bias ? (
                <span className="capitalize">{result.bias} · {result.confidence ?? 0}%</span>
              ) : (
                <span>{provider.optional ? "Optional — skipped without a key" : "Available"}</span>
              )}
            </article>
          );
        })}
      </div>
      {results.length > 0 ? (
        <div className="council-votes muted">
          Votes from {results.filter((result) => result.status === "ok").map((result) => providerLabel(result.provider, providers)).join(", ") || "no successful models"}
        </div>
      ) : null}
    </section>
  );
}
