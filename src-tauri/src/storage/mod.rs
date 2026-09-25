use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use keyring::Entry;
use zeroize::{Zeroize, Zeroizing};

const SERVICE_NAME: &str = "OrganicCord";
const KEY_ENTRY: &str = "encryption_key";

/// Obtém ou cria a chave de criptografia AES-256 armazenada no keychain do OS.
fn get_or_create_key() -> Result<Zeroizing<Vec<u8>>> {
    let entry = Entry::new(SERVICE_NAME, KEY_ENTRY).map_err(|e| anyhow!("Keyring error: {}", e))?;

    match entry.get_password() {
        Ok(mut stored) => {
            let key = BASE64.decode(&stored)?;
            stored.zeroize();
            if key.len() != 32 {
                return Err(anyhow!("Invalid key length"));
            }
            Ok(Zeroizing::new(key))
        }
        Err(keyring::Error::NoEntry) => {
            let mut key = Zeroizing::new(vec![0u8; 32]);
            OsRng.fill_bytes(&mut key);
            let encoded = Zeroizing::new(BASE64.encode(&*key));
            entry
                .set_password(&encoded)
                .map_err(|e| anyhow!("Could not store key: {}", e))?;
            Ok(key)
        }
        Err(error) => Err(anyhow!(
            "Não foi possível acessar o cofre seguro do sistema: {error}"
        )),
    }
}

/// Criptografa um token Discord usando AES-256-GCM.
/// Retorna: base64(nonce || ciphertext)
pub fn encrypt_token(token: &str) -> Result<String> {
    let key_bytes = get_or_create_key()?;
    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(key_bytes.as_slice());
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, token.as_bytes())
        .map_err(|_| anyhow!("Encryption failed"))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(combined))
}

/// Descriptografa um token Discord.
pub fn decrypt_token(encrypted: &str) -> Result<String> {
    let key_bytes = get_or_create_key()?;
    let key = aes_gcm::Key::<Aes256Gcm>::from_slice(key_bytes.as_slice());
    let cipher = Aes256Gcm::new(key);

    let combined = BASE64.decode(encrypted)?;
    if combined.len() < 12 {
        return Err(anyhow!("Invalid encrypted data"));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| anyhow!("Decryption failed — invalid token or corrupted data"))?;

    String::from_utf8(plaintext).map_err(|e| anyhow!("UTF-8 error: {}", e))
}

/// Extrai os últimos 4 caracteres do token para exibição segura.
pub fn token_last_four(token: &str) -> String {
    let chars: Vec<char> = token.chars().collect();
    if chars.len() >= 4 {
        chars[chars.len() - 4..].iter().collect()
    } else {
        "****".to_string()
    }
}
