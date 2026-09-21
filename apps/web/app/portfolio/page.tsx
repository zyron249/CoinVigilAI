import { PortfolioBoard } from "../../components/PortfolioBoard";
import Link from "next/link";

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const coin = (firstParam(query.coin) || "bitcoin").trim().toLowerCase();

  return (
    <main id="content">
      <section className="page-hero">
        <div className="eyebrow hero-tag">PORTFOLIO</div>
        <h1>Local lots.<br /><span>No wallet, no keys.</span></h1>
        <p>
          A holdings stub: quantity plus optional cost against the CoinGecko snapshot. CoinVigil does not custody assets,
          connect wallets, or store private keys. Informational research, not financial advice.
        </p>
      </section>
      <PortfolioBoard initialCoin={coin} />
      <p className="coverage-note muted">
        This is not a broker and not a CMC clone. Research lists live on the{" "}
        <Link href="/#watchlist">watchlist</Link>. Price rules live on <Link href="/alerts">Alerts</Link> (no push yet).
      </p>
    </main>
  );
}
