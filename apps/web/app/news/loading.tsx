import { PageSkeleton } from "../../components/PageSkeleton";

export default function NewsLoading() {
  return <PageSkeleton title="news" rows={8} cards={2} />;
}
