# OrganicCord 0.2.0-beta.1

Cliente desktop open source, multi-conta e não oficial para Discord, construído com Tauri, Rust, React e TypeScript.

> [!IMPORTANT]
> O Discord não oferece uma API pública e suportada para construir um cliente de usuário completo. O OrganicCord usa superfícies destinadas ao cliente oficial e pode parar de funcionar após mudanças do Discord. Não use o projeto para automação de contas, spam, coleta de dados ou self-bots. Para contas importantes, prefira o cliente oficial.

## Estado da Beta

Esta versão inicia a transição da Alpha para a Beta. Ela já inclui:

- sessões locais multi-conta, com tokens criptografados e chave protegida pelo sistema operacional;
- servidores, canais, mensagens, DMs, respostas, anexos, reações, digitação e presença;
- Gateway v10 com heartbeat, reconexão, retomada de sessão e tratamento de eventos em tempo real;
- permissões calculadas com sobreposições de servidor, cargo, membro e canal;
- chamadas de voz com Opus, entrada/saída selecionável, mute, deafen e DAVE fail-closed;
- notificações nativas, atalhos configuráveis e configurações de voz funcionais;
- detecção local de jogos e Rich Presence pela conta aberta no Discord Desktop;
- limites de requisição por rota/bucet e tratamento de limite global;
- CSP restritiva e envio de anexos por identificadores nativos temporários, sem expor caminhos arbitrários ao frontend.

Ainda não fazem parte do escopo desta Beta:

- vídeo remoto, compartilhamento de tela, Discord Activities embutidas, soundboard e Stage Channels;
- paridade total com o Discord oficial;
- suporte oficial a Linux e macOS;
- atualizador automático e distribuição pública assinada;
- garantia de compatibilidade futura com APIs privadas do Discord.

O transporte de voz e o DAVE possuem testes automatizados, mas uma versão pública ainda exige a matriz manual descrita em [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), incluindo testes reais entre diferentes contas, redes e dispositivos.

## Requisitos

- Windows 10 ou 11 com WebView2;
- Node.js 24;
- Rust 1.89.0 MSVC, fixado em `rust-toolchain`;
- ferramentas de compilação C++ do Visual Studio para o backend de áudio.

## Desenvolvimento

```bash
npm ci
npm run tauri:dev
```

Validação local completa:

```bash
npm audit
npm run lint
npm run type-check
npm test
npm run build
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
cargo audit
```

Gerar um instalador local não assinado:

```bash
npm run tauri:build
```

Não publique esse artefato como release oficial. A distribuição pública precisa cumprir os requisitos de assinatura, integridade e instalação limpa do [checklist de lançamento](RELEASE_CHECKLIST.md).

## Arquitetura e segurança

```text
React + Zustand
      │ comandos/eventos tipados do Tauri
Rust: sessão, Gateway, REST, permissões, voz e anexos
      │
Discord API v10 / Gateway / Voice
```

O frontend não recebe nem persiste tokens. O backend recupera a credencial apenas quando necessário, mantém os segredos fora dos eventos enviados à interface e apaga buffers sensíveis quando possível. Arquivos selecionados pelo usuário viram identificadores opacos, com tamanho máximo e expiração, antes do envio.

Isso reduz a superfície de ataque, mas não elimina o risco de usar uma conta em um cliente não oficial. Vulnerabilidades devem ser reportadas conforme [SECURITY.md](SECURITY.md).

## Contribuição

Leia [CONTRIBUTING.md](CONTRIBUTING.md). Mudanças de protocolo devem apontar para documentação oficial quando ela existir, incluir testes e evitar afirmar compatibilidade sem validação real.

## Licença

OrganicCord é distribuído sob a licença MIT. A cópia adaptada de `hpke-rs` em `src-tauri/vendor/hpke-rs` permanece sob MPL-2.0; consulte o arquivo `PATCH.md` desse diretório.
