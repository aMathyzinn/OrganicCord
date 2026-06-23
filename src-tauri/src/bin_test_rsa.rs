use rsa::{RsaPrivateKey, Oaep};
use spki::EncodePublicKey;

fn main() {
    let mut rng = rand::thread_rng();
    let priv_key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
    let pub_key = priv_key.to_public_key();
    let der = pub_key.to_public_key_der().unwrap();
    println!("Base64: {}", base64::encode(der.as_bytes()));
}
