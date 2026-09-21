"use client";

import { useEffect } from "react";
import type { MarketAsset, WatchlistSentiment } from "./api";
import { getAssetInsight, getWatchlistSentiment, postAlertNotify } from "./api";
import { recordFire } from "./alert-history";
import { claimFire, clipNote, evaluateAlert, isFireableQuoteSource, useAlerts, type AlertNote, type PriceAlert } from "./alerts";

export function useAlertFires(
  items: PriceAlert[],
  quotes: Map<string, MarketAsset>,
  opts: {
    watchIds: Set<string>;
    lastVolume: Record<string, number>;
    source: string;
    now?: number;
  },
) {
  const { patch } = useAlerts();
  const now = opts.now ?? Date.now();
  const notifyIds = items
    .filter((item) => {
      const live = quotes.get(item.coinId);
      return evaluateAlert(
        item,
        { price: live?.current_price, change24h: live?.price_change_percentage_24h, volume: live?.total_volume },
        { watched: opts.watchIds.has(item.coinId), lastVolume: opts.lastVolume[item.coinId], now, source: opts.source },
      ).fired;
    })
    .map((item) => item.id)
    .join(",");

  useEffect(() => {
    if (!notifyIds || !isFireableQuoteSource(opts.source)) return;
    let stopClaiming = false;
    async function attachAndRecord() {
      const ids = notifyIds.split(",");
      const claimed: PriceAlert[] = [];
      for (const item of items) {
        if (stopClaiming) break;
        if (!ids.includes(item.id)) continue;
        if (!claimFire(item.id)) continue;
        claimed.push(item);
        const pending: AlertNote = {
          text: clipNote("Rule matched this snapshot. Loading a tool-grounded note… CoinVigil does not invent prices or whale prints."),
          engine: "heuristic-tools",
          generated: false,
          at: new Date().toISOString(),
        };
        recordFire(item, quotes.get(item.coinId)?.current_price, pending, false);
        patch(item.id, { note: pending });
      }
      if (!claimed.length) return;
      const wantSentiment = claimed.some((item) => item.analysis === "sentiment" || item.analysis === "all");
      let sentiment: WatchlistSentiment | null = null;
      if (wantSentiment) {
        try {
          sentiment = await getWatchlistSentiment([...opts.watchIds]);
        } catch {
          sentiment = null;
        }
      }
      for (const item of claimed) {
        let extra = " No on-chain whale feed on this instance — CoinVigil does not invent whale prints.";
        if (item.analysis === "sentiment" || item.analysis === "all") {
          extra = sentiment?.available
            ? ` Headline sentiment ${sentiment.lean || "mixed"} (${sentiment.engine}, ${sentiment.matched ?? sentiment.items.length} RSS titles). Not Twitter, not NLP.`
            : ` ${sentiment?.reason || "sentiment unavailable"}.`;
        }
        const note: AlertNote = {
          text: clipNote(`Rule matched this snapshot.${extra}`),
          engine: "heuristic-tools",
          generated: false,
          at: new Date().toISOString(),
        };
        let delivered = false;
        try {
          const insight = await getAssetInsight(item.coinId);
          note.text = clipNote(`${insight.answer}${extra}`);
          note.engine = insight.engine || "heuristic-tools";
          note.generated = Boolean(insight.generated);
          note.at = new Date().toISOString();
          const delivery = await postAlertNotify({
            coin_id: item.coinId,
            name: item.name,
            symbol: item.symbol,
            kind: item.kind,
            threshold: item.threshold,
            note: note.text,
            at: note.at,
          });
          delivered = Boolean(delivery.delivered);
        } catch {
          delivered = false;
        }
        recordFire(item, quotes.get(item.coinId)?.current_price, note, delivered);
        patch(item.id, { note });
      }
    }
    void attachAndRecord();
    return () => {
      stopClaiming = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifyIds, opts.source]);
}
