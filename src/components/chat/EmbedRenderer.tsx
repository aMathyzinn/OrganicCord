import type { Embed } from "@/types";
import { MessageContent } from "./MessageContent";
import { Play } from "lucide-react";

interface Props {
  embeds: Embed[];
}

export function EmbedRenderer({ embeds }: Props) {
  if (!embeds.length) return null;

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      {embeds.map((embed, i) => (
        <EmbedCard key={i} embed={embed} />
      ))}
    </div>
  );
}

function EmbedCard({ embed }: { embed: Embed }) {
  const accentColor =
    embed.color != null
      ? `#${embed.color.toString(16).padStart(6, "0")}`
      : "var(--border-subtle)";

  const hasContent =
    embed.title ||
    embed.description ||
    embed.fields?.length ||
    embed.image ||
    embed.thumbnail ||
    embed.footer ||
    embed.author ||
    embed.video;

  if (!hasContent) return null;

  const isVideo = embed.type === "video" || embed.provider?.name === "YouTube";

  if (isVideo) {
    const mediaUrl = embed.thumbnail?.url || embed.video?.url || embed.image?.url;
    return (
      <div
        style={{
          display: "flex",
          borderLeft: `4px solid ${accentColor}`,
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-sm)",
          padding: "12px 16px",
          maxWidth: 430,
          flexDirection: "column",
          gap: 4,
        }}
      >
        {embed.provider && (
          <div style={{ fontSize: 12, color: "var(--text-normal)" }}>
            {embed.provider.name}
          </div>
        )}
        {embed.author && (
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-normal)" }}>
            {embed.author.url ? (
              <a href={embed.author.url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }} className="hover-underline">
                {embed.author.name}
              </a>
            ) : embed.author.name}
          </div>
        )}
        {embed.title && (
          <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-link)", marginBottom: 8, lineHeight: 1.3 }}>
            <a href={embed.url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }} className="hover-underline">
              <MessageContent content={embed.title} embed />
            </a>
          </div>
        )}
        {mediaUrl && (
          <a href={embed.url} target="_blank" rel="noreferrer" style={{ position: "relative", display: "block", borderRadius: 8, overflow: "hidden", aspectRatio: "16/9", width: "100%", background: "#000" }}>
            <img src={mediaUrl} alt={embed.title} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 48, height: 48, background: "rgba(0,0,0,0.6)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Play size={24} color="white" fill="white" style={{ marginLeft: 4 }} />
            </div>
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        borderLeft: `2px solid ${accentColor}`,
        background: "var(--bg-secondary)",
        borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
        padding: "12px 16px",
        maxWidth: 520,
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Author */}
      {embed.author && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {embed.author.icon_url && (
            <img
              src={embed.author.icon_url}
              alt=""
              style={{ width: 18, height: 18, borderRadius: "50%" }}
            />
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-normal)" }}>
            {embed.author.url ? (
              <a
                href={embed.author.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: "inherit" }}
              >
                {embed.author.name}
              </a>
            ) : (
              embed.author.name
            )}
          </span>
        </div>
      )}

      {/* Title + Thumbnail row */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {embed.title && (
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: "var(--text-normal)",
                marginBottom: 4,
                lineHeight: 1.3,
              }}
            >
              {embed.url ? (
                <a
                  href={embed.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover-underline"
                  style={{ color: "var(--text-link)", textDecoration: "none" }}
                >
                  <MessageContent content={embed.title} embed />
                </a>
              ) : (
                <MessageContent content={embed.title} embed />
              )}
            </div>
          )}

          {embed.description && (
            <div
              style={{
                fontSize: 14,
                color: "var(--text-normal)",
                lineHeight: 1.45,
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
              }}
            >
              <MessageContent content={embed.description} embed />
            </div>
          )}
        </div>

        {embed.thumbnail && (
          <img
            src={embed.thumbnail.url}
            alt=""
            style={{
              width: 80,
              height: 80,
              borderRadius: "var(--radius-sm)",
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
        )}
      </div>

      {/* Fields */}
      {embed.fields && embed.fields.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            marginTop: 4,
          }}
        >
          {embed.fields.map((field, i) => (
            <div
              key={i}
              style={{ gridColumn: field.inline ? "auto" : "1 / -1" }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text-normal)",
                  marginBottom: 2,
                }}
              >
                <MessageContent content={field.name} embed />
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  wordBreak: "break-word",
                  lineHeight: 1.4,
                }}
              >
                <MessageContent content={field.value} embed />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image */}
      {embed.image && (
        <img
          src={embed.image.url}
          alt=""
          style={{
            maxWidth: "100%",
            maxHeight: 300,
            borderRadius: "var(--radius-sm)",
            marginTop: 4,
            cursor: "pointer",
          }}
          onClick={() => window.open(embed.image!.url, "_blank")}
        />
      )}

      {/* Footer */}
      {embed.footer && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          {embed.footer.icon_url && (
            <img
              src={embed.footer.icon_url}
              alt=""
              style={{ width: 16, height: 16, borderRadius: "50%" }}
            />
          )}
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            <MessageContent content={embed.footer.text} embed />
          </span>
        </div>
      )}
    </div>
  );
}
