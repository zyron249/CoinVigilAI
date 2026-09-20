import type { AssetProfile, ProjectLink } from "../lib/api";
import { StatusBadge } from "./StatusBadge";

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

export function ProjectLinks({ profile }: { profile: AssetProfile }) {
  const links = visibleLinks(profile.links || []);
  const categories = (profile.categories || []).filter((item) => item.trim()).slice(0, 8);
  const description = profile.description?.trim() || "";

  return (
    <section className="card project-links" id="community" aria-labelledby="project-links-title">
      <div className="section-heading project-links-head">
        <div>
          <div className="eyebrow">LINKS / COMMUNITY</div>
          <h2 id="project-links-title">Official website & socials</h2>
        </div>
        <StatusBadge source={profile.source} stale={profile.stale} />
      </div>
      {description ? <p className="project-description">{description}</p> : null}
      {categories.length ? (
        <ul className="project-categories">
          {categories.map((category) => (
            <li key={category}>{category}</li>
          ))}
        </ul>
      ) : null}
      {links.length ? (
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
      ) : (
        <p className="project-empty">Not listed. CoinGecko published no public project URLs for this asset.</p>
      )}
      <p className="project-note">{profile.note} Not financial advice. CoinVigil does not scrape social networks.</p>
    </section>
  );
}
