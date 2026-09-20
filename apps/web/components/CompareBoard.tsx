"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AssetCompare, MarketAsset, MarketPage } from "../lib/api";
import { getCompare, getMarket } from "../lib/api";
import { changeClass, formatCompactUsd, formatPercent, formatUsd } from "../lib/format";
import { Sparkline } from "./Sparkline";
import { StatusBadge } from "./StatusBadge";
import { WatchButton } from "./WatchButton";
import { CopyButton } from "./CopyButton";
import { useWatchlist } from "../lib/watchlist";

const MAX_COMPARE = 3;

function writeIds(ids: string[]) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (ids.length) url.searchParams.set("ids", ids.join(","));
  else url.searchParams.delete("ids");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

export function CompareBoard({ initial }: { initial: AssetCompare }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [hits, setHits] = useState<MarketPage | null>(null);
  const { items: watched } = useWatchlist();

  const selected = useMemo(
    () => snapshot.data.map((asset) => asset.id),
    [snapshot.data],
  );

  async function load(ids: string[]) {
    const nextIds = ids.slice(0, MAX_COMPARE);
    setBusy(true);
    const next = await getCompare(nextIds.join(","));
    setSnapshot(next);
    writeIds(next.ids.length ? next.ids : nextIds);
    setBusy(false);
  }

  async function search(query: string) {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    const page = await getMarket({ q, limit: 6, page: 1 });
    setHits(page);
  }

  function addAsset(asset: { id: string; symbol: string; name: string }) {
    if (selected.includes(asset.id) || selected.length >= MAX_COMPARE) return;
    void load([...selected, asset.id]);
    setDraft("");
    setHits(null);
  }

  function removeAsset(id: string) {
    void load(selected.filter((item) => item !== id));
  }

  useEffect(() => {
    setSnapshot(initial);
  }, [initial]);

  const columns = snapshot.data;
  const empty = columns.length === 0;

  return (
    <section className="card compare-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">SIDE-BY-SIDE</div>
          <h2>Compare 2–3 assets</h2>
        </div>
        <StatusBadge source={snapshot.source} stale={snapshot.stale} />
      </div>
      <p className="exchange-note muted">{snapshot.note}</p>
      <form
        className="exchange-filters"
        onSubmit={(event) => {
          event.preventDefault();
          void search(draft);
        }}
      >
        <label className="sr-only" htmlFor="compare-search">Add a CoinGecko-tracked asset</label>
        <input
          id="compare-search"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add by name, symbol, or id"
          disabled={busy || selected.length >= MAX_COMPARE}
        />
        <button type="submit" className="ghost tool-button" disabled={busy || selected.length >= MAX_COMPARE}>
          Find
        </button>
        <CopyButton label="Copy URL" />
        <span className="muted share-hint">{selected.length}/{MAX_COMPARE} selected. Shareable as <code>?ids=</code>.</span>
      </form>
      {watched.length ? (
        <ul className="compare-hits">
          {watched.slice(0, 8).map((item) => (
            <li key={`watch-${item.id}`}>
              <button
                type="button"
                className="ghost tool-button"
                disabled={selected.includes(item.id) || selected.length >= MAX_COMPARE}
                onClick={() => addAsset({ id: item.id, symbol: item.symbol, name: item.name })}
              >
                Add {item.symbol.toUpperCase()}
              </button>
              <span>{item.name} <span className="muted">watchlist</span></span>
            </li>
          ))}
        </ul>
      ) : null}
      {hits ? (
        <ul className="compare-hits">
          {hits.assets.length === 0 ? (
            <li className="muted">No matches in this CoinGecko snapshot. CoinVigil does not invent assets.</li>
          ) : hits.assets.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                className="ghost tool-button"
                disabled={selected.includes(asset.id) || selected.length >= MAX_COMPARE}
                onClick={() => addAsset(asset)}
              >
                Add {asset.symbol.toUpperCase()}
              </button>
              <span>{asset.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {snapshot.missing.length ? (
        <p className="table-banner" role="status">
          Not in this snapshot: {snapshot.missing.join(", ")}. CoinVigil does not invent assets.
        </p>
      ) : null}
      <div className={`table-wrap ${busy ? "is-busy" : ""}`} aria-busy={busy}>
        {empty ? (
          <div className="empty empty-panel table-empty">
            <strong>Nothing to compare yet</strong>
            <p>Search for a CoinGecko-tracked id, or open Compare from an asset, watchlist, or gainer list.</p>
          </div>
        ) : (
          <table className="markets-table compare-table">
            <caption className="sr-only">
              Side-by-side metrics for {columns.map((asset) => asset.symbol).join(", ")}. Source: {snapshot.source}.
            </caption>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                {columns.map((asset) => (
                  <th scope="col" key={asset.id}>
                    <div className="compare-head">
                      <Link className="asset-link" href={`/asset/${asset.id}`}>
                        <strong>{asset.symbol.toUpperCase()}</strong>
                        <span>{asset.name}</span>
                      </Link>
                      <div className="compare-head-actions">
                        <WatchButton id={asset.id} symbol={asset.symbol} name={asset.name} compact />
                        <button type="button" className="ghost tool-button" onClick={() => removeAsset(asset.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <CompareRow label="Price" values={columns.map((asset) => formatUsd(asset.current_price))} />
              <CompareRow
                label="1h"
                values={columns.map((asset) => formatPercent(asset.price_change_percentage_1h))}
                classes={columns.map((asset) => changeClass(asset.price_change_percentage_1h))}
              />
              <CompareRow
                label="24h"
                values={columns.map((asset) => formatPercent(asset.price_change_percentage_24h))}
                classes={columns.map((asset) => changeClass(asset.price_change_percentage_24h))}
              />
              <CompareRow
                label="7d"
                values={columns.map((asset) => formatPercent(asset.price_change_percentage_7d))}
                classes={columns.map((asset) => changeClass(asset.price_change_percentage_7d))}
              />
              <tr>
                <th scope="row">7d spark</th>
                {columns.map((asset) => (
                  <td key={`${asset.id}-spark`}>
                    <Sparkline values={asset.sparkline_7d} width={96} height={28} />
                  </td>
                ))}
              </tr>
              <CompareRow label="Market cap" values={columns.map((asset) => formatCompactUsd(asset.market_cap))} />
              <CompareRow label="Volume (24h)" values={columns.map((asset) => formatCompactUsd(asset.total_volume))} />
              <CompareRow label="Rank" values={columns.map((asset) => asset.market_cap_rank != null ? `#${asset.market_cap_rank}` : "—")} />
              <CompareRow label="ATH" values={columns.map((asset) => formatUsd(asset.ath))} />
              <tr>
                <th scope="row">Markets</th>
                {columns.map((asset) => (
                  <td key={`${asset.id}-markets`}>
                    <Link className="trade-link" href={`/asset/${asset.id}#markets-tab`}>Exchange pairs</Link>
                    {" · "}
                    <Link className="trade-link" href={`/asset/${asset.id}#chart-lab`}>Chart</Link>
                    {" · "}
                    <Link className="trade-link" href={`/asset/${asset.id}#community`}>Links</Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function CompareRow({
  label,
  values,
  classes = [],
}: {
  label: string;
  values: string[];
  classes?: string[];
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {values.map((value, index) => (
        <td key={`${label}-${index}`} className={classes[index]}>{value}</td>
      ))}
    </tr>
  );
}
