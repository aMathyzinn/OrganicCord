import { lazy, Suspense, useState, useRef, useCallback, useEffect, useMemo, type KeyboardEvent } from "react";
import type { DiscordMessage } from "@/types";
import { getDisplayName } from "@/lib/utils";
import { Reply, X, Plus, File as FileIcon, Smile, Mic, Trash2, Send } from "lucide-react";
import type { EmojiClickData } from "emoji-picker-react";
import * as Popover from "@radix-ui/react-popover";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { OrganicMark } from "@/components/ui/OrganicMark";
import { DiscordEmojiPicker } from "./DiscordEmojiPicker";

import { toast } from "@/components/ui/Toast";
import { listen } from "@tauri-apps/api/event";
import { selectAttachment } from "@/lib/tauri";
import { invoke } from "@tauri-apps/api/core";

const EmojiPickerPanel = lazy(() =>
  import("./EmojiPickerPanel").then((module) => ({ default: module.EmojiPickerPanel })),
);

export type AttachmentData = 
  | { type: "file", file: File }
  | { type: "handle", handle: string, name: string, size: number };

interface Props {
  channelId: string;
  replyingTo: DiscordMessage | null;
  onCancelReply: () => void;
  onSend: (content: string, attachment?: AttachmentData) => Promise<void>;
  accountColor?: string;
  externalAttachment?: AttachmentData | null;
  canAttach?: boolean;
}

// ─── Helpers de Emoji Customizado ─────────────────────────────────────────────

function parseCustomEmojiTag(str: string): { animated: boolean; name: string; id: string } | null {
  const match = str.trim().match(/^<(a)?:([^:>]+):(\d+)>$/);
  if (!match) return null;
  return {
    animated: !!match[1],
    name: match[2],
    id: match[3],
  };
}

function getEmojiImgHTML(animated: boolean, name: string, id: string): string {
  const fullCode = `<${animated ? "a" : ""}:${name}:${id}>`;
  const url = `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}?size=48`;
  return `<img src="${url}" data-emoji="${fullCode}" alt=":${name}:" title=":${name}:" style="width: 22px; height: 22px; vertical-align: middle; margin: 0 2px; display: inline-block; pointer-events: none; user-select: all;" />`;
}

function getRawContentFromEditable(el: HTMLElement): string {
  let result = "";
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.nodeValue || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (element.tagName === "IMG" && element.getAttribute("data-emoji")) {
        result += element.getAttribute("data-emoji");
      } else if (element.tagName === "BR") {
        result += "\n";
      } else if (element.tagName === "DIV" || element.tagName === "P") {
        result += "\n" + getRawContentFromEditable(element);
      } else {
        result += getRawContentFromEditable(element);
      }
    }
  });
  return result;
}

export function MessageInput({
  channelId,
  replyingTo,
  onCancelReply,
  onSend,
  accountColor = "var(--brand-500)",
  externalAttachment,
  canAttach = true,
}: Props) {
  const [isEmpty, setIsEmpty] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [attachment, setAttachment] = useState<AttachmentData | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (externalAttachment) {
      setAttachment(externalAttachment);
    }
  }, [externalAttachment]);

  const { activeAccountId } = useNavigationStore();
  const guildEmojisRaw = useDiscordStore((s) => activeAccountId ? s.cache.guildEmojis[activeAccountId] : null);

  const customEmojis = useMemo(() => {
    if (!guildEmojisRaw) return [];
    return Object.values(guildEmojisRaw).flat().map(e => ({
      id: e.id || Math.random().toString(),
      names: e.name ? [e.name] : [],
      imgUrl: `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "webp"}?size=48`
    }));
  }, [guildEmojisRaw]);

  useEffect(() => {
    const unlisten = listen<{ progress: number }>("upload-progress", (event) => {
      setUploadProgress(event.payload.progress);
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>([10, 15, 20, 10, 30, 15, 10]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const cleanupAudioResources = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      cleanupAudioResources();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      let mimeType = "audio/ogg;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm;codecs=opus";
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "";
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      // Start timer
      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      // Web Audio level visualizer
      try {
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevels = () => {
          if (!mediaStreamRef.current || audioCtx.state === "closed") return;
          analyser.getByteFrequencyData(dataArray);
          const sliced = Array.from(dataArray.slice(0, 12)).map((v) => Math.max(10, Math.floor((v / 255) * 28)));
          setAudioLevels(sliced);
          animFrameRef.current = requestAnimationFrame(updateLevels);
        };
        updateLevels();
      } catch (err) {
        console.warn("[audio] Visualizer non-critical error:", err);
      }
    } catch (err) {
      console.error("[audio] Error accessing microphone:", err);
      toast.error("Não foi possível acessar o microfone. Verifique a privacidade de áudio do Windows.");
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    cleanupAudioResources();
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive" || !activeAccountId) return;

    setSending(true);

    const recorder = mediaRecorderRef.current;
    const finalMime = recorder.mimeType || "audio/ogg";

    const audioBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: finalMime });
        resolve(blob);
      };
      recorder.stop();
    });

    cleanupAudioResources();
    setIsRecording(false);

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioUint8 = new Uint8Array(arrayBuffer);

      let durationSecs = recordingSeconds;
      let base64Waveform = "";

      let decodeCtx: AudioContext | null = null;
      try {
        decodeCtx = new AudioContext();
        const decodedBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
        durationSecs = decodedBuffer.duration;
        const pcmData = decodedBuffer.getChannelData(0);

        const sampleCount = 256;
        const step = Math.max(1, Math.floor(pcmData.length / sampleCount));
        const waveformBytes = new Uint8Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
          let maxVal = 0;
          const start = i * step;
          const end = Math.min(pcmData.length, (i + 1) * step);
          for (let j = start; j < end; j++) {
            const abs = Math.abs(pcmData[j] || 0);
            if (abs > maxVal) maxVal = abs;
          }
          waveformBytes[i] = Math.min(255, Math.floor(maxVal * 255));
        }

        let binaryStr = "";
        for (let i = 0; i < waveformBytes.length; i++) {
          binaryStr += String.fromCharCode(waveformBytes[i]);
        }
        base64Waveform = btoa(binaryStr);
      } catch (err) {
        console.warn("[audio] PCM waveform generation fallback:", err);
      } finally {
        if (decodeCtx && decodeCtx.state !== "closed") {
          decodeCtx.close().catch(() => {});
        }
      }

      await useDiscordStore
        .getState()
        .sendVoiceMessage(activeAccountId, channelId, audioUint8, durationSecs, base64Waveform, replyingTo?.id);

      if (replyingTo) onCancelReply();
    } catch (err) {
      console.error("[audio] Error sending voice message:", err);
    } finally {
      setSending(false);
      setRecordingSeconds(0);
      audioChunksRef.current = [];
    }
  };

  const updateStateFromEditable = useCallback(() => {
    if (!editorRef.current) return;
    const raw = getRawContentFromEditable(editorRef.current);
    setIsEmpty(raw.trim().length === 0);
  }, []);

  const insertEmojiString = useCallback((emojiStr: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const parsed = parseCustomEmojiTag(emojiStr);
    if (parsed) {
      const html = getEmojiImgHTML(parsed.animated, parsed.name, parsed.id);
      document.execCommand("insertHTML", false, html + "&nbsp;");
    } else {
      document.execCommand("insertText", false, emojiStr + " ");
    }
    updateStateFromEditable();
  }, [updateStateFromEditable]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    let toInsert = emojiData.emoji;
    if (emojiData.isCustom) {
      const isAnimated = emojiData.imageUrl.includes(".gif");
      const emojiName = emojiData.names?.[0] || "emoji";
      toInsert = `<${isAnimated ? "a" : ""}:${emojiName}:${emojiData.unified}>`;
    }
    insertEmojiString(toInsert);
    setPickerOpen(false);
  };

  const handleSend = useCallback(async () => {
    if (!editorRef.current) return;
    const rawContent = getRawContentFromEditable(editorRef.current).trim();
    if ((!rawContent && !attachment) || sending) return;

    setSending(true);
    try {
      await onSend(rawContent, attachment || undefined);
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
        setIsEmpty(true);
      }
      setAttachment(null);
    } catch {
      // Erro já tratado no discordStore (mensagem do Clyde) — não limpa o campo
    } finally {
      setSending(false);
      setUploadProgress(null);
      setTimeout(() => {
        editorRef.current?.focus();
      }, 0);
    }
  }, [attachment, sending, onSend]);

  const lastTypingRef = useRef<number>(0);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const rawContent = getRawContentFromEditable(editorRef.current);
    setIsEmpty(rawContent.trim().length === 0);

    // Auto-converte códigos de emoji recém-digitados (ex: `<:name:id>`) em imagens inline
    const html = editorRef.current.innerHTML;
    const convertedHTML = html.replace(/<(a)?:([^:>]+):(\d+)>/g, (_, animated, name, id) => {
      return getEmojiImgHTML(!!animated, name, id);
    });
    if (convertedHTML !== html) {
      editorRef.current.innerHTML = convertedHTML;
      // Posiciona o cursor no final
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    if (rawContent.length > 0 && activeAccountId) {
      const now = Date.now();
      if (now - lastTypingRef.current > 5000) {
        lastTypingRef.current = now;
        invoke("trigger_typing", { accountId: activeAccountId, channelId }).catch(console.error);
      }
    }
  }, [channelId, activeAccountId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
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

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      if (file.size > 25 * 1024 * 1024) {
        toast.warning("Arquivos acima de 25 MB não podem ser enviados pelo OrganicCord.");
        e.preventDefault();
        return;
      }
      setAttachment({ type: "file", file });
      e.preventDefault();
      return;
    }

    // Cola texto sem formatação HTML estranha e auto-converte emojis
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const convertedHTML = text.replace(/<(a)?:([^:>]+):(\d+)>/g, (_, animated, name, id) => {
      return getEmojiImgHTML(!!animated, name, id);
    });
    document.execCommand("insertHTML", false, convertedHTML);
    updateStateFromEditable();
  }, [updateStateFromEditable]);

  const handleAttachClick = async () => {
    if (!canAttach) {
      toast.error("Você não tem permissão para anexar arquivos neste canal.");
      return;
    }
    try {
      const selected = await selectAttachment();
      if (selected) {
        setAttachment({ type: "handle", ...selected });
      }
    } catch (err) {
      toast.error(String(err).replace(/^Error:\s*/, ""));
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
              {(attachment.type === "file" ? attachment.file.size : attachment.size) / 1024 / 1024 < 0.01
                ? "< 0.01"
                : ((attachment.type === "file" ? attachment.file.size : attachment.size) / 1024 / 1024).toFixed(2)} MB
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
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          border: "1px solid transparent",
          transition: "border-color 150ms",
          minHeight: 44,
        }}
        onFocusCapture={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor = accountColor)
        }
        onBlurCapture={(e) =>
          ((e.currentTarget as HTMLDivElement).style.borderColor = "transparent")
        }
      >
        {isRecording ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 44,
              padding: "0 4px",
              userSelect: "none",
            }}
          >
            {/* Recording indicator & timer */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "var(--status-danger)",
                  boxShadow: "0 0 8px var(--status-danger)",
                }}
              />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--status-danger)",
                  fontFamily: "monospace",
                }}
              >
                {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, "0")}
              </span>

              {/* Live Waveform Audio Levels */}
              <div style={{ display: "flex", alignItems: "center", gap: 3, height: 24, marginLeft: 8 }}>
                {audioLevels.map((lvl, i) => (
                  <div
                    key={i}
                    style={{
                      width: 3,
                      height: `${lvl}px`,
                      maxHeight: 24,
                      background: "var(--status-danger)",
                      borderRadius: 2,
                      transition: "height 50ms ease",
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Cancel & Send Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={cancelRecording}
                title="Cancelar áudio"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: 6,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                className="hover-color-danger"
              >
                <Trash2 size={20} />
              </button>

              <button
                onClick={stopAndSendRecording}
                disabled={sending}
                title="Enviar mensagem de voz"
                style={{
                  background: "var(--brand-500)",
                  border: "none",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                className="hover-opacity"
              >
                <Send size={16} style={{ marginLeft: 2 }} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={handleAttachClick}
              title={canAttach ? "Enviar um arquivo" : "Sem permissão para anexar arquivos neste canal"}
              style={{
                background: "var(--bg-tertiary)",
                border: "none",
                borderRadius: "50%",
                width: 32,
                height: 32,
                cursor: canAttach ? "pointer" : "not-allowed",
                opacity: canAttach ? 1 : 0.4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: "var(--text-normal)",
                transition: "all 150ms",
                marginTop: 6,
                marginBottom: 6,
              }}
              className={canAttach ? "hover-bg-modifier-selected" : undefined}
            >
              <Plus size={16} />
            </button>

            {/* ContentEditable Visual Emoji Input */}
            <div style={{ flex: 1, position: "relative", minHeight: 44, display: "flex", alignItems: "center" }}>
              {isEmpty && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 12,
                    color: "var(--text-muted)",
                    fontSize: 15,
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                >
                  Enviar mensagem...
                </div>
              )}
              <div
                ref={editorRef}
                contentEditable={!sending}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                style={{
                  width: "100%",
                  minHeight: 24,
                  maxHeight: 200,
                  overflowY: "auto",
                  color: "var(--text-normal)",
                  fontSize: 15,
                  lineHeight: "20px",
                  padding: "12px 0",
                  outline: "none",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, marginBottom: 6 }}>
              {/* Botão de Gravar Mensagem de Voz (Mic) */}
              <button
                onClick={startRecording}
                title="Gravar mensagem de voz"
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
                <Mic size={20} />
              </button>

              {activeAccountId ? (
                <DiscordEmojiPicker 
                  accountId={activeAccountId} 
                  onSelect={(emojiStr) => insertEmojiString(emojiStr)} 
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
                    <Suspense fallback={<div style={{ width: 350, height: 450 }} />}>
                      <EmojiPickerPanel
                        onEmojiClick={handleEmojiClick}
                        lazyLoadEmojis={true}
                        searchPlaceHolder="Pesquisar emoji..."
                        customEmojis={customEmojis}
                        customCategoryIcon={<OrganicMark size={16} />}
                      />
                    </Suspense>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>

              {/* Botão enviar */}
              <button
                onClick={handleSend}
                disabled={isEmpty && !attachment || sending}
                style={{
                  background: (!isEmpty || attachment) && !sending ? accountColor : "transparent",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  width: 32,
                  height: 32,
                  cursor: (!isEmpty || attachment) && !sending ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "background 150ms, opacity 150ms",
                  opacity: (!isEmpty || attachment) && !sending ? 1 : 0.3,
                }}
              >
                <SendIcon />
              </button>
            </div>
          </>
        )}
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
