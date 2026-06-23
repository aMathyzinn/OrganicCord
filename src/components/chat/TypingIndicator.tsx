import React, { useEffect, useState } from "react";
import { useDiscordStore } from "@/stores/discordStore";
import { useAccountStore } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";

interface Props {
  channelId: string;
}

export function TypingIndicator({ channelId }: Props) {
  const typingUsersRaw = useDiscordStore((s) => s.cache.typingUsers[channelId] || []);
  const accountId = useNavigationStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const [triggerReRender, setTrigger] = useState(0);

  useEffect(() => {
    // Re-render periodically to drop expired users locally
    const interval = setInterval(() => {
      setTrigger((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const now = Date.now();
  // Filter out expired users (10 seconds) and our own user
  const typingUsers = typingUsersRaw.filter((u) => {
    const isMe = accounts.some(a => a.user_id === u.userId);
    return !isMe && (now - u.timestamp < 10000);
  });

  if (typingUsers.length === 0) return null;

  // Formatar o texto
  let text = "";
  if (typingUsers.length === 1) {
    const u = typingUsers[0];
    const name = u.member?.nick || u.member?.user?.global_name || u.member?.user?.username || "Alguém";
    text = `${name} está digitando...`;
  } else if (typingUsers.length === 2) {
    const name1 = typingUsers[0].member?.nick || typingUsers[0].member?.user?.global_name || typingUsers[0].member?.user?.username || "Alguém";
    const name2 = typingUsers[1].member?.nick || typingUsers[1].member?.user?.global_name || typingUsers[1].member?.user?.username || "Outra pessoa";
    text = `${name1} e ${name2} estão digitando...`;
  } else if (typingUsers.length === 3) {
    const name1 = typingUsers[0].member?.nick || typingUsers[0].member?.user?.global_name || typingUsers[0].member?.user?.username || "Alguém";
    const name2 = typingUsers[1].member?.nick || typingUsers[1].member?.user?.global_name || typingUsers[1].member?.user?.username || "Outra pessoa";
    const name3 = typingUsers[2].member?.nick || typingUsers[2].member?.user?.global_name || typingUsers[2].member?.user?.username || "Outra pessoa";
    text = `${name1}, ${name2} e ${name3} estão digitando...`;
  } else {
    text = "Várias pessoas estão digitando...";
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 16px",
      height: 24,
      zIndex: 10
    }}>
      <div style={{ display: "flex", gap: 3, alignItems: "center", height: 24, paddingLeft: 4 }}>
        <div className="typing-dot" style={{ animationDelay: "0s" }} />
        <div className="typing-dot" style={{ animationDelay: "0.2s" }} />
        <div className="typing-dot" style={{ animationDelay: "0.4s" }} />
      </div>
      <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
        {text}
      </span>

      <style>{`
        @keyframes typingBounce {
          0%, 100% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.2); opacity: 1; }
        }
        .typing-dot {
          width: 5px;
          height: 5px;
          background-color: var(--text-muted);
          border-radius: 50%;
          animation: typingBounce 1.4s infinite ease-in-out both;
        }
      `}</style>
    </div>
  );
}
