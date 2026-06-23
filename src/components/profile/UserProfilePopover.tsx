import React, { useState, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import { fetchUserProfile } from "@/lib/tauri";
import { Avatar } from "@/components/ui/Avatar";
import { useNavigationStore } from "@/stores/navigationStore";
import { useProfileStore } from "@/stores/profileStore";
import { Loader2 } from "lucide-react";
import { DiscordText } from "@/components/ui/DiscordText";

export function UserProfilePopover({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { activeAccountId } = useNavigationStore();
  const { openProfile } = useProfileStore();

  useEffect(() => {
    if (open && activeAccountId && !profile && !loading) {
      setLoading(true);
      fetchUserProfile(activeAccountId, userId)
        .then((data) => {
          setProfile(data);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, activeAccountId, userId, profile]);

  const renderBanner = () => {
    const bannerHash = profile?.user_profile?.banner || profile?.user?.banner;
    const accentColor = profile?.user_profile?.accent_color || profile?.user?.accent_color;
    
    if (bannerHash && profile?.user?.id) {
      const isAnimated = bannerHash.startsWith("a_");
      const ext = isAnimated ? "gif" : "png";
      const url = `https://cdn.discordapp.com/banners/${profile.user.id}/${bannerHash}.${ext}?size=300`;
      return (
        <div 
          onClick={() => openProfile(userId)}
          style={{ height: 120, width: "100%", backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center", cursor: "pointer", transition: "opacity 0.2s" }} 
          onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
        />
      );
    } else if (accentColor) {
      return <div onClick={() => openProfile(userId)} style={{ height: 120, width: "100%", background: `#${accentColor.toString(16).padStart(6, '0')}`, cursor: "pointer", transition: "opacity 0.2s" }} onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")} onMouseOut={(e) => (e.currentTarget.style.opacity = "1")} />;
    } else {
      return <div onClick={() => openProfile(userId)} style={{ height: 120, width: "100%", background: "var(--bg-tertiary)", cursor: "pointer", transition: "opacity 0.2s" }} onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")} onMouseOut={(e) => (e.currentTarget.style.opacity = "1")} />;
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          sideOffset={16}
          align="start"
          style={{
            width: 312,
            background: (() => {
              if (profile?.user_profile?.theme_colors?.length === 2) {
                const c1 = `#${profile.user_profile.theme_colors[0].toString(16).padStart(6, '0')}`;
                const c2 = `#${profile.user_profile.theme_colors[1].toString(16).padStart(6, '0')}`;
                return `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
              }
              return "var(--bg-float)";
            })(),
            borderRadius: "var(--radius-lg)",
            boxShadow: "0 8px 16px rgba(0,0,0,0.24), 0 0 0 1px rgba(255,255,255,0.05)",
            zIndex: 1000,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            animation: "popIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {loading ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 className="spin" size={32} color="var(--brand-500)" />
            </div>
          ) : profile ? (
            <>
              <div style={{ position: "relative" }}>
                {renderBanner()}
                <div style={{ position: "absolute", bottom: -28, left: 16, borderRadius: "50%", padding: 6, background: profile?.user_profile?.theme_colors ? "transparent" : "var(--bg-float)", cursor: "pointer", transition: "transform 0.2s" }} onClick={() => openProfile(userId)} onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.05)")} onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}>
                  <Avatar 
                    userId={profile.user.id} 
                    username={profile.user.username} 
                    avatarHash={profile.user.avatar} 
                    avatarDecoration={profile.user.avatar_decoration_data}
                    size={80} 
                    showStatus={true}
                  />
                </div>
              </div>
              <div style={{ padding: "36px 16px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-normal)", lineHeight: 1.2 }}>
                    {profile.user.global_name || profile.user.username}
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{profile.user.username}</span>
                    {profile.user_profile?.pronouns && (
                      <>
                        <span style={{ fontSize: 10 }}>•</span>
                        <span>{profile.user_profile.pronouns}</span>
                      </>
                    )}
                  </div>
                </div>

                {profile.badges && profile.badges.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingBottom: 12, borderBottom: "1px solid var(--border-subtle)" }}>
                    {profile.badges.map((b: any) => {
                      const ext = b.icon.startsWith("a_") ? "gif" : "png";
                      return (
                        <img 
                          key={b.id} 
                          src={`https://cdn.discordapp.com/badge-icons/${b.icon}.${ext}`} 
                          alt={b.description} 
                          title={b.description}
                          style={{ width: 22, height: 22, objectFit: "contain" }}
                        />
                      );
                    })}
                  </div>
                )}

                {profile.user_profile?.bio && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-normal)", textTransform: "uppercase", marginBottom: 8 }}>
                      Sobre mim
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text-normal)", lineHeight: 1.4 }}>
                      <DiscordText content={profile.user_profile.bio} />
                    </div>
                  </div>
                )}
                
                <div style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    placeholder={`Conversar com @${profile.user.username}`}
                    readOnly
                    onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-modifier-hover)")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "var(--bg-tertiary)")}
                    style={{
                      width: "100%",
                      background: profile?.user_profile?.theme_colors ? "rgba(0,0,0,0.2)" : "var(--bg-tertiary)",
                      border: "1px solid transparent",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      fontSize: 14,
                      color: "var(--text-normal)",
                      outline: "none",
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
             <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--status-danger)" }}>
               Erro ao carregar perfil
             </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
