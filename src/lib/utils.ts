import { clsx, type ClassValue } from "clsx";
import type { DiscordUser, StoredAccount } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

function getValidDiscordSize(size: number): number {
  const validSizes = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
  return validSizes.find((s) => s >= size) || 4096;
}

export function getAvatarUrl(
  userId: string,
  avatarHash: string | null,
  size = 80
): string {
  if (!avatarHash) {
    const defaultIndex = Number(BigInt(userId) % 5n);
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
  }
  const ext = avatarHash.startsWith("a_") ? "gif" : "webp";
  const validSize = getValidDiscordSize(size);
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=${validSize}`;
}

export function getGuildIconUrl(
  guildId: string,
  iconHash: string | null,
  size = 96
): string | null {
  if (!iconHash) return null;
  const ext = iconHash.startsWith("a_") ? "gif" : "webp";
  const validSize = getValidDiscordSize(size);
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=${validSize}`;
}

export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (days === 1) {
    return "Ontem às " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: "long" });
  } else {
    return date.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
  }
}

export function formatMessageDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return "Hoje";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "Ontem";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function getDisplayName(user: DiscordUser | StoredAccount): string {
  if ("global_name" in user && user.global_name) return user.global_name;
  return user.username;
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function truncate(str: string, length: number): string {
  return str.length > length ? str.slice(0, length) + "…" : str;
}
