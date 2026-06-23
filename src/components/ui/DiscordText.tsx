import React from "react";

interface DiscordTextProps {
  content: string;
  style?: React.CSSProperties;
  className?: string;
}

export function DiscordText({ content, style, className }: DiscordTextProps) {
  if (!content) return null;

  const regex = /<(a?):([^:]+):(\d+)>/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }
    const isAnimated = match[1] === "a";
    const name = match[2];
    const id = match[3];
    const ext = isAnimated ? "gif" : "webp";

    parts.push(
      <img
        key={match.index}
        src={`https://cdn.discordapp.com/emojis/${id}.${ext}?size=44&quality=lossless`}
        alt={`:${name}:`}
        title={`:${name}:`}
        style={{
          width: "1.375em",
          height: "1.375em",
          verticalAlign: "bottom",
          display: "inline-block",
          objectFit: "contain",
          margin: "0 0.1em",
        }}
      />
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }

  // Agora vamos processar cada parte de texto puro para extrair URLs
  const finalParts: React.ReactNode[] = [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  parts.forEach((part, index) => {
    if (typeof part === "string") {
      let match;
      let lastUrlIndex = 0;
      while ((match = urlRegex.exec(part)) !== null) {
        if (match.index > lastUrlIndex) {
          finalParts.push(part.substring(lastUrlIndex, match.index));
        }
        finalParts.push(
          <a
            key={`url-${index}-${match.index}`}
            href={match[1]}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text-link)", textDecoration: "none" }}
            onMouseOver={(e) => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline")}
            onMouseOut={(e) => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "none")}
          >
            {match[1]}
          </a>
        );
        lastUrlIndex = urlRegex.lastIndex;
      }
      if (lastUrlIndex < part.length) {
        finalParts.push(part.substring(lastUrlIndex));
      }
    } else {
      finalParts.push(part);
    }
  });

  return (
    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", ...style }} className={className}>
      {finalParts}
    </span>
  );
}
