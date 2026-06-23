import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from "react";
import type { DiscordMessage } from "@/types";
import { getDisplayName } from "@/lib/utils";
import { Reply, X, Plus, File as FileIcon, Smile } from "lucide-react";
import EmojiPicker, { Theme, EmojiClickData, Categories } from "emoji-picker-react";
import * as Popover from "@radix-ui/react-popover";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { useMemo } from "react";
import { OrganicMark } from "@/components/ui/OrganicMark";
import { DiscordEmojiPicker } from "./DiscordEmojiPicker";

import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

export type AttachmentData = 
  | { type: "file", file: File }
  | { type: "path", path: string, name: string, size: number, mime: string };

interface Props {
  channelId: string;
  replyingTo: DiscordMessage | null;
  onCancelReply: () => void;
  onSend: (content: string, attachment?: AttachmentData) => Promise<void>;
  accountColor?: string;
}

export function MessageInput({
  channelId,
  replyingTo,
  onCancelReply,
  onSend,
  accountColor = "var(--brand-500)",
}: Props) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [attachment, setAttachment] = useState<AttachmentData | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { activeAccountId } = useNavigationStore();
  const guildEmojisRaw = useDiscordStore((s) => activeAccountId ? s.cache.guildEmojis[activeAccountId] : null);

  const customEmojis = useMemo(() => {
    if (!guildEmojisRaw) return [];
    const flattened = Object.values(guildEmojisRaw).flat();
    console.log("customEmojis computed:", flattened);
    return flattened;
  }, [guildEmojisRaw]);

  useEffect(() => {
    const unlisten = listen<{ progress: number }>("upload-progress", (event) => {
      setUploadProgress(event.payload.progress);
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    let toInsert = emojiData.emoji;
    if (emojiData.isCustom) {
      const customEmoji = emojiData as any;
      const isAnimated = customEmoji.imageUrl?.includes(".gif") || customEmoji.imgUrl?.includes(".gif");
      toInsert = `<${isAnimated ? "a" : ""}:${emojiData.names[0]}:${emojiData.unified || customEmoji.id}>`;
    }
    setContent((prev) => prev + toInsert);
    setPickerOpen(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    if ((!trimmed && !attachment) || sending) return;

    setSending(true);
    try {
      await onSend(trimmed, attachment || undefined);
      setContent("");
      setAttachment(null);
      // Reseta altura do textarea
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
      setUploadProgress(null);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  }, [content, attachment, sending, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape" && replyingTo) {
        onCancelReply();
      }
    },
    [handleSend, replyingTo, onCancelReply]
  );

  const lastTypingRef = useRef<number>(0);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
      // Auto-resize
      const el = e.target;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";

      if (e.target.value.length > 0 && activeAccountId) {
        const now = Date.now();
        if (now - lastTypingRef.current > 5000) {
          lastTypingRef.current = now;
          import("@tauri-apps/api/core").then(({ invoke }) => {
            invoke("trigger_typing", { accountId: activeAccountId, channelId }).catch(console.error);
          });
        }
      }
    },
    [channelId, activeAccountId]
  );

  const handleAttachClick = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: "Selecionar anexo",
      });
      if (selected && typeof selected === "string") {
        // Tenta inferir o mime, no desktop o mime é mais util no backend, mas aqui passamos generico
        const name = selected.split(/\\|\//).pop() || "Arquivo";
        setAttachment({ type: "path", path: selected, name, size: 0, mime: "application/octet-stream" });
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      style={{
        padding: "0 16px 24px",
        flexShrink: 0,
      }}
    >
      {/* Reply preview */}
      {replyingTo && (
        <div
          style={{
            background: "var(--bg-secondary)",
            borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            borderBottom: "1px solid var(--border-subtle)",
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Reply size={14} />
            <span>
              Respondendo para{" "}
              <strong style={{ color: "var(--text-normal)" }}>
                {getDisplayName(replyingTo.author)}
              </strong>
            </span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 300,
                opacity: 0.7,
              }}
            >
              {replyingTo.content.slice(0, 80) || "[anexo]"}
            </span>
          </div>
          <button
            onClick={onCancelReply}
            className="cancel-reply-btn"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 18,
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Attachment Preview */}
      {attachment && (
        <div
          style={{
            background: "var(--bg-secondary)",
            borderRadius: replyingTo
              ? "0"
              : "var(--radius-md) var(--radius-md) 0 0",
            padding: "16px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              position: "relative",
              width: 64,
              height: 64,
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
              background: "var(--bg-tertiary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {(attachment.type === "file" && attachment.file.type.startsWith("image/")) ? (
              <img
                src={URL.createObjectURL(attachment.file)}
                alt="attachment"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (attachment.type === "path" && (attachment.name.endsWith(".png") || attachment.name.endsWith(".jpg") || attachment.name.endsWith(".jpeg"))) ? (
              <img
                src={convertFileSrc(attachment.path)}
                alt="attachment"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <FileIcon size={24} color="var(--text-muted)" />
            )}
            <button
              onClick={() => {
                setAttachment(null);
              }}
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                background: "rgba(0,0,0,0.6)",
                border: "none",
                borderRadius: "50%",
                width: 20,
                height: 20,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <X size={12} />
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-normal)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {attachment.type === "file" ? attachment.file.name : attachment.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {attachment.type === "file" ? (attachment.file.size / 1024 / 1024).toFixed(2) : "Arquivo Local"} MB
            </div>
          </div>
        </div>
      )}

      {/* Input box */}
      <div
        style={{
          background: "var(--bg-accent)",
          borderRadius: replyingTo || attachment
            ? "0 0 var(--radius-md) var(--radius-md)"
            : "var(--radius-md)",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "0 12px",
          border: "1px solid transparent",
          transition: "border-color 150ms",
        }}
        onFocusCapture={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor = accountColor)
        }
        onBlurCapture={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor = "transparent")
        }
      >
        <button
          onClick={handleAttachClick}
          title="Enviar um arquivo"
          style={{
            background: "var(--bg-tertiary)",
            border: "none",
            borderRadius: "50%",
            width: 32,
            height: 32,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "var(--text-normal)",
            transition: "background 150ms",
            marginTop: 6,
            marginBottom: 6,
          }}
          className="hover-bg-modifier-selected"
        >
          <Plus size={18} />
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            if (e.clipboardData.files && e.clipboardData.files.length > 0) {
              const file = e.clipboardData.files[0];
              if (file.size > 25 * 1024 * 1024) {
                alert("Por favor, use o botão de anexo (+) para arquivos maiores que 25MB para otimização de memória.");
                e.preventDefault();
                return;
              }
              setAttachment({ type: "file", file });
              e.preventDefault();
            }
          }}
          disabled={sending}
          placeholder={`Enviar mensagem...`}
          rows={1}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            color: "var(--text-normal)",
            fontSize: 15,
            lineHeight: "20px",
            resize: "none",
            padding: "12px 0",
            maxHeight: 200,
            overflowY: "auto",
            minHeight: 24,
            outline: "none",
            fontFamily: "inherit",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, marginBottom: 6 }}>
          {activeAccountId ? (
            <DiscordEmojiPicker 
              accountId={activeAccountId} 
              onSelect={(emojiStr) => {
                setContent((prev) => prev + (prev && !prev.endsWith(" ") ? " " : "") + emojiStr + " ");
                textareaRef.current?.focus();
              }} 
            >
              <button
                title="Emoji do Servidor"
                style={{
                  background: "transparent",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "var(--text-muted)",
                  transition: "color 150ms",
                }}
                className="hover-color-normal"
              >
                <OrganicMark size={20} />
              </button>
            </DiscordEmojiPicker>
          ) : (
            <div style={{ width: 32 }} />
          )}

          <Popover.Root open={pickerOpen} onOpenChange={setPickerOpen}>
            <Popover.Trigger asChild>
              <button
                title="Adicionar Emoji"
                style={{
                  background: "transparent",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "var(--text-muted)",
                  transition: "color 150ms",
                }}
                className="hover-color-normal"
              >
                <Smile size={20} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="top" align="end" sideOffset={10} style={{ zIndex: 100 }}>
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  theme={Theme.DARK}
                  lazyLoadEmojis={true}
                  searchPlaceHolder="Pesquisar emoji..."
                  customEmojis={customEmojis}
                  categoryIcons={{
                    [Categories.CUSTOM]: <OrganicMark size={16} />
                  }}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          {/* Botão enviar */}
          <button
            onClick={handleSend}
            disabled={(!content.trim() && !attachment) || sending}
            style={{
              background: (content.trim() || attachment) && !sending ? accountColor : "transparent",
              border: "none",
              borderRadius: "var(--radius-sm)",
              width: 32,
              height: 32,
              cursor: (content.trim() || attachment) && !sending ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 150ms, opacity 150ms",
              opacity: (content.trim() || attachment) && !sending ? 1 : 0.3,
            }}
          >
            <SendIcon />
          </button>
        </div>
      </div>

      {sending && uploadProgress !== null && (
        <div style={{ marginTop: 8, height: 4, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", background: accountColor, width: "100%", transform: `scaleX(${uploadProgress / 100})`, transformOrigin: "left", transition: "transform 200ms ease-out" }} />
        </div>
      )}

      {/* Dica de atalho */}
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          marginTop: 4,
          paddingLeft: 4,
        }}
      >
        <kbd style={{ fontFamily: "inherit" }}>Enter</kbd> para enviar ·{" "}
        <kbd style={{ fontFamily: "inherit" }}>Shift+Enter</kbd> para nova linha
      </div>
    </div>
  );
}

const SendIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="white"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
