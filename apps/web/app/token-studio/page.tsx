import { TokenStudio } from "../../components/TokenStudio";

export default function TokenStudioPage() {
  return (
    <main id="content">
      <section className="page-hero">
        <div className="eyebrow hero-tag">NON-CUSTODIAL TOKEN LAUNCHPAD</div>
        <h1>Create on-chain.<br /><span>Keep control.</span></h1>
        <p>
          Configure a standard token, connect your own wallet, review the permissions and sign the deployment yourself.
          CoinVigil never receives a seed phrase or private key. Factory contracts are unaudited — research only, not financial advice.
          Phase 1 of this product is watchlist surveillance (alerts + Ask), not token creation — this studio is an opt-in tool, not the homepage CTA.
        </p>
      </section>

      <TokenStudio />

      <section className="studio-roadmap card">
        <div>
          <div className="eyebrow">SUPPORTED ARCHITECTURE</div>
          <h2>One studio, multiple chains</h2>
        </div>
        <div className="chain-chips">
          <span>Ethereum</span><span>Base</span><span>BNB Chain</span><span>Polygon</span><span>Arbitrum</span>
          <span className="muted-chip">Solana adapter next</span>
        </div>
      </section>
    </main>
  );
}
