import { AlertsBoard } from "../../components/AlertsBoard";
import Link from "next/link";

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const coin = (firstParam(query.coin) || "").trim().toLowerCase();
  const kindRaw = (firstParam(query.kind) || "above").trim();
  const kind = (["above", "below", "change_24h"].includes(kindRaw) ? kindRaw : "above") as "above" | "below" | "change_24h";

  return (
    <main id="content">
      <section className="page-hero">
        <div className="eyebrow hero-tag">ALERTS</div>
        <h1>Watchlist only.<br /><span>Never the whole market.</span></h1>
        <p>
          Create a watchlist rule, keep the active list here, and read fire history with timestamps.
          Quotes poll the CoinGecko snapshot — there is no WebSocket tick stream. Delivery is in-app in this browser;
          optional HTTPS webhook via ALERT_WEBHOOK_URL. Telegram and Discord are not implemented.
          Free watchlist is 3 coins. Informational research, not financial advice.
        </p>
      </section>
      <AlertsBoard initialCoin={coin} initialKind={kind} />
      <p className="coverage-note muted">
        Star coins on the <Link href="/#desk">desk</Link>. Holdings remain a <Link href="/portfolio">light stub</Link>
        {" "}(no custody). CoinVigil has no accounts and does not invent on-chain whale prints.
      </p>
    </main>
  );
}
