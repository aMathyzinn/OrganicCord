import { useState } from "react";
import { getAvatarUrl, getInitials } from "@/lib/utils";

interface AvatarProps {
  userId: string;
  avatarHash: string | null;
  avatarDecoration?: { asset: string; sku_id?: string } | null;
  username: string;
  size?: number;
  color?: string;
  showStatus?: boolean;
  status?: "online" | "idle" | "dnd" | "offline";
  style?: React.CSSProperties;
}

const STATUS_COLORS = {
  online: "var(--status-online)",
  idle: "var(--status-idle)",
  dnd: "var(--status-dnd)",
  offline: "var(--status-offline)",
};

export function Avatar({
  userId,
  avatarHash,
  avatarDecoration,
  username,
  size = 40,
  color = "var(--brand-500)",
  showStatus = false,
  status = "offline",
  style,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const url = getAvatarUrl(userId, avatarHash, size * 2);
  const initials = getInitials(username);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: showStatus || avatarDecoration ? "50%" : "var(--radius-md)",
        ...style,
      }}
    >
      {!imgError ? (
        <img
          src={url}
          alt={username}
          width={size}
          height={size}
          onError={(e) => {
            console.error("Erro ao carregar imagem do Avatar:", url);
            setImgError(true);
          }}
          style={{
            borderRadius: showStatus || avatarDecoration ? "50%" : "var(--radius-md)",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: showStatus || avatarDecoration ? "50%" : "var(--radius-md)",
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: size * 0.38,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "-0.5px",
          }}
        >
          {initials || "?"}
        </div>
      )}

      {showStatus && (
        <div
          style={{
            position: "absolute",
            bottom: size > 60 ? 2 : -2,
            right: size > 60 ? 2 : -2,
            width: Math.min(size * 0.35, 20),
            height: Math.min(size * 0.35, 20),
            borderRadius: "50%",
            background: STATUS_COLORS[status],
            border: "3px solid var(--bg-tertiary)",
            zIndex: 2,
          }}
        />
      )}

      {avatarDecoration && (typeof avatarDecoration === 'string' ? avatarDecoration : avatarDecoration.asset) && (
        <img
          src={`https://cdn.discordapp.com/avatar-decoration-presets/${typeof avatarDecoration === 'string' ? avatarDecoration : avatarDecoration.asset}.png?passthrough=true`}
          alt="Avatar Decoration"
          style={{
            position: "absolute",
            top: "-10%",
            left: "-10%",
            width: "120%",
            height: "120%",
            pointerEvents: "none",
            zIndex: 3,
          }}
        />
      )}
    </div>
  );
}
