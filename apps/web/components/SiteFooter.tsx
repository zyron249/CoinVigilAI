import Link from "next/link";

export function SiteFooter() {
  return (
    <footer>
      <div>
        CoinVigil AI · Research tool, not financial advice. Market data via CoinGecko.
        Demo snapshots are labeled and never presented as live prices.
        {" "}
        <Link href="/status">Stack status</Link>
      </div>
      <div>v0.4.0</div>
    </footer>
  );
}
