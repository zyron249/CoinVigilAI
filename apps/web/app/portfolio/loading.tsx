import { PageSkeleton } from "../../components/PageSkeleton";

export default function PortfolioLoading() {
  return <PageSkeleton title="portfolio" rows={4} cards={1} />;
}
