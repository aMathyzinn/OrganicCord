import { AppSettings } from "@/stores/settingsStore";

export interface ColorTheme {
  id: string;
  name: string;
  gradient: string; // CSS background para preview do swatch no estilo Nitro
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    bgAccent: string;
    bgFloat: string;
    textNormal: string;
    textMuted: string;
    brand500: string;
    borderSubtle: string;
  };
}

export const STANDARD_THEMES: Record<string, ColorTheme> = {
  dark: {
    id: "dark",
    name: "Escuro",
    gradient: "linear-gradient(135deg, #313338 0%, #1e1f22 100%)",
    colors: {
      bgPrimary: "#313338",
      bgSecondary: "#2b2d31",
      bgTertiary: "#1e1f22",
      bgAccent: "#404249",
      bgFloat: "#111214",
      textNormal: "#dbdee1",
      textMuted: "#949ba4",
      brand500: "#5865f2",
      borderSubtle: "rgba(255, 255, 255, 0.06)",
    },
  },
  light: {
    id: "light",
    name: "Claro",
    gradient: "linear-gradient(135deg, #ffffff 0%, #e3e5e8 100%)",
    colors: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f2f3f5",
      bgTertiary: "#e3e5e8",
      bgAccent: "#e0e2e5",
      bgFloat: "#ffffff",
      textNormal: "#313338",
      textMuted: "#5c5e66",
      brand500: "#5865f2",
      borderSubtle: "rgba(0, 0, 0, 0.08)",
    },
  },
  midnight: {
    id: "midnight",
    name: "Meia-noite (AMOLED)",
    gradient: "linear-gradient(135deg, #000000 0%, #111111 100%)",
    colors: {
      bgPrimary: "#000000",
      bgSecondary: "#0a0a0a",
      bgTertiary: "#000000",
      bgAccent: "#161616",
      bgFloat: "#111111",
      textNormal: "#f6f6f7",
      textMuted: "#80848e",
      brand500: "#5865f2",
      borderSubtle: "rgba(255, 255, 255, 0.1)",
    },
  },
};

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "mint",
    name: "Verde Menta",
    gradient: "linear-gradient(135deg, #a8e6cf 0%, #152e25 100%)",
    colors: {
      bgPrimary: "#152e25",
      bgSecondary: "#1f4236",
      bgTertiary: "#0f221b",
      bgAccent: "#2d5c4b",
      bgFloat: "#091712",
      textNormal: "#e2f5ec",
      textMuted: "#7fb39b",
      brand500: "#3ba55c",
      borderSubtle: "rgba(168, 230, 207, 0.12)",
    },
  },
  {
    id: "pastel_sunset",
    name: "Pôr do Sol Pastel",
    gradient: "linear-gradient(135deg, #ffd3b6 0%, #ffaaa5 100%)",
    colors: {
      bgPrimary: "#2d222b",
      bgSecondary: "#3b2c39",
      bgTertiary: "#211820",
      bgAccent: "#523c4f",
      bgFloat: "#171016",
      textNormal: "#fcebf8",
      textMuted: "#b58dae",
      brand500: "#f47fff",
      borderSubtle: "rgba(255, 211, 182, 0.12)",
    },
  },
  {
    id: "ice_lavender",
    name: "Lavanda Glacial",
    gradient: "linear-gradient(135deg, #b4befe 0%, #cba6f7 100%)",
    colors: {
      bgPrimary: "#24273a",
      bgSecondary: "#2e324a",
      bgTertiary: "#1b1d2c",
      bgAccent: "#3f4463",
      bgFloat: "#13141f",
      textNormal: "#cad3f5",
      textMuted: "#8087a2",
      brand500: "#b4befe",
      borderSubtle: "rgba(180, 190, 254, 0.12)",
    },
  },
  {
    id: "aurora",
    name: "Aurora Boreal",
    gradient: "linear-gradient(135deg, #00f5d4 0%, #7b2cbf 100%)",
    colors: {
      bgPrimary: "#182c2b",
      bgSecondary: "#213c3a",
      bgTertiary: "#11201f",
      bgAccent: "#305956",
      bgFloat: "#0b1514",
      textNormal: "#e0fbf7",
      textMuted: "#72b0a7",
      brand500: "#00f5d4",
      borderSubtle: "rgba(0, 245, 212, 0.12)",
    },
  },
  {
    id: "neon_pink",
    name: "Rosa Neon",
    gradient: "linear-gradient(135deg, #ff007f 0%, #7928ca 100%)",
    colors: {
      bgPrimary: "#2e1a2b",
      bgSecondary: "#3d233a",
      bgTertiary: "#21121f",
      bgAccent: "#563152",
      bgFloat: "#160b15",
      textNormal: "#fce9f8",
      textMuted: "#be83b5",
      brand500: "#ff007f",
      borderSubtle: "rgba(255, 0, 127, 0.12)",
    },
  },
  {
    id: "blueberry_cream",
    name: "Mirtilo & Creme",
    gradient: "linear-gradient(135deg, #778da9 0%, #e0e1dd 100%)",
    colors: {
      bgPrimary: "#1b263b",
      bgSecondary: "#263654",
      bgTertiary: "#121a29",
      bgAccent: "#344970",
      bgFloat: "#0b101a",
      textNormal: "#e0e1dd",
      textMuted: "#778da9",
      brand500: "#415a77",
      borderSubtle: "rgba(119, 141, 169, 0.12)",
    },
  },
  {
    id: "crimson_dusk",
    name: "Crepúsculo Carmesim",
    gradient: "linear-gradient(135deg, #990000 0%, #1a0000 100%)",
    colors: {
      bgPrimary: "#2b1414",
      bgSecondary: "#3a1b1b",
      bgTertiary: "#1e0d0d",
      bgAccent: "#542727",
      bgFloat: "#140707",
      textNormal: "#fce8e8",
      textMuted: "#b87c7c",
      brand500: "#ff3b30",
      borderSubtle: "rgba(255, 59, 48, 0.12)",
    },
  },
  {
    id: "midnight_velvet",
    name: "Veludo da Meia-Noite",
    gradient: "linear-gradient(135deg, #4752c4 0%, #0f111e 100%)",
    colors: {
      bgPrimary: "#131524",
      bgSecondary: "#1c1f36",
      bgTertiary: "#0c0d17",
      bgAccent: "#292e4e",
      bgFloat: "#07080f",
      textNormal: "#e2e5fc",
      textMuted: "#7983c2",
      brand500: "#5865f2",
      borderSubtle: "rgba(88, 101, 242, 0.12)",
    },
  },
  {
    id: "emerald_forest",
    name: "Floresta Encantada",
    gradient: "linear-gradient(135deg, #2ecc71 0%, #11241a 100%)",
    colors: {
      bgPrimary: "#12241b",
      bgSecondary: "#1a3327",
      bgTertiary: "#0c1913",
      bgAccent: "#274d3b",
      bgFloat: "#07100b",
      textNormal: "#e0faeb",
      textMuted: "#70b38d",
      brand500: "#2ecc71",
      borderSubtle: "rgba(46, 204, 113, 0.12)",
    },
  },
  {
    id: "solar_amber",
    name: "Dourado Solar",
    gradient: "linear-gradient(135deg, #f39c12 0%, #d35400 100%)",
    colors: {
      bgPrimary: "#2e2113",
      bgSecondary: "#3d2c19",
      bgTertiary: "#21170d",
      bgAccent: "#563e23",
      bgFloat: "#160f08",
      textNormal: "#fcf0df",
      textMuted: "#bfa380",
      brand500: "#f39c12",
      borderSubtle: "rgba(243, 156, 18, 0.12)",
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Neon",
    gradient: "linear-gradient(135deg, #00f0ff 0%, #ff0055 100%)",
    colors: {
      bgPrimary: "#141829",
      bgSecondary: "#1c223b",
      bgTertiary: "#0c0e1a",
      bgAccent: "#2d375e",
      bgFloat: "#07080f",
      textNormal: "#e0f7ff",
      textMuted: "#6fa4c4",
      brand500: "#00f0ff",
      borderSubtle: "rgba(0, 240, 255, 0.15)",
    },
  },
  {
    id: "deep_ocean",
    name: "Oceano Profundo",
    gradient: "linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%)",
    colors: {
      bgPrimary: "#0f2027",
      bgSecondary: "#203a43",
      bgTertiary: "#081419",
      bgAccent: "#2c5364",
      bgFloat: "#040a0d",
      textNormal: "#e0f6fc",
      textMuted: "#6ba8bd",
      brand500: "#00d2ff",
      borderSubtle: "rgba(0, 210, 255, 0.12)",
    },
  },
  {
    id: "retro_synthwave",
    name: "Vaporwave Retro",
    gradient: "linear-gradient(135deg, #ff71ce 0%, #01cdfe 100%)",
    colors: {
      bgPrimary: "#241734",
      bgSecondary: "#322047",
      bgTertiary: "#180f24",
      bgAccent: "#4a3069",
      bgFloat: "#100918",
      textNormal: "#fde8fc",
      textMuted: "#b483c7",
      brand500: "#ff71ce",
      borderSubtle: "rgba(255, 113, 206, 0.12)",
    },
  },
  {
    id: "purple_orchid",
    name: "Orquídea Roxa",
    gradient: "linear-gradient(135deg, #9b51e0 0%, #341259 100%)",
    colors: {
      bgPrimary: "#25182e",
      bgSecondary: "#33213e",
      bgTertiary: "#1a1121",
      bgAccent: "#493059",
      bgFloat: "#100a14",
      textNormal: "#f5e8fc",
      textMuted: "#ab85c7",
      brand500: "#9b51e0",
      borderSubtle: "rgba(155, 81, 224, 0.12)",
    },
  },
  {
    id: "cosmic_nebula",
    name: "Nebulosa Cósmica",
    gradient: "linear-gradient(135deg, #6366f1 0%, #ec4899 100%)",
    colors: {
      bgPrimary: "#1a162b",
      bgSecondary: "#251f3d",
      bgTertiary: "#120e20",
      bgAccent: "#372e59",
      bgFloat: "#0a0812",
      textNormal: "#eee8fc",
      textMuted: "#9683c7",
      brand500: "#a855f7",
      borderSubtle: "rgba(168, 85, 247, 0.12)",
    },
  },
  {
    id: "matcha_tea",
    name: "Chá Matcha",
    gradient: "linear-gradient(135deg, #84cc16 0%, #163811 100%)",
    colors: {
      bgPrimary: "#22291d",
      bgSecondary: "#2d3827",
      bgTertiary: "#181d14",
      bgAccent: "#425239",
      bgFloat: "#0e120b",
      textNormal: "#edfcd9",
      textMuted: "#95b870",
      brand500: "#84cc16",
      borderSubtle: "rgba(132, 204, 22, 0.12)",
    },
  },
];

export interface AppIconPreset {
  id: string;
  name: string;
  bgGradient: string;
  accentColor: string;
}

export const APP_ICONS: AppIconPreset[] = [
  { id: "default", name: "Padrão Organic", bgGradient: "#5865f2", accentColor: "#ffffff" },
  { id: "dark_mono", name: "Escuro Minimalista", bgGradient: "#18191c", accentColor: "#ffffff" },
  { id: "action_manga", name: "Mangá Action", bgGradient: "radial-gradient(circle, #ffffff 10%, #000000 100%)", accentColor: "#000000" },
  { id: "stealth", name: "Furtivo Matte", bgGradient: "#2b2d31", accentColor: "#4e5058" },
  { id: "clean_white", name: "Branco Neve", bgGradient: "#ffffff", accentColor: "#5865f2" },
  { id: "hologram", name: "Holograma Pastel", bgGradient: "linear-gradient(135deg, #a8c0ff 0%, #3f2b96 100%)", accentColor: "#ffffff" },
  { id: "pirate_wood", name: "Madeira Pirata", bgGradient: "linear-gradient(135deg, #b76e79 0%, #4a2c11 100%)", accentColor: "#ffe5b4" },
  { id: "camo", name: "Camuflagem Militar", bgGradient: "linear-gradient(135deg, #4b5320 0%, #2b2e18 100%)", accentColor: "#a3b18a" },
  { id: "synthwave", name: "Synthwave 80s", bgGradient: "linear-gradient(180deg, #ff71ce 0%, #241734 100%)", accentColor: "#01cdfe" },
  { id: "cosmic", name: "Galáxia Cósmica", bgGradient: "radial-gradient(circle, #3a1c71 0%, #0f0c20 100%)", accentColor: "#d76d77" },
  { id: "cyberpunk", name: "Cyberpunk Neon", bgGradient: "linear-gradient(135deg, #00f0ff 0%, #7928ca 100%)", accentColor: "#ffffff" },
  { id: "sakura", name: "Flor de Sakura", bgGradient: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)", accentColor: "#ffffff" },
  { id: "bubblegum", name: "Doce Bubblegum", bgGradient: "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)", accentColor: "#5865f2" },
  { id: "fire_dragon", name: "Dragão de Fogo", bgGradient: "linear-gradient(135deg, #f12711 0%, #f5af19 100%)", accentColor: "#ffffff" },
  { id: "gamer_pro", name: "Gamer Cyber", bgGradient: "linear-gradient(135deg, #10002b 0%, #5a189a 100%)", accentColor: "#00f5d4" },
  { id: "circuit", name: "Matriz Circuito", bgGradient: "linear-gradient(135deg, #051923 0%, #003554 100%)", accentColor: "#00a6fb" },
  { id: "hypnotic", name: "Espiral Hipnótica", bgGradient: "repeating-radial-gradient(circle, #000 0, #000 5px, #fff 5px, #fff 10px)", accentColor: "#5865f2" },
  { id: "starry_night", name: "Noite Estrelada", bgGradient: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)", accentColor: "#ffd700" },
  { id: "vibrant_gradient", name: "Gradiente Neon", bgGradient: "linear-gradient(135deg, #ff0844 0%, #ffb199 100%)", accentColor: "#ffffff" },
  { id: "dark_rainbow", name: "Orgulho Escuro", bgGradient: "linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)", accentColor: "#ffffff" },
  { id: "light_rainbow", name: "Orgulho Claro", bgGradient: "linear-gradient(135deg, #ffb3ba, #ffdfba, #ffffba, #baffc9, #bae1ff)", accentColor: "#313338" },
];

export function applyTheme(settings: AppSettings) {
  let themeConfig: ColorTheme | undefined;

  if (settings.theme === "system") {
    const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    themeConfig = isDark ? STANDARD_THEMES.midnight : STANDARD_THEMES.light;
  } else if (STANDARD_THEMES[settings.theme]) {
    themeConfig = STANDARD_THEMES[settings.theme];
  } else {
    themeConfig = COLOR_THEMES.find((t) => t.id === settings.theme);
  }

  if (!themeConfig) {
    themeConfig = STANDARD_THEMES.midnight;
  }

  const root = document.documentElement.style;

  if (settings.theme === "custom" && settings.customThemeColors) {
    const custom = settings.customThemeColors;
    root.setProperty("--bg-primary", custom.bgPrimary);
    root.setProperty("--bg-secondary", custom.bgSecondary);
    root.setProperty("--bg-tertiary", custom.bgTertiary);
    root.setProperty("--bg-accent", custom.bgSecondary);
    root.setProperty("--bg-float", custom.bgTertiary);
    root.setProperty("--bg-floating", custom.bgTertiary);
    root.setProperty("--text-normal", custom.textColor);
    root.setProperty("--brand-500", custom.brandColor);
  } else {
    root.setProperty("--bg-primary", themeConfig.colors.bgPrimary);
    root.setProperty("--bg-secondary", themeConfig.colors.bgSecondary);
    root.setProperty("--bg-tertiary", themeConfig.colors.bgTertiary);
    root.setProperty("--bg-accent", themeConfig.colors.bgAccent);
    root.setProperty("--bg-float", themeConfig.colors.bgFloat);
    root.setProperty("--bg-floating", themeConfig.colors.bgFloat);
    root.setProperty("--text-normal", themeConfig.colors.textNormal);
    root.setProperty("--text-muted", themeConfig.colors.textMuted);
    root.setProperty("--brand-500", themeConfig.colors.brand500);
    root.setProperty("--border-subtle", themeConfig.colors.borderSubtle);
  }

  // Font size & message spacing
  root.setProperty("--chat-font-size", `${settings.fontSize || 15}px`);
  root.setProperty("--message-spacing", `${settings.messageSpacing || 16}px`);
}
