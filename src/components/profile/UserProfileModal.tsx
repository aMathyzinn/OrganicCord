import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useProfileStore } from "@/stores/profileStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { useDiscordStore } from "@/stores/discordStore";
import { fetchUserProfile } from "@/lib/tauri";
import { Loader2, MessageSquare, X, Image as ImageIcon, MoreHorizontal, Gamepad2, Flame, Zap, RotateCcw } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { getAvatarUrl } from "@/lib/utils";
import { DiscordText } from "@/components/ui/DiscordText";

// Exemplo da estrutura retornada por fetch_user_profile
interface ProfileData {
  user: {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
    banner: string | null;
    accent_color: number | null;
    avatar_decoration_data?: { asset: string; sku_id: string } | null;
  };
  user_profile?: {
    bio?: string;
    accent_color?: number;
    banner?: string;
    pronouns?: string;
    theme_colors?: number[];
  };
  badges?: {
    id: string;
    icon: string;
    description: string;
  }[];
  mutual_guilds?: any[];
  mutual_friends?: any[];
  mutual_friends_count?: number;
  premium_since?: string;
}

export function UserProfileModal() {
  const { isOpen, userId, closeProfile } = useProfileStore();
  
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"activity" | "mutual_guilds" | "mutual_friends">("activity");
  const activeAccountId = useNavigationStore((state) => state.activeAccountId);
  const presences = useDiscordStore((state) => activeAccountId ? state.cache.presences[activeAccountId] : {});
  
  const getActivityImageUrl = (appId?: string, assetId?: string) => {
    if (!assetId) return undefined;
    if (assetId.startsWith("mp:external/")) {
      const parts = assetId.split("/");
      if (parts.length >= 4) {
        return `${parts[2]}://${parts.slice(3).join("/")}`;
      }
    }
    if (assetId.startsWith("spotify:")) {
      return `https://i.scdn.co/image/${assetId.split(":")[1]}`;
    }
    if (appId) {
      return `https://cdn.discordapp.com/app-assets/${appId}/${assetId}.png`;
    }
    return undefined;
  };

  const { cache } = useDiscordStore();
  const myGuilds = activeAccountId ? cache.guilds[activeAccountId] || [] : [];

  useEffect(() => {
    if (isOpen && userId && activeAccountId) {
      setLoading(true);
      setError("");
      setProfile(null);
      fetchUserProfile(activeAccountId, userId)
        .then((data) => {
          console.log("PROFILE DATA REBIDO DO RUST:", data);
          setProfile(data);
        })
        .catch((e) => {
          console.error(e);
          setError("Erro ao carregar perfil.");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, userId, activeAccountId]);

  if (!isOpen) return null;

  const hexColor = (color: number | undefined | null) => 
    color ? `#${color.toString(16).padStart(6, '0')}` : "var(--bg-modifier-hover)";

  const renderBanner = () => {
    const bannerHash = profile?.user_profile?.banner || profile?.user?.banner;
    const accentColor = profile?.user_profile?.accent_color || profile?.user?.accent_color;
    
    if (bannerHash && profile?.user?.id) {
      const isAnimated = bannerHash.startsWith("a_");
      const ext = isAnimated ? "gif" : "png";
      const url = `https://cdn.discordapp.com/banners/${profile.user.id}/${bannerHash}.${ext}?size=600`;
      return (
        <div style={{ height: 120, width: "100%", backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      );
    } else if (accentColor) {
      return <div style={{ height: 120, width: "100%", background: hexColor(accentColor) }} />;
    } else {
      return <div style={{ height: 120, width: "100%", background: "var(--bg-tertiary)" }} />;
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && closeProfile()}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 840,
            height: 600,
            background: (() => {
              if (profile?.user_profile?.theme_colors?.length === 2) {
                const c1 = `#${profile.user_profile.theme_colors[0].toString(16).padStart(6, '0')}`;
                const c2 = `#${profile.user_profile.theme_colors[1].toString(16).padStart(6, '0')}`;
                return `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
              }
              return "var(--bg-primary)";
            })(),
            borderRadius: 12,
            boxShadow: "0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
            zIndex: 10000,
            display: "flex",
            overflow: "hidden",
            outline: "none",
            animation: "popIn 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <Dialog.Title style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", borderWidth: 0 }}>Perfil de Usuário</Dialog.Title>
          <Dialog.Description style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", borderWidth: 0 }}>Detalhes do perfil de usuário</Dialog.Description>
          {loading && !profile ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 className="spin" size={48} color="var(--brand-500)" />
            </div>
          ) : error ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--status-danger)" }}>
              {error}
            </div>
          ) : profile ? (
            <>
              {/* Banner Traseiro Fading */}
              {(() => {
                const bannerHash = profile?.user_profile?.banner || profile?.user?.banner;
                if (bannerHash && profile?.user?.id) {
                  const ext = bannerHash.startsWith("a_") ? "gif" : "png";
                  const url = `https://cdn.discordapp.com/banners/${profile.user.id}/${bannerHash}.${ext}?size=1024`;
                  return (
                    <div style={{
                      position: "absolute",
                      top: 0, left: 0, right: 0, height: 220,
                      backgroundImage: `url(${url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      opacity: 0.6,
                      WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
                      maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
                      zIndex: 0,
                    }} />
                  );
                }
                return null;
              })()}

              {/* Container de Conteúdo Flex */}
              <div style={{ display: "flex", width: "100%", height: "100%", padding: 24, gap: 24, position: "relative", zIndex: 1 }}>
                
                {/* Esquerda: Card do Perfil Solto */}
                <div style={{ 
                  width: 320, 
                  background: profile?.user_profile?.theme_colors ? "rgba(0,0,0,0.45)" : "var(--bg-secondary)",
                  borderRadius: 16,
                  display: "flex", 
                  flexDirection: "column", 
                  overflowY: "auto",
                  padding: "24px 16px 20px 16px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
                }}>
                  <div style={{ position: "relative", marginBottom: 16 }}>
                    <Avatar 
                      userId={profile.user.id} 
                      username={profile.user.username} 
                      avatarHash={profile.user.avatar} 
                      avatarDecoration={profile.user.avatar_decoration_data}
                      size={100} 
                      showStatus={true}
                      style={{ boxShadow: "0 4px 10px rgba(0,0,0,0.3)" }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-normal)", wordBreak: "break-word", lineHeight: 1.2 }}>
                      {profile.user.global_name || profile.user.username}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{profile.user.username}</span>
                      {profile.user_profile?.pronouns && (
                        <>
                          <span style={{ fontSize: 10 }}>•</span>
                          <span>{profile.user_profile.pronouns}</span>
                        </>
                      )}
                    </div>

                    {profile.badges && profile.badges.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                        {profile.badges.map(b => {
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

                    <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                      <button
                        style={{
                          flex: 1,
                          background: "var(--brand-500)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "var(--radius-sm)",
                          padding: "8px 0",
                          fontWeight: 600,
                          fontSize: 14,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          cursor: "pointer",
                        }}
                        className="hover-bg-modifier"
                      >
                        <MessageSquare size={16} /> Mensagem
                      </button>
                    </div>

                    {profile.user_profile?.bio && (
                      <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>
                          Sobre Mim
                        </div>
                        <DiscordText 
                          content={profile.user_profile.bio} 
                          style={{ fontSize: 14, color: "var(--text-normal)", lineHeight: 1.4, whiteSpace: "pre-wrap", display: "block" }} 
                        />
                      </div>
                    )}

                    <div>
                      <div style={{ color: "var(--text-muted)", background: profile?.user_profile?.theme_colors ? "rgba(0,0,0,0.3)" : "transparent", padding: profile?.user_profile?.theme_colors ? "4px 8px" : "0", borderRadius: 4, display: "inline-block", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
                        Membro desde
                      </div>
                      <div style={{ fontSize: 14, color: "var(--text-normal)", marginTop: 8 }}>
                        {(() => {
                          try {
                            const ts = Number((BigInt(profile.user.id) >> 22n) + 1420070400000n);
                            return new Date(ts).toLocaleDateString("pt-BR", { month: "short", day: "numeric", year: "numeric" });
                          } catch {
                            return "Desconhecido";
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Direita: Tabs (Activity, Mutual Guilds, Mutual Friends) Soltas */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  {/* Header de Tabs */}
                  <div style={{ display: "flex", padding: "0 48px 12px 0", borderBottom: "1px solid rgba(255,255,255,0.1)", gap: 20 }}>
                  <div 
                    className={activeTab === "activity" ? "" : "hover-color-normal"}
                    style={{ paddingBottom: 16, cursor: "pointer", fontWeight: 600, fontSize: 14, color: activeTab === "activity" ? "var(--text-normal)" : "var(--text-muted)", borderBottom: activeTab === "activity" ? "2px solid var(--brand-500)" : "2px solid transparent", transition: "color 0.2s" }}
                    onClick={() => setActiveTab("activity")}
                  >
                    Atividade
                  </div>
                  <div 
                    className={activeTab === "mutual_friends" ? "" : "hover-color-normal"}
                    style={{ paddingBottom: 16, cursor: "pointer", fontWeight: 600, fontSize: 14, color: activeTab === "mutual_friends" ? "var(--text-normal)" : "var(--text-muted)", borderBottom: activeTab === "mutual_friends" ? "2px solid var(--brand-500)" : "2px solid transparent", transition: "color 0.2s" }}
                    onClick={() => setActiveTab("mutual_friends")}
                  >
                    {profile.mutual_friends_count || 0} Amigos em Comum
                  </div>
                  <div 
                    className={activeTab === "mutual_guilds" ? "" : "hover-color-normal"}
                    style={{ paddingBottom: 16, cursor: "pointer", fontWeight: 600, fontSize: 14, color: activeTab === "mutual_guilds" ? "var(--text-normal)" : "var(--text-muted)", borderBottom: activeTab === "mutual_guilds" ? "2px solid var(--brand-500)" : "2px solid transparent", transition: "color 0.2s" }}
                    onClick={() => setActiveTab("mutual_guilds")}
                  >
                    {profile.mutual_guilds?.length || 0} Servidor(es) Mútuo(s)
                  </div>
                </div>

                {/* Conteúdo das Tabs */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 0" }}>
                  {activeTab === "activity" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingRight: 8 }}>
                      {(() => {
                        const userPresence = presences && profile ? presences[profile.user.id] : null;
                        const activities = userPresence?.activities?.filter(a => a.type !== 4) || [];
                        
                        if (activities.length === 0) {
                          return (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 100, color: "var(--text-muted)", marginTop: 24 }}>
                              Nenhuma atividade no momento
                            </div>
                          );
                        }

                        return activities.map((act, i) => {
                          const largeImage = getActivityImageUrl(act.application_id, act.assets?.large_image);
                          const smallImage = getActivityImageUrl(act.application_id, act.assets?.small_image);
                          const isSpotify = act.name === "Spotify" || act.id === "spotify:1";
                          
                          return (
                            <div key={i}>
                              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 12 }}>
                                {act.type === 0 ? "Jogando" : act.type === 1 ? "Transmitindo" : act.type === 2 ? "Ouvindo" : act.type === 3 ? "Assistindo" : "Atividade atual"}
                              </div>
                              <div style={{ 
                                background: profile?.user_profile?.theme_colors ? "rgba(0,0,0,0.3)" : "var(--bg-tertiary)", 
                                borderRadius: "var(--radius-lg)", 
                                padding: 16,
                                position: "relative"
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                                    {act.name}
                                  </div>
                                  <MoreHorizontal size={18} color="var(--text-muted)" style={{ cursor: "pointer" }} />
                                </div>
                                
                                <div style={{ display: "flex", gap: 16 }}>
                                  <div style={{ position: "relative", width: 64, height: 64 }}>
                                    {largeImage ? (
                                      <div style={{ width: 64, height: 64, borderRadius: isSpotify ? 8 : 12, background: "var(--bg-primary)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <img src={largeImage} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => e.currentTarget.style.display = 'none'} />
                                      </div>
                                    ) : (
                                      <div style={{ width: 64, height: 64, borderRadius: 12, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Gamepad2 size={32} color="var(--text-muted)" opacity={0.5} />
                                      </div>
                                    )}
                                    {smallImage && (
                                      <div style={{ position: "absolute", bottom: -4, right: -4, width: 24, height: 24, borderRadius: "50%", background: profile?.user_profile?.theme_colors ? "rgba(0,0,0,0.6)" : "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <img src={smallImage} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} onError={(e) => e.currentTarget.style.display = 'none'} />
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                    <div style={{ fontWeight: 700, color: "var(--text-normal)", fontSize: 15, marginBottom: 2 }}>
                                      {act.name}
                                    </div>
                                    {act.details && (
                                      <div style={{ fontSize: 14, color: "var(--text-normal)", marginBottom: 2 }}>
                                        {act.details}
                                      </div>
                                    )}
                                    {act.state && (
                                      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>
                                        {act.state}
                                      </div>
                                    )}
                                    {act.timestamps?.start && (
                                      <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                                        <Gamepad2 size={14} color={isSpotify ? "#1DB954" : "var(--status-success)"} /> 
                                        <span>Desde as {new Date(act.timestamps.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                  {activeTab === "mutual_friends" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {profile.mutual_friends?.length ? profile.mutual_friends.map((f) => {
                        const friendName = f.global_name || f.username;
                        return (
                          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", borderRadius: "var(--radius-md)", background: profile?.user_profile?.theme_colors ? "rgba(0,0,0,0.2)" : "transparent" }} className="hover-bg-modifier">
                            <div style={{ position: "relative" }}>
                              <Avatar 
                                userId={f.id} 
                                username={f.username} 
                                avatarHash={f.avatar} 
                                size={40} 
                                showStatus={true} 
                                status={(cache.presences[activeAccountId!]?.[f.id]?.status as any) || "offline"} 
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <span style={{ fontWeight: 600, color: "var(--text-normal)", fontSize: 15 }}>
                                {friendName}
                              </span>
                              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                                {f.username}
                              </span>
                            </div>
                          </div>
                        );
                      }) : (
                        <div style={{ color: "var(--text-muted)" }}>Nenhum amigo em comum.</div>
                      )}
                    </div>
                  )}
                  {activeTab === "mutual_guilds" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {profile.mutual_guilds?.length ? profile.mutual_guilds.map((g) => {
                        const realGuild = myGuilds.find((mg: any) => mg.id === g.id);
                        const guildName = realGuild ? realGuild.name : (g.nick || "Servidor Privado");
                        const guildIcon = realGuild ? realGuild.icon : g.icon;

                        return (
                          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", borderRadius: "var(--radius-md)", background: profile?.user_profile?.theme_colors ? "rgba(0,0,0,0.2)" : "transparent" }} className="hover-bg-modifier">
                            <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--bg-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                              {guildIcon ? (
                                <img src={`https://cdn.discordapp.com/icons/${g.id}/${guildIcon}.png?size=128`} style={{ width: "100%", height: "100%" }} />
                              ) : (
                                <ImageIcon size={20} style={{ opacity: 0.5 }} />
                              )}
                            </div>
                            <div style={{ fontWeight: 600, color: "var(--text-normal)", fontSize: 15 }}>
                              {guildName}
                            </div>
                          </div>
                        );
                      }) : (
                        <div style={{ color: "var(--text-muted)" }}>Nenhum servidor em comum.</div>
                      )}
                    </div>
                  )}
                </div>

              </div>
              </div>

              {/* Botão de Fechar Absoluto */}
              <button 
                onClick={closeProfile}
                style={{ position: "absolute", top: 16, right: 16, background: "rgba(0,0,0,0.4)", border: "none", borderRadius: 6, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-normal)", cursor: "pointer" }}
                className="hover-bg-modifier"
              >
                <X size={18} />
              </button>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
