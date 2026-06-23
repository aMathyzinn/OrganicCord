import type { DiscordChannel } from "@/types";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";

interface Props {
  content: string;
  channels?: DiscordChannel[];
  /** Embed mode: smaller font, no jumbo emoji, allows subset of markdown */
  embed?: boolean;
}

export function MessageContent({ content, channels = [], embed = false }: Props) {
  const accountId = useNavigationStore((s) => s.activeAccountId);
  const guildId = useNavigationStore((s) => s.activeGuildId);
  const roles = (accountId && guildId) ? useDiscordStore((s) => s.cache.guildRoles?.[accountId]?.[guildId]) : undefined;

  if (!content) return null;
  const channelMap = new Map(channels.map((c) => [c.id, c.name ?? c.id]));
  const roleMap = new Map((roles || []).map((r: any) => [String(r.id), r]));

  const nodes = parseMarkdown(content, channelMap, roleMap);
  const jumbo = !embed && isJumboEmoji(nodes);
  return <>{nodes.map((n, i) => renderNode(n, i, jumbo, channelMap, embed))}</>;
}

// ─── AST ─────────────────────────────────────────────────────────────────────

type Node =
  | { t: "text";     v: string }
  | { t: "header";   level: number; children: Node[] }
  | { t: "list";     items: Node[][] }
  | { t: "bold";     children: Node[] }
  | { t: "italic";   children: Node[] }
  | { t: "strike";   children: Node[] }
  | { t: "under";    children: Node[] }
  | { t: "spoiler";  children: Node[] }
  | { t: "code";     v: string }          // inline code
  | { t: "codeblock"; v: string; lang: string }
  | { t: "blockquote"; children: Node[] }
  | { t: "mention";  v: string; color?: number }          // @mention / @everyone / @here
  | { t: "channel";  name: string }       // #channel
  | { t: "emoji";    name: string; id: string; animated: boolean }
  | { t: "link";     url: string }
  | { t: "markdownlink"; text: string; url: string };

// ─── Renderer ────────────────────────────────────────────────────────────────

function renderNode(
  node: Node,
  key: number | string,
  jumbo: boolean,
  channelMap: Map<string, string>,
  embed: boolean,
): React.ReactNode {
  const ch = (children: Node[]) =>
    children.map((n, i) => renderNode(n, i, jumbo, channelMap, embed));

  switch (node.t) {
    case "text":
      return <span key={key}>{node.v}</span>;

    case "header": {
      const fontSize = node.level === 1 ? "1.5em" : node.level === 2 ? "1.25em" : "1.1em";
      return (
        <div key={key} style={{ fontWeight: 700, fontSize, margin: "8px 0 4px", color: "var(--text-normal)" }}>
          {ch(node.children)}
        </div>
      );
    }

    case "list":
      return (
        <ul key={key} style={{ margin: "4px 0", paddingLeft: 24, color: "var(--text-normal)" }}>
          {node.items.map((item, idx) => (
            <li key={idx} style={{ marginBottom: 2 }}>{ch(item)}</li>
          ))}
        </ul>
      );

    case "bold":
      return <strong key={key} style={{ fontWeight: 700, color: "inherit" }}>{ch(node.children)}</strong>;

    case "italic":
      return <em key={key} style={{ fontStyle: "italic" }}>{ch(node.children)}</em>;

    case "strike":
      return <span key={key} style={{ textDecoration: "line-through" }}>{ch(node.children)}</span>;

    case "under":
      return <span key={key} style={{ textDecoration: "underline" }}>{ch(node.children)}</span>;

    case "spoiler":
      return <Spoiler key={key}>{ch(node.children)}</Spoiler>;

    case "code":
      return (
        <code
          key={key}
          style={{
            fontFamily: "monospace",
            background: "var(--bg-tertiary)",
            borderRadius: 3,
            padding: "0 4px",
            fontSize: "0.875em",
            color: "var(--text-normal)",
          }}
        >
          {node.v}
        </code>
      );

    case "codeblock":
      return (
        <pre
          key={key}
          style={{
            background: "var(--bg-tertiary)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            margin: "4px 0",
            overflowX: "auto",
            fontFamily: "monospace",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--text-normal)",
            whiteSpace: "pre",
          }}
        >
          {node.lang && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
              {node.lang}
            </div>
          )}
          <code>{node.v}</code>
        </pre>
      );

    case "blockquote":
      return (
        <blockquote
          key={key}
          style={{
            borderLeft: "2px solid var(--interactive-muted)",
            margin: "2px 0",
            paddingLeft: 12,
            color: "var(--text-normal)",
          }}
        >
          {ch(node.children)}
        </blockquote>
      );

    case "mention": {
      let hexColor = "var(--brand-500)";
      let bgColor = "rgba(88,101,242,0.15)";
      if (node.color) {
        hexColor = `#${node.color.toString(16).padStart(6, "0")}`;
        bgColor = `color-mix(in srgb, ${hexColor} 15%, transparent)`;
      }
      return (
        <span
          key={key}
          style={{
            color: hexColor,
            background: bgColor,
            borderRadius: 3,
            padding: "0 3px",
            fontWeight: 500,
            cursor: "default",
          }}
        >
          {node.v}
        </span>
      );
    }

    case "channel":
      return (
        <span
          key={key}
          style={{
            color: "var(--brand-500)",
            background: "rgba(88,101,242,0.1)",
            borderRadius: 3,
            padding: "0 3px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          #{node.name}
        </span>
      );

    case "emoji": {
      const size = jumbo ? 48 : embed ? 18 : 22;
      return (
        <img
          key={key}
          src={`https://cdn.discordapp.com/emojis/${node.id}.${node.animated ? "gif" : "webp"}?size=64&quality=lossless`}
          alt={`:${node.name}:`}
          title={`:${node.name}:`}
          style={{ width: size, height: size, verticalAlign: "middle", margin: "0 1px" }}
        />
      );
    }

    case "link":
      return (
        <a
          key={key}
          href={node.url}
          target="_blank"
          rel="noreferrer"
          className="hover-underline"
          style={{ color: "var(--text-link)", textDecoration: "none" }}
        >
          {node.url}
        </a>
      );

    case "markdownlink":
      return (
        <a
          key={key}
          href={node.url}
          target="_blank"
          rel="noreferrer"
          className="hover-underline"
          style={{ color: "var(--text-link)", textDecoration: "none" }}
        >
          {node.text}
        </a>
      );

    default:
      return null;
  }
}

// ─── Spoiler component ────────────────────────────────────────────────────────

import { useState } from "react";

function Spoiler({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={() => setRevealed((v) => !v)}
      style={{
        background: revealed ? "transparent" : "var(--text-muted)",
        color: revealed ? "inherit" : "transparent",
        borderRadius: 3,
        padding: "0 2px",
        cursor: "pointer",
        userSelect: revealed ? "text" : "none",
        transition: "background 150ms, color 150ms",
      }}
    >
      {children}
    </span>
  );
}

// ─── Jumbo emoji detection ────────────────────────────────────────────────────

function isJumboEmoji(nodes: Node[]): boolean {
  // Jumbo if the entire message is only custom emojis (+ whitespace)
  for (const n of nodes) {
    if (n.t === "text" && n.v.trim() !== "") return false;
    if (n.t !== "emoji" && n.t !== "text") return false;
  }
  const emojiCount = nodes.filter((n) => n.t === "emoji").length;
  return emojiCount > 0 && emojiCount <= 27;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseMarkdown(input: string, channelMap: Map<string, string>, roleMap: Map<string, any>): Node[] {
  // 1. Split off code blocks and blockquotes first (block-level, no nesting)
  const nodes: Node[] = [];
  let rest = input;

  // Process line by line for blockquotes, but handle codeblocks first
  const codeBlockRe = /^```(\w*)\n?([\s\S]*?)```/gm;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  codeBlockRe.lastIndex = 0;
  while ((m = codeBlockRe.exec(rest)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(...parseInline(rest.slice(lastIndex, m.index), channelMap, roleMap));
    }
    nodes.push({ t: "codeblock", lang: m[1] ?? "", v: m[2].replace(/\n$/, "") });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < rest.length) {
    nodes.push(...parseInline(rest.slice(lastIndex), channelMap, roleMap));
  }

  return nodes;
}

function parseInline(text: string, channelMap: Map<string, string>, roleMap: Map<string, any>): Node[] {
  // Handle blockquotes and headers line by line
  const lines = text.split("\n");
  const result: Node[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Header check
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      result.push({
        t: "header",
        level: headerMatch[1].length,
        children: parseSpans(headerMatch[2], channelMap, roleMap),
      });
      if (i < lines.length - 1) result.push({ t: "text", v: "\n" });
      i++;
      continue;
    }

    // List check (- or *)
    const listMatch = line.match(/^(\s*)([-*])\s+(.+)/);
    if (listMatch) {
      const items: Node[][] = [];
      items.push(parseSpans(listMatch[3], channelMap, roleMap));
      // Collect consecutive list items
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextListMatch = nextLine.match(/^(\s*)([-*])\s+(.+)/);
        if (nextListMatch && nextListMatch[1] === listMatch[1]) { // same indentation level
          items.push(parseSpans(nextListMatch[3], channelMap, roleMap));
          i++;
        } else {
          break;
        }
      }
      result.push({ t: "list", items });
      if (i < lines.length - 1) result.push({ t: "text", v: "\n" });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ") || line === ">") {
      const bqLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
        bqLines.push(lines[i].replace(/^> ?/, ""));
        i++;
      }
      result.push({
        t: "blockquote",
        children: parseSpans(bqLines.join("\n"), channelMap, roleMap),
      });
      if (i < lines.length) result.push({ t: "text", v: "\n" });
    } else {
      // Regular line
      const lineNodes = parseSpans(line, channelMap, roleMap);
      result.push(...lineNodes);
      if (i < lines.length - 1) result.push({ t: "text", v: "\n" });
      i++;
    }
  }

  return result;
}

// parseSpans: handles inline markdown (bold, italic, code, mentions, emojis, links)
function parseSpans(text: string, channelMap: Map<string, string>, roleMap: Map<string, any>): Node[] {
  const nodes: Node[] = [];

  // Token pattern — order matters: longer/more specific first
  const pattern = new RegExp(
    [
      // Custom emoji animated
      "<a:([^:>]+):(\\d+)>",
      // Custom emoji static
      "<:([^:>]+):(\\d+)>",
      // Channel mention
      "<#(\\d+)>",
      // Role mention
      "<@&(\\d+)>",
      // User mention
      "<@!?(\\d+)>",
      // @everyone / @here
      "(@everyone|@here)",
      // Inline code
      "`([^`]+)`",
      // Markdown link
      "\\[([^\\]]+)\\]\\((https?://[^\\s\\)]+)\\)",
      // Bold+italic (*** ... ***)
      "\\*{3}(.+?)\\*{3}",
      // Bold (** ... **)
      "\\*{2}(.+?)\\*{2}",
      // Italic (* ... * or _ ... _)
      "\\*(.+?)\\*",
      // Italic underscore
      "_(.+?)_",
      // Underline (__...__) — must come BEFORE italic underscore for __
      "(?<!_)__(?!_)(.+?)__(?!_)",
      // Strikethrough (~~...~~)
      "~~(.+?)~~",
      // Spoiler (||...||)
      "\\|\\|(.+?)\\|\\|",
      // Plain URL
      "https?://[^\\s<>\"]+[^\\s<>\".,;!?]",
    ].join("|"),
    "gs"
  );

  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push({ t: "text", v: text.slice(last, m.index) });
    }

    const [full,
      animEmojiName, animEmojiId,
      staticEmojiName, staticEmojiId,
      channelId,
      roleId,
      userId,
      everyoneHere,
      codeContent,
      mdLinkText, mdLinkUrl,
      boldItalicContent,
      boldContent,
      italicStarContent,
      italicUnderContent,
      underlineContent,
      strikeContent,
      spoilerContent,
      // url is the whole match when none of the groups fire
    ] = m;

    if (animEmojiId) {
      nodes.push({ t: "emoji", name: animEmojiName, id: animEmojiId, animated: true });
    } else if (staticEmojiId) {
      nodes.push({ t: "emoji", name: staticEmojiName, id: staticEmojiId, animated: false });
    } else if (channelId) {
      const name = channelMap.get(channelId) ?? channelId;
      nodes.push({ t: "channel", name });
    } else if (roleId) {
      const role = roleMap.get(roleId);
      const name = role ? role.name : "Cargo";
      const color = role && role.color ? role.color : undefined;
      nodes.push({ t: "mention", v: `@${name}`, color });
    } else if (userId) {
      nodes.push({ t: "mention", v: `@Usuário` });
    } else if (everyoneHere) {
      nodes.push({ t: "mention", v: everyoneHere });
    } else if (codeContent !== undefined) {
      nodes.push({ t: "code", v: codeContent });
    } else if (mdLinkUrl !== undefined) {
      nodes.push({ t: "markdownlink", text: mdLinkText, url: mdLinkUrl });
    } else if (boldItalicContent !== undefined) {
      nodes.push({ t: "bold", children: [{ t: "italic", children: parseSpans(boldItalicContent, channelMap, roleMap) }] });
    } else if (boldContent !== undefined) {
      nodes.push({ t: "bold", children: parseSpans(boldContent, channelMap, roleMap) });
    } else if (italicStarContent !== undefined) {
      nodes.push({ t: "italic", children: parseSpans(italicStarContent, channelMap, roleMap) });
    } else if (italicUnderContent !== undefined) {
      nodes.push({ t: "italic", children: parseSpans(italicUnderContent, channelMap, roleMap) });
    } else if (underlineContent !== undefined) {
      nodes.push({ t: "under", children: parseSpans(underlineContent, channelMap, roleMap) });
    } else if (strikeContent !== undefined) {
      nodes.push({ t: "strike", children: parseSpans(strikeContent, channelMap, roleMap) });
    } else if (spoilerContent !== undefined) {
      nodes.push({ t: "spoiler", children: parseSpans(spoilerContent, channelMap, roleMap) });
    } else {
      // plain URL
      nodes.push({ t: "link", url: full });
    }

    last = m.index + full.length;
  }

  if (last < text.length) {
    nodes.push({ t: "text", v: text.slice(last) });
  }

  return nodes;
}
