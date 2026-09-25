import React, { useState, useEffect } from "react";
import { useAccountStore } from "@/stores/accountStore";
import { useNavigationStore } from "@/stores/navigationStore";
import { getAuthSessions, revokeAuthSession, fetchUserProfile, updateUserProfile, getSelfProfile, selectProfileImage, type UpdateProfileParams } from "@/lib/tauri";
import type { DiscordAuthSession, DiscordUserProfile } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { ProfileCustomizationModal } from "@/components/profile/ProfileCustomizationModal";
import { getBannerUrl } from "@/lib/utils";
import { Monitor, Smartphone, Loader2, X, Upload, Trash2, Check, AlertCircle, Sparkles, Zap } from "lucide-react";

export function MyAccountSettings() {
  const { accounts, logoutAccount, updateAccountInfo } = useAccountStore();
  const { activeAccountId } = useNavigationStore();
  
  const [sessions, setSessions] = useState<DiscordAuthSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [profileData, setProfileData] = useState<DiscordUserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Profile Edit Modal State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editGlobalName, setEditGlobalName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editAccentColor, setEditAccentColor] = useState<string>("#5865f2");
  
  // Image Base64 Data URLs for preview & API submit
  const [newAvatarData, setNewAvatarData] = useState<string | null>(null); // null = keep existing, "" = remove, "data:..." = new
  const [newBannerData, setNewBannerData] = useState<string | null>(null); // null = keep existing, "" = remove, "data:..." = new
  
  // Preview URLs
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const currentAccount = accounts.find(a => a.id === activeAccountId);

  // Load Sessions and User Profile Data
  useEffect(() => {
    if (activeAccountId && currentAccount) {
      setLoadingSessions(true);
      getAuthSessions(activeAccountId)
        .then((data) => {
           if (Array.isArray(data)) {
             setSessions(data);
           } else if (Array.isArray(data.user_sessions)) {
             setSessions(data.user_sessions);
           }
        })
        .catch(console.error)
        .finally(() => setLoadingSessions(false));

      // Fetch live user profile details (banner, bio, accent_color, etc.)
      setLoadingProfile(true);
      fetchUserProfile(activeAccountId, currentAccount.user_id)
        .then((data) => {
          if (data) {
            setProfileData(data);
          }
        })
        .catch(() => {
          // Fallback to getSelfProfile if fetchUserProfile fails
          getSelfProfile(activeAccountId)
            .then((userData) => setProfileData({ user: userData }))
            .catch(console.error);
        })
        .finally(() => setLoadingProfile(false));
    }
  }, [activeAccountId, currentAccount]);

  const handleRevokeSession = async (sessionIdHash: string) => {
    if (!activeAccountId) return;
    try {
      await revokeAuthSession(activeAccountId, sessionIdHash);
      setSessions(prev => prev.filter(s => s.id_hash !== sessionIdHash));
    } catch (err) {
      console.error(err);
    }
  };

  if (!currentAccount) {
    return <div style={{ color: "var(--text-muted)" }}>Nenhuma conta ativa selecionada.</div>;
  }

  // Determine Nitro status & banner values
  const premiumType = profileData?.user?.premium_type ?? profileData?.premium_type ?? currentAccount.premium_type;
  const hasNitro = premiumType === 2 || premiumType === 1 || !!profileData?.premium_since;

  const bannerHash = profileData?.user_profile?.banner || profileData?.user?.banner || currentAccount.banner;
  const accentColorNum = profileData?.user_profile?.accent_color ?? profileData?.user?.accent_color ?? currentAccount.accent_color;
  const accentColorHex = accentColorNum ? `#${accentColorNum.toString(16).padStart(6, '0')}` : (currentAccount.color || "#5865f2");
  const rawBannerUrl = getBannerUrl(currentAccount.user_id, bannerHash ?? null, 600);
  // Banner de imagem só é exibido se o usuário possui Nitro
  const bannerUrl = hasNitro ? rawBannerUrl : null;
  const userBio = profileData?.user_profile?.bio || profileData?.user?.bio || currentAccount.bio || "";

  // Open Edit Profile Modal
  const openEditModal = () => {
    setEditGlobalName(currentAccount.global_name ?? currentAccount.username ?? "");
    setEditBio(userBio);
    setEditAccentColor(accentColorHex);
    setNewAvatarData(null);
    setNewBannerData(null);
    setAvatarPreviewUrl(null);
    setBannerPreviewUrl(null);
    setSaveError("");
    setSaveSuccess(false);
    setIsEditingProfile(true);
  };

  const selectImage = async (type: "avatar" | "banner") => {
    if (type === "banner" && !hasNitro) {
      setSaveError("Banners de imagem personalizados exigem assinatura ativa do Discord Nitro.");
      return;
    }
    setSaveError("");
    try {
      const image = await selectProfileImage();
      if (!image) return;
      if (type === "avatar") {
        setNewAvatarData(image.dataUrl);
        setAvatarPreviewUrl(image.dataUrl);
      } else {
        setNewBannerData(image.dataUrl);
        setBannerPreviewUrl(image.dataUrl);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível selecionar a imagem.");
    }
  };

  // Save Profile Changes
  const handleSaveProfile = async () => {
    if (!activeAccountId) return;
    setSavingProfile(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      // Parse accent color hex to number
      let accentColorInt: number | undefined = undefined;
      if (editAccentColor && editAccentColor.startsWith("#")) {
        accentColorInt = parseInt(editAccentColor.replace("#", ""), 16);
        if (isNaN(accentColorInt)) accentColorInt = undefined;
      }

      const payload: UpdateProfileParams = {
        global_name: editGlobalName.trim() || null,
        bio: editBio.trim() || null,
      };

      if (newAvatarData !== null) {
        payload.avatar = newAvatarData;
      }
      if (newBannerData !== null && hasNitro) {
        payload.banner = newBannerData;
      }
      if (accentColorInt !== undefined) {
        payload.accent_color = accentColorInt;
      }

      const updatedUser = await updateUserProfile(activeAccountId, payload);

      // Update accountStore state
      updateAccountInfo(activeAccountId, {
        global_name: updatedUser.global_name,
        avatar: updatedUser.avatar,
        banner: updatedUser.banner,
        accent_color: updatedUser.accent_color,
        bio: updatedUser.bio,
        premium_type: updatedUser.premium_type ?? currentAccount.premium_type,
      });

      // Update local profile state
      setProfileData((prev) => ({
        ...prev,
        user: {
          ...prev?.user,
          ...updatedUser,
        },
        user_profile: {
          ...prev?.user_profile,
          bio: updatedUser.bio ?? editBio,
          banner: updatedUser.banner,
          accent_color: updatedUser.accent_color,
        }
      }));

      setSaveSuccess(true);
      setTimeout(() => {
        setIsEditingProfile(false);
      }, 800);
    } catch (err: unknown) {
      console.error("[MyAccount] Error updating profile:", err);
      setSaveError(
        typeof err === "string"
          ? err
          : err instanceof Error
            ? err.message
            : "Falha ao atualizar o perfil no Discord."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 200ms ease" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)", margin: 0 }}>Minha Conta</h2>
      
      {/* Account Card Container */}
      <div style={{ 
        background: "var(--bg-secondary)", 
        borderRadius: "var(--radius-md)", 
        overflow: "hidden",
        position: "relative",
        border: "1px solid var(--border-subtle)"
      }}>
        {/* Banner Display: Render image banner ONLY if user has Nitro */}
        <div style={{ 
          height: 120, 
          background: bannerUrl ? `url(${bannerUrl}) center/cover no-repeat` : accentColorHex,
          position: "relative",
          transition: "background 0.3s ease"
        }}>
          {loadingProfile && (
            <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.5)", borderRadius: 12, padding: "4px 8px", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff" }}>
              <Loader2 className="spin" size={14} /> Verificando Nitro...
            </div>
          )}
        </div>
        
        <div style={{ padding: "16px 20px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
          {/* Avatar: Round circular container matching Discord standard */}
          <div style={{ 
            position: "absolute", 
            top: -45, 
            left: 20, 
            borderRadius: "50%", 
            border: "6px solid var(--bg-secondary)",
            background: "var(--bg-secondary)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
          }}>
            <Avatar
              userId={currentAccount.user_id}
              avatarHash={currentAccount.avatar}
              username={currentAccount.username}
              size={80}
              square={false}
            />
          </div>
          
          <div style={{ marginTop: 42 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-normal)", display: "flex", alignItems: "center", gap: 10 }}>
              {currentAccount.global_name ?? currentAccount.username}
              {hasNitro ? (
                <span style={{
                  background: "linear-gradient(135deg, #f47fff 0%, #8b46ff 100%)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  boxShadow: "0 2px 8px rgba(139,70,255,0.4)"
                }}>
                  <Zap size={12} fill="#fff" /> Nitro
                </span>
              ) : (
                <span style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-muted)",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4
                }}>
                  Sem Nitro
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
              {currentAccount.username}
            </div>
            {userBio && (
              <div style={{ fontSize: 13, color: "var(--text-normal)", marginTop: 8, maxWidth: 450, background: "var(--bg-tertiary)", padding: "8px 12px", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--brand-500)" }}>
                {userBio}
              </div>
            )}
          </div>
          
          <button 
            onClick={openEditModal}
            style={{
              background: "var(--brand-500)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "8px 16px",
              fontWeight: 600,
              cursor: "pointer",
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "filter 0.2s"
            }}
            className="hover-opacity"
          >
            <Sparkles size={16} />
            Editar Perfil de Usuário
          </button>
        </div>
        
        {/* User Info Fields */}
        <div style={{ padding: "16px", background: "var(--bg-tertiary)", margin: "0 20px 20px", borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Nome de Exibição</div>
              <div style={{ fontSize: 15, color: "var(--text-normal)" }}>{currentAccount.global_name ?? currentAccount.username}</div>
            </div>
            <button 
              onClick={openEditModal}
              className="hover-bg-modifier" 
              style={{ background: "var(--bg-secondary)", color: "var(--text-normal)", border: "none", padding: "6px 14px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 500 }}
            >
              Editar
            </button>
          </div>

          <div style={{ height: 1, background: "var(--border-subtle)" }} />
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Nome de Usuário</div>
              <div style={{ fontSize: 15, color: "var(--text-normal)" }}>{currentAccount.username}</div>
            </div>
            <button 
              onClick={openEditModal}
              className="hover-bg-modifier" 
              style={{ background: "var(--bg-secondary)", color: "var(--text-normal)", border: "none", padding: "6px 14px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 500 }}
            >
              Editar
            </button>
          </div>

          {userBio && (
            <>
              <div style={{ height: 1, background: "var(--border-subtle)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Sobre Mim</div>
                  <div style={{ fontSize: 14, color: "var(--text-normal)", whiteSpace: "pre-wrap" }}>{userBio}</div>
                </div>
                <button 
                  onClick={openEditModal}
                  className="hover-bg-modifier" 
                  style={{ background: "var(--bg-secondary)", color: "var(--text-normal)", border: "none", padding: "6px 14px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 500 }}
                >
                  Editar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      
      <div style={{ height: 1, background: "var(--border-subtle)" }} />

      {/* Active Sessions Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-normal)", margin: 0 }}>Sessões Ativas (Dispositivos)</h3>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
          Aqui estão todos os dispositivos atualmente conectados na sua conta. Você pode deslogar de qualquer um deles remotamente.
        </p>

        {loadingSessions ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
            <Loader2 className="spin" size={24} color="var(--brand-500)" />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sessions.map((s, idx) => {
              const Icon = s.client_info?.os === "iOS" || s.client_info?.os === "Android" ? Smartphone : Monitor;
              const os = s.client_info?.os || "Desconhecido";
              const loc = s.client_info?.location || "Localização desconhecida";
              const browser = s.client_info?.client || "Client App";
              
              return (
                <div key={s.id_hash || idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-secondary)", padding: "16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <div style={{ background: "var(--bg-tertiary)", padding: 12, borderRadius: "50%", color: s.current_session ? "var(--brand-500)" : "var(--text-normal)" }}>
                      <Icon size={24} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-normal)", display: "flex", alignItems: "center", gap: 8 }}>
                        {os} · {browser}
                        {s.current_session && (
                          <span style={{ fontSize: 10, background: "var(--brand-500)", color: "white", padding: "2px 6px", borderRadius: 12, textTransform: "uppercase", fontWeight: 700 }}>Atual</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                        {loc} · {new Date(s.approx_last_used_time).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  {!s.current_session && (
                    <button 
                      className="hover-bg-modifier"
                      onClick={() => handleRevokeSession(s.id_hash)}
                      style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 8, borderRadius: "50%", display: "flex" }}
                      title="Sair (Remover dispositivo)"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
              );
            })}
            {sessions.length === 0 && !loadingSessions && (
              <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Nenhuma sessão adicional encontrada.</div>
            )}
          </div>
        )}
      </div>

      <div style={{ height: 1, background: "var(--border-subtle)" }} />
      
      {/* Account Logout */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: 0 }}>Remoção de Conta</h3>
        <p style={{ fontSize: 14, color: "var(--text-normal)", margin: 0 }}>Desativar sua conta fará com que você precise fazer login novamente no OrganicCord.</p>
        <div>
          <button 
            onClick={() => {
              if (activeAccountId) logoutAccount(activeAccountId);
            }}
            style={{
              background: "transparent",
              color: "var(--status-danger)",
              border: "1px solid var(--status-danger)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 16px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Sair (Logout)
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* EDIT PROFILE MODAL (PERSONALIZAÇÃO DE PERFIL)                */}
      {/* ============================================================ */}
      {currentAccount && false && isEditingProfile && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(4px)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          animation: "fadeIn 150ms ease"
        }}>
          <div style={{
            background: "var(--bg-primary)",
            borderRadius: "var(--radius-lg)",
            width: "100%",
            maxWidth: 820,
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            border: "1px solid var(--border-subtle)"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "20px 24px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--bg-secondary)"
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-normal)", display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles size={20} color="var(--brand-500)" />
                  Personalizar Perfil de Usuário
                </h3>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Personalize como outros usuários veem você no Discord e no OrganicCord.
                </span>
              </div>
              <button 
                onClick={() => setIsEditingProfile(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, borderRadius: "50%" }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Modal Content: 2-Column Layout (Form Left, Live Preview Right) */}
            <div style={{ display: "flex", flex: 1, overflowY: "auto", padding: 24, gap: 24 }}>
              {/* Form Controls (Left Column) */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Display Name Input */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                    Nome de Exibição (Display Name)
                  </label>
                  <input
                    type="text"
                    value={editGlobalName}
                    onChange={(e) => setEditGlobalName(e.target.value)}
                    placeholder={currentAccount!.username}
                    maxLength={32}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-normal)",
                      fontSize: 14,
                      outline: "none"
                    }}
                  />
                </div>

                {/* About Me (Bio) Textarea */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                    Sobre Mim (Bio)
                  </label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Conte um pouco sobre você..."
                    rows={4}
                    maxLength={190}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-normal)",
                      fontSize: 14,
                      outline: "none",
                      resize: "none",
                      fontFamily: "inherit"
                    }}
                  />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", marginTop: 4 }}>
                    {190 - editBio.length} caracteres restantes
                  </div>
                </div>

                {/* Avatar Controls */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                    Foto de Perfil (Avatar)
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => void selectImage("avatar")}
                      style={{
                        background: "var(--brand-500)",
                        color: "#fff",
                        border: "none",
                        padding: "8px 14px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <Upload size={14} /> Trocar Foto
                    </button>
                    {(newAvatarData !== null || currentAccount!.avatar) && (
                      <button
                        onClick={() => {
                          setNewAvatarData("");
                          setAvatarPreviewUrl(null);
                        }}
                        style={{
                          background: "transparent",
                          color: "var(--status-danger)",
                          border: "1px solid var(--status-danger)",
                          padding: "8px 14px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6
                        }}
                      >
                        <Trash2 size={14} /> Remover Foto
                      </button>
                    )}
                  </div>
                </div>

                {/* Banner Controls */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span>Banner do Perfil</span>
                    {hasNitro ? (
                      <span style={{ color: "#f47fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Zap size={12} fill="#f47fff" /> Nitro Ativo
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 600 }}>
                        Requer Nitro
                      </span>
                    )}
                  </label>

                  {!hasNitro && (
                    <div style={{
                      background: "rgba(244, 127, 255, 0.08)",
                      border: "1px solid rgba(244, 127, 255, 0.25)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      marginBottom: 10,
                      fontSize: 12,
                      color: "var(--text-normal)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8
                    }}>
                      <Zap size={16} color="#f47fff" style={{ flexShrink: 0 }} />
                      <div>
                        <strong>Recurso exclusivo do Nitro:</strong> Imagens de banner só são visíveis para contas com Discord Nitro. Usuários sem Nitro utilizam a Cor do Banner.
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        if (!hasNitro) {
                          setSaveError("Banners de imagem personalizados exigem assinatura ativa do Discord Nitro.");
                          return;
                        }
                        void selectImage("banner");
                      }}
                      style={{
                        background: hasNitro ? "var(--brand-500)" : "var(--bg-tertiary)",
                        color: hasNitro ? "#fff" : "var(--text-muted)",
                        border: "none",
                        padding: "8px 14px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: hasNitro ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <Upload size={14} /> Trocar Banner {hasNitro ? "" : "(Nitro)"}
                    </button>
                    {(newBannerData !== null || (bannerHash && hasNitro)) && (
                      <button
                        onClick={() => {
                          setNewBannerData("");
                          setBannerPreviewUrl(null);
                        }}
                        style={{
                          background: "transparent",
                          color: "var(--status-danger)",
                          border: "1px solid var(--status-danger)",
                          padding: "8px 14px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6
                        }}
                      >
                        <Trash2 size={14} /> Remover Banner
                      </button>
                    )}
                  </div>
                </div>

                {/* Accent Color Picker */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                    Cor do Banner (Accent Color)
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span aria-hidden="true" style={{ width: 40, height: 40, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", background: editAccentColor, flexShrink: 0 }} />
                    <input
                      type="text"
                      value={editAccentColor}
                      onChange={(e) => setEditAccentColor(e.target.value)}
                      placeholder="#5865f2"
                      maxLength={7}
                      style={{
                        width: 120,
                        padding: "8px 12px",
                        background: "var(--bg-tertiary)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-normal)",
                        fontSize: 13,
                        textTransform: "uppercase"
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Live Profile Card Preview (Right Column) */}
              <div style={{ width: 300, display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Pré-visualização ao Vivo
                </span>

                <div style={{
                  background: "var(--bg-secondary)",
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  border: "1px solid var(--border-subtle)",
                  position: "relative"
                }}>
                  {/* Banner Preview */}
                  <div style={{
                    height: 100,
                    background: (hasNitro && (bannerPreviewUrl || (newBannerData !== "" && bannerUrl)))
                      ? `url(${bannerPreviewUrl || bannerUrl}) center/cover no-repeat` 
                      : editAccentColor,
                    transition: "all 0.2s ease"
                  }} />

                  {/* Avatar Preview: Circular 50% radius */}
                  <div style={{ padding: "16px", position: "relative" }}>
                    <div style={{
                      position: "absolute",
                      top: -40,
                      left: 16,
                      borderRadius: "50%",
                      border: "6px solid var(--bg-secondary)",
                      background: "var(--bg-secondary)",
                      overflow: "hidden",
                      width: 80,
                      height: 80
                    }}>
                      {avatarPreviewUrl ? (
                        <img src={avatarPreviewUrl!} alt="Avatar preview" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                      ) : newAvatarData === "" ? (
                        <div style={{ width: "100%", height: "100%", background: "var(--brand-500)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 28, borderRadius: "50%" }}>
                          {currentAccount!.username[0]?.toUpperCase()}
                        </div>
                      ) : (
                        <Avatar
                          userId={currentAccount!.user_id}
                          avatarHash={currentAccount!.avatar}
                          username={currentAccount!.username}
                          size={80}
                          square={false}
                        />
                      )}
                    </div>

                    <div style={{ marginTop: 42 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-normal)" }}>
                        {editGlobalName.trim() || currentAccount!.username}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                        {currentAccount!.username}
                      </div>

                      {editBio.trim() && (
                        <div style={{
                          marginTop: 12,
                          padding: "8px 12px",
                          background: "var(--bg-tertiary)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: 13,
                          color: "var(--text-normal)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word"
                        }}>
                          {editBio}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "16px 24px",
              background: "var(--bg-secondary)",
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div>
                {saveError && (
                  <div style={{ color: "var(--status-danger)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertCircle size={16} /> {saveError}
                  </div>
                )}
                {saveSuccess && (
                  <div style={{ color: "var(--status-positive)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    <Check size={16} /> Perfil atualizado no Discord com sucesso!
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={() => setIsEditingProfile(false)}
                  disabled={savingProfile}
                  style={{
                    background: "transparent",
                    color: "var(--text-normal)",
                    border: "none",
                    padding: "10px 20px",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 500
                  }}
                  className="hover-bg-modifier"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  style={{
                    background: "var(--brand-500)",
                    color: "#fff",
                    border: "none",
                    padding: "10px 24px",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    opacity: savingProfile ? 0.7 : 1
                  }}
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="spin" size={16} /> Salvando...
                    </>
                  ) : (
                    <>
                      <Check size={16} /> Salvar Alterações
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isEditingProfile && (
        <ProfileCustomizationModal
          account={currentAccount}
          hasNitro={hasNitro}
          bannerUrl={bannerUrl}
          bannerHash={bannerHash}
          avatarPreviewUrl={avatarPreviewUrl}
          bannerPreviewUrl={bannerPreviewUrl}
          newAvatarData={newAvatarData}
          newBannerData={newBannerData}
          editGlobalName={editGlobalName}
          editBio={editBio}
          editAccentColor={editAccentColor}
          saving={savingProfile}
          saveError={saveError}
          saveSuccess={saveSuccess}
          onSelectAvatar={() => void selectImage("avatar")}
          onSelectBanner={() => void selectImage("banner")}
          onClose={() => setIsEditingProfile(false)}
          onSave={handleSaveProfile}
          onGlobalNameChange={setEditGlobalName}
          onBioChange={setEditBio}
          onAccentColorChange={setEditAccentColor}
          onRemoveAvatar={() => { setNewAvatarData(""); setAvatarPreviewUrl(null); }}
          onRemoveBanner={() => { setNewBannerData(""); setBannerPreviewUrl(null); }}
        />
      )}
    </div>
  );
}

