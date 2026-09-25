# Correção end-to-end: áudio recebido e saída Bluetooth

## 1. RTP, transporte e DAVE

- [x] Separar tamanho do cabeçalho AEAD e tamanho da extensão RTP criptografada.
- [x] Remover a extensão RTP descriptografada antes de entregar o frame ao DAVE.
- [x] Rejeitar extensões truncadas sem panic e com telemetria limitada.
- [x] Cobrir AES-GCM e XChaCha20-Poly1305, com e sem extensão RTP.

## 2. Reprodução e dispositivos

- [x] Não declarar reprodução pronta se o stream de saída não abrir.
- [x] Expor o dispositivo realmente aberto e qualquer fallback do Windows.
- [x] Trocar a saída durante a chamada sem reiniciar Gateway, UDP ou DAVE.
- [x] Preservar a recepção UDP ao reconstruir somente o stream CPAL.
- [x] Reconfigurar taxa de amostragem/canais com segurança ao trocar de dispositivo.

## 3. Interface e diagnóstico

- [x] Exibir saída ativa, fallback e erro de reprodução na chamada.
- [x] Registrar primeiro pacote UDP, transporte, DAVE, Opus e PCM consumido.
- [x] Manter logs sem tokens, chaves ou conteúdo de áudio.

## 4. Validação

- [x] Rustfmt, Clippy e testes Rust.
- [x] TypeScript, ESLint, testes e build web.
- [x] Chamada real com outra conta falando e prova de PCM reproduzido.
- [ ] Testar saída Bluetooth e troca durante a chamada.
- [x] Gerar instalador e SHA-256 após as validações automatizadas e a chamada real.
