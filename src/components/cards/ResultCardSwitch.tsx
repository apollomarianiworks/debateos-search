import type { RankedResult } from "@/search-engine/types";
import { WebResultCard } from "./WebResultCard";
import { ImageResultCard } from "./ImageResultCard";
import { PersonResultCard } from "./PersonResultCard";
import { StatResultCard } from "./StatResultCard";
import { DatasetResultCard } from "./DatasetResultCard";
import { ChartResultCard } from "./ChartResultCard";
import type {
  ImageResult,
  PersonResult,
  StatResult,
  DatasetResult,
  ChartResult,
} from "@/providers/types";

/**
 * Pick the appropriate card variant based on the result's discriminator.
 * Narrowing through intersection with the matching variant type keeps the
 * card-level props strictly typed.
 */
export function ResultCardSwitch({ result }: { result: RankedResult }) {
  switch (result.resultType) {
    case "image":
      return <ImageResultCard result={result as RankedResult & ImageResult} />;
    case "person":
      return <PersonResultCard result={result as RankedResult & PersonResult} />;
    case "stat":
      return <StatResultCard result={result as RankedResult & StatResult} />;
    case "dataset":
      return <DatasetResultCard result={result as RankedResult & DatasetResult} />;
    case "chart":
      return <ChartResultCard result={result as RankedResult & ChartResult} />;
    case "web":
    case "news":
    default:
      return <WebResultCard result={result} />;
  }
}
