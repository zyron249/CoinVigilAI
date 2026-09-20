import type { AssetContract, AssetProfile, ProjectLink } from "../lib/api";
import { formatDate, truncateAddress } from "../lib/format";
import { CopyButton } from "./CopyButton";
import { StatusBadge } from "./StatusBadge";

const WEBSITE_KINDS = new Set(["website", "whitepaper"]);
const EXPLORER_KINDS = new Set(["explorer"]);
const SOCIAL_KINDS = new Set(["x", "telegram", "discord", "reddit", "facebook", "forum", "chat", "announcement"]);
const REPO_KINDS = new Set(["github"]);

function publicHref(url: string | null | undefined): string | null {
  const text = (url || "").trim();
  if (!text.startsWith("http://") && !text.startsWith("https://")) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local")) return null;
    return text;
  } catch {
    return null;
  }
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function visibleLinks(links: ProjectLink[]): ProjectLink[] {
  const seen = new Set<string>();
  const rows: ProjectLink[] = [];
  for (const link of links) {
    const href = publicHref(link.url);
    if (!href) continue;
    const key = href.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ ...link, url: href });
  }
  return rows;
}

function contractExplorerHref(item: AssetContract): string | null {
  const href = publicHref(item.explorer_url);
  if (!href) return null;
  if (!href.toLowerCase().includes(item.address.toLowerCase())) return null;
  return href;
}

function ChipList({ links }: { links: ProjectLink[] }) {
  if (!links.length) return null;
  return (
    <ul className="project-link-chips">
      {links.map((link) => (
        <li key={`${link.kind}-${link.url}`}>
          <a
            className={`project-link-chip kind-${link.kind}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <strong>{link.label}</strong>
            <span>{hostLabel(link.url)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ProjectLinks({ profile }: { profile: AssetProfile }) {
  const links = visibleLinks(profile.links || []);
  const categories = (profile.categories || []).filter((item) => item.trim()).slice(0, 8);
  const description = profile.description?.trim() || "";
  const genesis = formatDate(profile.genesis_date);
  const contracts = (profile.contracts || []).filter((item) => item.address && item.label).slice(0, 10);
  const websites = links.filter((item) => WEBSITE_KINDS.has(item.kind));
  const explorers = links.filter((item) => EXPLORER_KINDS.has(item.kind));
  const socials = links.filter((item) => SOCIAL_KINDS.has(item.kind));
  const repos = links.filter((item) => REPO_KINDS.has(item.kind));
  const other = links.filter((item) => !WEBSITE_KINDS.has(item.kind) && !EXPLORER_KINDS.has(item.kind) && !SOCIAL_KINDS.has(item.kind) && !REPO_KINDS.has(item.kind));
  const hasOverview = Boolean(description || categories.length || genesis);

  return (
    <div className="asset-overview-grid">
      <section className="card project-links" id="overview" aria-labelledby="asset-overview-title">
        <div className="section-heading project-links-head">
          <div>
            <div className="eyebrow">ABOUT</div>
            <h2 id="asset-overview-title">Overview</h2>
          </div>
          <StatusBadge source={profile.source} stale={profile.stale} />
        </div>
        {description ? <p className="project-description">{description}</p> : null}
        {genesis ? (
          <p className="project-genesis">
            Genesis date: <strong>{genesis}</strong>
            <span className="muted"> CoinGecko listing — omitted when not published.</span>
          </p>
        ) : null}
        {categories.length ? (
          <ul className="project-categories">
            {categories.map((category) => (
              <li key={category}>{category}</li>
            ))}
          </ul>
        ) : null}
        {hasOverview ? null : (
          <p className="project-empty">Not listed. CoinGecko published no English overview, categories, or genesis date for this asset.</p>
        )}
      </section>

      <section className="card project-links" id="community" aria-labelledby="project-links-title">
        <div className="section-heading project-links-head">
          <div>
            <div className="eyebrow">LINKS / COMMUNITY</div>
            <h2 id="project-links-title">Official website & socials</h2>
          </div>
        </div>
        {links.length ? (
          <>
            {websites.length ? (
              <div className="project-link-group">
                <h3>Website</h3>
                <ChipList links={websites} />
              </div>
            ) : null}
            {explorers.length ? (
              <div className="project-link-group">
                <h3>Explorers</h3>
                <ChipList links={explorers} />
              </div>
            ) : null}
            {socials.length ? (
              <div className="project-link-group">
                <h3>Socials</h3>
                <ChipList links={socials} />
              </div>
            ) : null}
            {repos.length ? (
              <div className="project-link-group">
                <h3>Repos</h3>
                <ChipList links={repos} />
              </div>
            ) : null}
            {other.length ? (
              <div className="project-link-group">
                <h3>More</h3>
                <ChipList links={other} />
              </div>
            ) : null}
          </>
        ) : (
          <p className="project-empty">Not listed. CoinGecko published no public project URLs for this asset.</p>
        )}
        <p className="project-note">{profile.note} Not financial advice. CoinVigil does not scrape social networks.</p>
      </section>
      <ContractList contracts={contracts} />
    </div>
  );
}

function ContractList({ contracts }: { contracts: AssetContract[] }) {
  return (
    <section className="card project-links contracts-card" id="contracts" aria-labelledby="contracts-title">
      <div className="section-heading project-links-head">
        <div>
          <div className="eyebrow">CONTRACTS</div>
          <h2 id="contracts-title">Listed platforms</h2>
        </div>
      </div>
      {contracts.length ? (
        <>
          <p className="project-empty">CoinGecko-listed token addresses only. CoinVigil does not invent contracts or explorer URLs. Copy uses the full address; explorer opens only when CoinGecko already published a URL that contains it.</p>
          <ul className="contract-rows">
            {contracts.map((item) => {
              const explorer = contractExplorerHref(item);
              const display = truncateAddress(item.address);
              return (
                <li key={`${item.platform}-${item.address}`}>
                  <strong>{item.label}</strong>
                  <code className="contract-address" title={item.address}>{display}</code>
                  <div className="contract-actions">
                    {explorer ? (
                      <a
                        className="contract-explorer"
                        href={explorer}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Explorer
                      </a>
                    ) : null}
                    <CopyButton value={item.address} label="Copy" />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="project-empty">Not listed. CoinGecko published no platform contracts for this asset. CoinVigil does not invent addresses or explorer URLs.</p>
      )}
    </section>
  );
}
