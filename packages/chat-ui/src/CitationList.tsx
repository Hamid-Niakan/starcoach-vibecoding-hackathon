import type { LiaraCitation } from "@hackathon/contracts";

export function CitationList({
  citations,
  documentationRevision,
}: {
  citations: LiaraCitation[];
  documentationRevision: string;
}) {
  if (!citations.length) return null;
  return (
    <aside className="hackathon-chat__sources" aria-label="منابع پاسخ">
      <h2>منابع</h2>
      <ol>
        {citations.map((citation) => {
          let approved = false;
          try {
            approved =
              new URL(citation.url).origin === "https://docs.liara.ir" &&
              citation.validation === "valid";
          } catch {
            approved = false;
          }
          return (
            <li key={citation.id}>
              {approved ? (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <bdi dir="auto">
                    [{citation.marker.toLocaleString("fa-IR")}] {citation.title}
                    {citation.heading ? ` — ${citation.heading}` : ""}
                  </bdi>
                </a>
              ) : (
                <span>منبع نامعتبر</span>
              )}
            </li>
          );
        })}
      </ol>
      <small>
        نسخه مستندات: <bdi dir="ltr">{documentationRevision.slice(0, 12)}</bdi>
      </small>
    </aside>
  );
}
