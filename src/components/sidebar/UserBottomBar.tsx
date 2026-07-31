import React, { useState, useRef, useEffect } from "react";
import { useAccountStore, type PresenceStatus } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { fetchUserProfile, getSelfProfile } from "@/lib/tauri";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "@/components/ui/Tooltip";
import { getBannerUrl } from "@/lib/utils";
import { toast } from "@/components/ui/Toast";
import { 
  Mic, MicOff, Headphones, Settings, Pencil, 
  ChevronRight, Copy, Users, Zap, Check, Moon, Circle, MinusCircle, Film, Plus
} from "lucide-react";

const STATUS_CONFIG: Record<PresenceStatus, { label: string; color: string; icon: React.ReactNode }> = {
  online: { label: "Online", color: "var(--status-online)", icon: <Circle size={14} fill="var(--status-online)" color="var(--status-online)" /> },
  idle: { label: "Ausente", color: "var(--status-idle)", icon: <Moon size={14} fill="var(--status-idle)" color="var(--status-idle)" /> },
  dnd: { label: "Não perturbe", color: "var(--status-dnd)", icon: <MinusCircle size={14} fill="var(--status-dnd)" color="var(--status-dnd)" /> },
  invisible: { label: "Invisível", color: "var(--status-offline)", icon: <Circle size={14} color="var(--status-offline)" /> },
};

interface UserBottomBarProps {
  onAddAccount?: () => void;
}

export function UserBottomBar({ onAddAccount }: UserBottomBarProps) {
  const { accounts, presenceStatus, customStatus } = useAccountStore();
  const { activeAccountId, openSettings } = useNavigationStore();
  
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const currentAccount = accounts.find((a) => a.id === activeAccountId);

  // Close popover when clicking outside
  useEffect(() => {
    if (!isPopoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsPopoverOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [isPopoverOpen]);

  if (!currentAccount) return null;

  const currentPresence = presenceStatus[currentAccount.id] ?? "online";
  const userCustomStatus = customStatus[currentAccount.id];

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: 52,
        background: "var(--bg-tertiary)",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        boxSizing: "border-box",
        userSelect: "none",
        flexShrink: 0,
        zIndex: 50,
      }}
    >
      {/* Clickable User Pill (Opens Floating Popover) */}
      <div
        onClick={() => setIsPopoverOpen((prev) => !prev)}
        className="hover-bg-modifier"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 6px",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          flex: 1,
          minWidth: 0,
          marginRight: 4,
          transition: "background 100ms ease",
        }}
      >
        <Avatar
          userId={currentAccount.user_id}
          avatarHash={currentAccount.avatar}
          username={currentAccount.username}
          size={32}
          color={currentAccount.color}
          showStatus
          status={currentPresence === "invisible" ? "offline" : currentPresence}
        />

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span
            className="truncate"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-normal)",
              lineHeight: "16px",
            }}
          >
            {currentAccount.global_name ?? currentAccount.username}
          </span>
          <span
            className="truncate"
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: "14px",
            }}
          >
            {userCustomStatus?.text || STATUS_CONFIG[currentPresence]?.label || "Online"}
          </span>
        </div>
      </div>

      {/* Control Action Buttons (Mic, Deafen, Settings) */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
        {/* Mic Button */}
        <Tooltip content={isMuted ? "Desmutar microfone" : "Mutar microfone"} position="top">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted((prev) => !prev);
              toast.info(!isMuted ? "Microfone mutado" : "Microfone ativado");
            }}
            className="icon-btn"
            style={{
              color: isMuted ? "var(--status-danger)" : "var(--interactive-normal)",
              padding: 6,
              borderRadius: "var(--radius-sm)",
            }}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        </Tooltip>

        {/* Deafen Button */}
        <Tooltip content={isDeafened ? "Ativar áudio" : "Ensurdecer áudio"} position="top">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsDeafened((prev) => !prev);
              toast.info(!isDeafened ? "Áudio ensurdecido" : "Áudio ativado");
            }}
            className="icon-btn"
            style={{
              color: isDeafened ? "var(--status-danger)" : "var(--interactive-normal)",
              padding: 6,
              borderRadius: "var(--radius-sm)",
            }}
          >
            <Headphones size={18} style={{ opacity: isDeafened ? 1 : 0.85 }} />
          </button>
        </Tooltip>

        {/* Settings Button */}
        <Tooltip content="Configurações de Usuário" position="top">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openSettings();
            }}
            className="icon-btn"
            style={{
              color: "var(--interactive-normal)",
              padding: 6,
              borderRadius: "var(--radius-sm)",
            }}
          >
            <Settings size={18} />
          </button>
        </Tooltip>
      </div>

      {/* FLOATING USER PROFILE & STATUS POPOVER */}
      {isPopoverOpen && (
        <FloatingUserStatusPopover
          account={currentAccount}
          currentPresence={currentPresence}
          onClose={() => setIsPopoverOpen(false)}
          onAddAccount={onAddAccount}
        />
      )}
    </div>
  );
}

{/* ============================================================ */}
{/* FLOATING USER STATUS POPOVER COMPONENT                       */}
{/* ============================================================ */}
function FloatingUserStatusPopover({
  account,
  currentPresence,
  onClose,
  onAddAccount,
}: {
  account: any;
  currentPresence: PresenceStatus;
  onClose: () => void;
  onAddAccount?: () => void;
}) {
  const { setPresenceStatus, accounts, presenceStatus } = useAccountStore();
  const { activeAccountId, setActiveAccount, openSettings } = useNavigationStore();
  
  const [profileData, setProfileData] = useState<any>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<"none" | "status" | "accounts">("none");

  // Fetch user profile data on popover open
  useEffect(() => {
    fetchUserProfile(account.id, account.user_id)
      .then((data) => setProfileData(data))
      .catch(() => {
        getSelfProfile(account.id).then((userData) => setProfileData({ user: userData })).catch(console.error);
      });
  }, [account]);

  const premiumType = profileData?.user?.premium_type ?? profileData?.premium_type ?? account.premium_type;
  const hasNitro = premiumType === 2 || premiumType === 1 || !!profileData?.premium_since;
  const bannerHash = profileData?.user_profile?.banner || profileData?.user?.banner || account.banner;
  const accentColorNum = profileData?.user_profile?.accent_color ?? profileData?.user?.accent_color ?? account.accent_color;
  const accentColorHex = accentColorNum ? `#${accentColorNum.toString(16).padStart(6, '0')}` : (account.color || "#5865f2");
  const rawBannerUrl = getBannerUrl(account.user_id, bannerHash, 600);
  const bannerUrl = hasNitro ? rawBannerUrl : null;
  const bio = profileData?.user_profile?.bio || profileData?.user?.bio || account.bio || "";

  const handleCopyUserId = () => {
    navigator.clipboard.writeText(account.user_id);
    toast.success("ID do usuário copiado para a área de transferência!");
    onClose();
  };

  const handleOpenEditProfile = () => {
    onClose();
    openSettings();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        bottom: 60,
        left: 8,
        width: 310,
        maxHeight: "82vh",
        overflowY: "auto",
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
        border: "1px solid var(--border-subtle)",
        zIndex: 9999,
        animation: "slideUp 150ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Top Banner & Mini Profile Header */}
      <div style={{ position: "relative" }}>
        {/* Banner */}
        <div
          style={{
            height: 80,
            background: bannerUrl ? `url(${bannerUrl}) center/cover no-repeat` : accentColorHex,
            transition: "background 200ms ease",
          }}
        />

        {/* Avatar & Badges */}
        <div
          style={{
            padding: "0 16px 12px",
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          {/* Avatar with Circular Border */}
          <div
            style={{
              position: "absolute",
              top: -36,
              left: 16,
              borderRadius: "50%",
              border: "5px solid var(--bg-secondary)",
              background: "var(--bg-secondary)",
              boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
            }}
          >
            <Avatar
              userId={account.user_id}
              avatarHash={account.avatar}
              username={account.username}
              size={64}
              color={account.color}
              showStatus
              status={currentPresence === "invisible" ? "offline" : currentPresence}
              square={false}
            />
          </div>

          {/* Nitro / Custom Badge on top right */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, marginTop: 8 }}>
            {hasNitro && (
              <div
                title="Discord Nitro"
                style={{
                  background: "linear-gradient(135deg, #f47fff 0%, #8b46ff 100%)",
                  borderRadius: 12,
                  padding: "3px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  boxShadow: "0 2px 6px rgba(139,70,255,0.4)",
                }}
              >
                <Zap size={11} fill="#fff" /> Nitro
              </div>
            )}
          </div>
        </div>

        {/* Names & Status Details */}
        <div style={{ padding: "8px 16px 14px" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-normal)", lineHeight: 1.2 }}>
            {account.global_name ?? account.username}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            {account.username}
          </div>

          {bio && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-normal)",
                marginTop: 8,
                background: "var(--bg-tertiary)",
                padding: "6px 10px",
                borderRadius: "var(--radius-sm)",
                maxHeight: 60,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {bio}
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)" }} />

      {/* Action Items List */}
      <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Editar perfil */}
        <button
          onClick={handleOpenEditProfile}
          className="hover-bg-modifier"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "var(--text-normal)",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Pencil size={16} color="var(--text-muted)" />
            Editar perfil
          </div>
        </button>

        {/* Status Selector (Inline Accordion) */}
        <div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveSubmenu((prev) => (prev === "status" ? "none" : "status"));
            }}
            className="hover-bg-modifier"
            style={{
              width: "100%",
              background: activeSubmenu === "status" ? "var(--bg-modifier-selected)" : "transparent",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "var(--text-normal)",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {STATUS_CONFIG[currentPresence]?.icon}
              {STATUS_CONFIG[currentPresence]?.label || "Status"}
            </div>
            <ChevronRight
              size={16}
              color="var(--text-muted)"
              style={{
                transform: activeSubmenu === "status" ? "rotate(90deg)" : "none",
                transition: "transform 150ms ease",
              }}
            />
          </button>

          {/* Status Submenu Accordion */}
          {activeSubmenu === "status" && (
            <div
              style={{
                margin: "4px 0 6px 8px",
                padding: 4,
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {(Object.keys(STATUS_CONFIG) as PresenceStatus[]).map((st) => (
                <button
                  key={st}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPresenceStatus(account.id, st);
                    setActiveSubmenu("none");
                    toast.success(`Status alterado para ${STATUS_CONFIG[st].label}`);
                  }}
                  className="hover-bg-modifier"
                  style={{
                    width: "100%",
                    background: currentPresence === st ? "var(--bg-modifier-selected)" : "transparent",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    padding: "7px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: "var(--text-normal)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {STATUS_CONFIG[st].icon}
                  {STATUS_CONFIG[st].label}
                  {currentPresence === st && <Check size={14} style={{ marginLeft: "auto" }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Clipes */}
        <button
          onClick={() => {
            toast.info("Recurso de Clipes está ativo.");
            onClose();
          }}
          className="hover-bg-modifier"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "var(--text-normal)",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Film size={16} color="var(--text-muted)" />
            Clipes
          </div>
          <ChevronRight size={16} color="var(--text-muted)" />
        </button>

        <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />

        {/* Mudar de conta (Inline Accordion) */}
        <div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveSubmenu((prev) => (prev === "accounts" ? "none" : "accounts"));
            }}
            className="hover-bg-modifier"
            style={{
              width: "100%",
              background: activeSubmenu === "accounts" ? "var(--bg-modifier-selected)" : "transparent",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "var(--text-normal)",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Users size={16} color="var(--text-muted)" />
              Mudar de conta
            </div>
            <ChevronRight
              size={16}
              color="var(--text-muted)"
              style={{
                transform: activeSubmenu === "accounts" ? "rotate(90deg)" : "none",
                transition: "transform 150ms ease",
              }}
            />
          </button>

          {/* Accounts Submenu Accordion */}
          {activeSubmenu === "accounts" && (
            <div
              style={{
                margin: "4px 0 6px 8px",
                padding: 6,
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", padding: "4px 6px 2px", letterSpacing: "0.5px" }}>
                Alternar Conta
              </div>

              {accounts.map((acc) => {
                const isCurrent = acc.id === activeAccountId;
                const status = presenceStatus[acc.id] ?? "online";
                return (
                  <button
                    key={acc.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isCurrent) {
                        setActiveAccount(acc.id);
                        toast.success(`Alternado para ${acc.global_name ?? acc.username}`);
                      }
                      setActiveSubmenu("none");
                      onClose();
                    }}
                    className="hover-bg-modifier"
                    style={{
                      width: "100%",
                      background: isCurrent ? "var(--bg-modifier-selected)" : "transparent",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 8px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: "var(--text-normal)",
                      cursor: "pointer",
                      fontSize: 13,
                      textAlign: "left",
                    }}
                  >
                    <Avatar
                      userId={acc.user_id}
                      avatarHash={acc.avatar}
                      username={acc.username}
                      size={28}
                      showStatus
                      status={status === "invisible" ? "offline" : status}
                    />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <span className="truncate" style={{ fontWeight: isCurrent ? 600 : 500, fontSize: 13, color: "var(--text-normal)" }}>
                        {acc.global_name ?? acc.username}
                      </span>
                      <span className="truncate" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        @{acc.username}
                      </span>
                    </div>
                    {isCurrent && <Check size={16} color="var(--brand-500)" />}
                  </button>
                );
              })}

              <div style={{ height: 1, background: "var(--border-subtle)", margin: "2px 0" }} />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSubmenu("none");
                  onClose();
                  if (onAddAccount) onAddAccount();
                }}
                className="hover-bg-modifier"
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "6px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "var(--status-online)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "rgba(35, 165, 90, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Plus size={16} color="var(--status-online)" />
                </div>
                <span>Adicionar uma conta</span>
              </button>
            </div>
          )}
        </div>

        {/* Copiar ID do usuário */}
        <button
          onClick={handleCopyUserId}
          className="hover-bg-modifier"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            borderRadius: "var(--radius-sm)",
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "var(--text-normal)",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Copy size={16} color="var(--text-muted)" />
            Copiar ID do usuário
          </div>
        </button>
      </div>
    </div>
  );
}
