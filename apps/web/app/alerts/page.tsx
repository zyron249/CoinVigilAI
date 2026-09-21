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
  const coin = (firstParam(query.coin) || "bitcoin").trim().toLowerCase();
  const kindRaw = (firstParam(query.kind) || "above").trim();
  const kind = (["above", "below", "change_24h"].includes(kindRaw) ? kindRaw : "above") as "above" | "below" | "change_24h";

  return (
    <main id="content">
      <section className="page-hero">
        <div className="eyebrow hero-tag">ALERTS</div>
        <h1>Watch a level.<br /><span>Local only for now.</span></h1>
        <p>
          Price-above, price-below, and 24h-change rules live in this browser and evaluate on Markets and asset pages.
          Push notifications are a later slice — this tab uses the current snapshot only. Informational research, not
          financial advice.
        </p>
      </section>
      <AlertsBoard initialCoin={coin} initialKind={kind} />
      <p className="coverage-note muted">
        Holdings live on the <Link href="/portfolio">local portfolio stub</Link> (no custody, no keys). Watch research
        lists on the <Link href="/#watchlist">watchlist</Link>. CoinVigil has no accounts.
      </p>
    </main>
  );
}
