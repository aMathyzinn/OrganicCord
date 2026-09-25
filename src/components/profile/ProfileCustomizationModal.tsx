import { AlertCircle, BadgeCheck, Check, Eye, FileText, Image as ImageIcon, Loader2, Palette, Sparkles, Trash2, Upload, UserRound, X, Zap } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { StoredAccount } from "@/types";

type Props = {
  account: StoredAccount;
  hasNitro: boolean;
  bannerUrl: string | null;
  bannerHash?: string | null;
  avatarPreviewUrl: string | null;
  bannerPreviewUrl: string | null;
  newAvatarData: string | null;
  newBannerData: string | null;
  editGlobalName: string;
  editBio: string;
  editAccentColor: string;
  saving: boolean;
  saveError: string;
  saveSuccess: boolean;
  onSelectAvatar: () => void;
  onSelectBanner: () => void;
  onClose: () => void;
  onSave: () => void;
  onGlobalNameChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onAccentColorChange: (value: string) => void;
  onRemoveAvatar: () => void;
  onRemoveBanner: () => void;
};

export function ProfileCustomizationModal({
  account, hasNitro, bannerUrl, bannerHash, avatarPreviewUrl, bannerPreviewUrl,
  newAvatarData, newBannerData, editGlobalName, editBio, editAccentColor,
  saving, saveError, saveSuccess, onSelectAvatar, onSelectBanner, onClose,
  onSave, onGlobalNameChange, onBioChange, onAccentColorChange, onRemoveAvatar,
  onRemoveBanner,
}: Props) {
  const displayName = editGlobalName.trim() || account.username;
  const previewBanner = hasNitro && newBannerData !== "" ? bannerPreviewUrl || bannerUrl : null;
  const previewBackground = previewBanner
    ? `url(${previewBanner}) center / cover no-repeat`
    : editAccentColor || "var(--brand-500)";

  return (
    <div className="profile-customization-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="profile-customization-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-customization-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="profile-customization-sidebar">
          <div className="profile-customization-sidebar-banner" style={{ background: previewBackground }} />
          <div className="profile-customization-sidebar-content">
            <div className="profile-customization-avatar">
              {avatarPreviewUrl ? (
                <img src={avatarPreviewUrl} alt="Nova foto de perfil" />
              ) : newAvatarData === "" ? (
                <span>{account.username[0]?.toUpperCase()}</span>
              ) : (
                <Avatar userId={account.user_id} avatarHash={account.avatar} username={account.username} size={96} square={false} />
              )}
            </div>
            <h2>{displayName}</h2>
            <p>@{account.username}</p>
            <div className="profile-customization-status"><span /> Disponível</div>
            <div className="profile-customization-sidebar-rule" />
            <span className="profile-customization-eyebrow">SOBRE MIM</span>
            <p className="profile-customization-bio">{editBio.trim() || "Escreva algo para que as pessoas conheçam você."}</p>
            <button type="button" className="profile-customization-message" disabled>
              <UserRound size={16} /> Seu perfil
            </button>
          </div>
        </aside>

        <main className="profile-customization-main">
          <header className="profile-customization-header">
            <div>
              <div className="profile-customization-title-row">
                <Sparkles size={19} />
                <h1 id="profile-customization-title">Personalizar perfil</h1>
              </div>
              <p>Defina como seu perfil aparece para outras pessoas.</p>
            </div>
            <button type="button" className="profile-customization-close" onClick={onClose} aria-label="Fechar personalização">
              <X size={22} />
            </button>
          </header>

          <div className="profile-customization-tabs" aria-label="Seções do perfil">
            <span className="is-active">Personalização</span>
            <span>Prévia pública</span>
          </div>

          <div className="profile-customization-scroll">
            <section>
              <span className="profile-customization-eyebrow">IDENTIDADE</span>
              <div className="profile-customization-fields">
                <label htmlFor="profile-display-name">
                  Nome de exibição
                  <input id="profile-display-name" value={editGlobalName} onChange={(event) => onGlobalNameChange(event.target.value)} placeholder={account.username} maxLength={32} />
                </label>
                <label htmlFor="profile-bio">
                  Sobre mim <small>{190 - editBio.length} restantes</small>
                  <textarea id="profile-bio" value={editBio} onChange={(event) => onBioChange(event.target.value)} placeholder="Conte um pouco sobre você..." maxLength={190} rows={3} />
                </label>
              </div>
            </section>

            <section className="profile-customization-preview-section">
              <div className="profile-customization-section-heading">
                <div>
                  <span className="profile-customization-eyebrow">PRÉVIA DE PERSONALIZAÇÃO</span>
                  <p>Veja como seu cartão será exibido.</p>
                </div>
                <span className="profile-customization-example"><Eye size={14} /> EXEMPLO</span>
              </div>
              <div className="profile-customization-preview-card" style={{ '--profile-accent': editAccentColor } as React.CSSProperties}>
                <div className="profile-customization-preview-banner" style={{ background: previewBackground }} />
                <div className="profile-customization-preview-content">
                  <div className="profile-customization-preview-user">
                    <div className="profile-customization-preview-avatar">
                      {avatarPreviewUrl ? <img src={avatarPreviewUrl} alt="" /> : <Avatar userId={account.user_id} avatarHash={newAvatarData === "" ? null : account.avatar} username={account.username} size={62} square={false} />}
                    </div>
                    <strong>{displayName}</strong><span>@{account.username}</span>
                  </div>
                  <div className="profile-customization-preview-about">
                    <span className="profile-customization-eyebrow">SOBRE MIM</span>
                    <p>{editBio.trim() || "Seu texto de apresentação aparecerá aqui."}</p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <span className="profile-customization-eyebrow">DESTAQUES DA PERSONALIZAÇÃO</span>
              <div className="profile-customization-options">
                <button type="button" className="profile-customization-option" onClick={onSelectBanner} disabled={!hasNitro}>
                  <ImageIcon /><strong>Banner</strong><span>{hasNitro ? "Escolha uma imagem para o topo do perfil." : "Disponível com Discord Nitro."}</span>
                </button>
                <div className="profile-customization-option profile-customization-color-option">
                  <Palette /><strong>Tema e acentos</strong><span>Uma cor que destaca seu cartão.</span>
                  <div className="profile-customization-color-row" aria-label="Escolher cor de destaque">
                    {["#5865f2", "#23a55a", "#f0b232", "#ed4245", "#eb459e"].map((color) => (
                      <button key={color} type="button" className={editAccentColor.toLowerCase() === color ? "is-selected" : ""} style={{ background: color }} onClick={() => onAccentColorChange(color)} aria-label={`Usar ${color}`} />
                    ))}
                  </div>
                  <input value={editAccentColor} onChange={(event) => onAccentColorChange(event.target.value)} aria-label="Código hexadecimal da cor" maxLength={7} />
                </div>
                <button type="button" className="profile-customization-option" onClick={onSelectAvatar}>
                  <BadgeCheck /><strong>Avatar</strong><span>Atualize sua foto de perfil.</span>
                </button>
                <div className="profile-customization-option profile-customization-option-static">
                  <FileText /><strong>Cartão de perfil</strong><span>Bio e identidade organizadas em um layout moderno.</span>
                </div>
              </div>
            </section>

            <section className="profile-customization-actions">
              <div>
                <span className="profile-customization-eyebrow">ARQUIVOS</span>
                <div className="profile-customization-file-actions">
                  <button type="button" onClick={onSelectAvatar}><Upload size={15} /> Trocar avatar</button>
                  {(newAvatarData !== null || account.avatar) && <button type="button" className="is-danger" onClick={onRemoveAvatar}><Trash2 size={15} /> Remover</button>}
                  {hasNitro && <button type="button" onClick={onSelectBanner}><Upload size={15} /> Trocar banner</button>}
                  {(newBannerData !== null || (bannerHash && hasNitro)) && <button type="button" className="is-danger" onClick={onRemoveBanner}><Trash2 size={15} /> Remover banner</button>}
                </div>
              </div>
              {!hasNitro && <p className="profile-customization-nitro"><Zap size={15} /> Banners de imagem exigem Discord Nitro.</p>}
            </section>
          </div>

          <footer className="profile-customization-footer">
            <div aria-live="polite">
              {saveError && <span className="profile-customization-error"><AlertCircle size={16} /> {saveError}</span>}
              {saveSuccess && <span className="profile-customization-success"><Check size={16} /> Perfil atualizado com sucesso!</span>}
            </div>
            <div>
              <button type="button" className="profile-customization-cancel" onClick={onClose} disabled={saving}>Cancelar</button>
              <button type="button" className="profile-customization-save" onClick={onSave} disabled={saving}>
                {saving ? <><Loader2 className="spin" size={16} /> Salvando...</> : <><Check size={16} /> Salvar alterações</>}
              </button>
            </div>
          </footer>
        </main>
      </section>
    </div>
  );
}
