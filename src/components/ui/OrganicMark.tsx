import logoUrl from "../../../src-tauri/icons/128x128@2x.png";

interface Props {
  size?: number;
  color?: string; // Retained for prop compatibility
  className?: string;
  style?: React.CSSProperties;
}

export function OrganicMark({ size = 24, className, style }: Props) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain", display: "block", ...style }}
      alt="OrganicCord Logo"
    />
  );
}
