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
  const active = providers.filter((provider) => provider.configured || resultByProvider.has(provider.provider));

  return (
    <section className="card council-roster" id="ai-council">
      <div className="section-heading">
        <div>
          <div className="eyebrow">{configured === 0 ? "HEURISTIC MODE" : "AI COUNCIL"}</div>
          <h2>{configured === 0 ? "No model keys — tools only" : "Configured models only"}</h2>
        </div>
        <span className="muted">{configured} of {supported} providers configured</span>
      </div>
      {configured === 0 ? (
        <div className="consensus-offline">
          <strong>Heuristic mode</strong>
          <span>
            {configured} of {supported} keys set. xAI Grok and the other council models stay idle until their keys are set.
            CoinVigil does not fake a BULLISH multi-model vote. Use Ask and the labeled market brief.
          </span>
        </div>
      ) : (
        <>
          <p className="council-copy">
            Grok (xAI) and other council models vote only when their API keys are set. Missing keys are skipped — empty provider cards are not shown.
          </p>
          <div className="council-providers">
            {active.map((provider) => {
              const result = resultByProvider.get(provider.provider);
              const state = result ? result.status : "ready";
              return (
                <article className={`council-chip ${provider.provider === "xai" ? "featured" : ""}`} key={provider.provider}>
                  <div className="council-chip-top">
                    <strong>{provider.label}</strong>
                    <span className="pill ready">{state}</span>
                  </div>
                  <span>{provider.model || "model unset"}</span>
                  {result?.bias ? (
                    <span className="capitalize">{result.bias} · {result.confidence ?? 0}%</span>
                  ) : (
                    <span>Ready</span>
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
        </>
      )}
    </section>
  );
}
