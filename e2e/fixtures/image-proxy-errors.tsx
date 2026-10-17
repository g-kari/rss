// Production thumbnail component; every candidate is a synthetic fixture URL.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ArticleThumbnail } from "../../src/components/article-items/shared";
import { buildImageProxyUrl } from "../../src/lib/image-proxy-url";

const missing = "https://publisher.test/missing.svg";
const blocked = "https://publisher.test/blocked.svg";
const network = "https://publisher.test/network.svg";
const good = "https://publisher.test/good.svg";
const late = "https://publisher.test/late.svg";
const scenario = new URL(location.href).searchParams.get("scenario") ?? "recover";

function App() {
  const [failures, setFailures] = useState<string[]>([]);
  const [lateCandidate, setLateCandidate] = useState(false);
  const first = scenario === "valid" ? good : lateCandidate ? late : missing;
  const fallbacks =
    scenario === "exhaust"
      ? [missing, buildImageProxyUrl(missing), blocked, blocked, network]
      : [missing, buildImageProxyUrl(missing), good, good];
  return (
    <main>
      <h1>Image proxy error fixture: {scenario}</h1>
      <button onClick={() => setLateCandidate(true)}>Publish late candidate</button>
      <div data-testid="thumbnail">
        <ArticleThumbnail
          thumb={first}
          fallbacks={fallbacks}
          failedSources={
            scenario === "known-failure" ? new Set([buildImageProxyUrl(missing)]) : undefined
          }
          onSourceFailure={(source) => setFailures((previous) => [...previous, source])}
          className="thumbnail-image"
        />
      </div>
      <output aria-label="Failed canonical sources">{JSON.stringify(failures)}</output>
      <output aria-label="Late candidate">{lateCandidate ? late : "none"}</output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
