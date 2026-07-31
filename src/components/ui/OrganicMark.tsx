import logoUrl from "../../../src-tauri/icons/128x128@2x.png";
import { useSettingsStore } from "@/stores/settingsStore";
import { APP_ICONS } from "@/lib/themeManager";

interface Props {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  overrideIconId?: string;
  withBg?: boolean;
}

export function OrganicMark({ size = 24, className, style, overrideIconId, withBg = false }: Props) {
  const activeIconId = overrideIconId || useSettingsStore((s) => s.settings.appIcon) || "dark_mono";
  const iconPreset = APP_ICONS.find((i) => i.id === activeIconId) || APP_ICONS[1] || APP_ICONS[0];

  const filterStyle =
    activeIconId === "default"
      ? undefined
      : iconPreset.accentColor === "#000000"
      ? "brightness(0)"
      : "brightness(1.1) drop-shadow(0 1px 2px rgba(0,0,0,0.4))";

  if (withBg && activeIconId !== "default") {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          background: iconPreset.bgGradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          overflow: "hidden",
          position: "relative",
          flexShrink: 0,
          ...style,
        }}
      >
        <img
          src={logoUrl}
          width={size * 0.65}
          height={size * 0.65}
          style={{ objectFit: "contain", filter: filterStyle }}
          alt={iconPreset.name}
        />
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      className={className}
      style={{
        objectFit: "contain",
        display: "block",
        filter: filterStyle,
        ...style,
      }}
      alt={iconPreset.name || "OrganicCord Logo"}
    />
  );
}
