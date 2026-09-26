# OrganicCord

Cliente desktop open source, leve e multi-conta para Discord no Windows. O OrganicCord reúne os fluxos sociais essenciais — conversas, servidores, voz, presença e notificações — em uma experiência nativa construída com Tauri, Rust, React e TypeScript.

> [!WARNING]
> O OrganicCord é um cliente **não oficial**. O Discord não oferece uma API pública e suportada para clientes de usuário completos, portanto mudanças no serviço podem afetar o funcionamento do app. Não use o projeto para automação de contas, spam, coleta de dados ou self-bots. Para contas críticas, mantenha o cliente oficial do Discord como alternativa.

## Status da versão

O projeto está na pré-release [`v0.2.0-beta.1`](https://github.com/aMathyzinn/OrganicCord/releases/tag/v0.2.0-beta.1). A Beta já cobre os fluxos centrais de comunicação e voz, mas não busca paridade total com o Discord oficial.

| Pronto para usar | Ainda em desenvolvimento |
| --- | --- |
| Mensagens, DMs, servidores, amigos e presença | Vídeo em chamadas |
| Chamadas de voz em DMs e canais de voz | Compartilhamento de tela / Go Live |
| Anexos, reações, respostas, enquetes e fóruns | Discord Activities, soundboard e Stage Channels |
| Notificações nativas, temas, atalhos e multi-conta | Atualizador automático e suporte oficial a Linux/macOS |

## Instalação no Windows

1. Baixe `OrganicCord_0.2.0-beta.1_x64-setup.exe` na [página de releases](https://github.com/aMathyzinn/OrganicCord/releases/tag/v0.2.0-beta.1).
2. Execute o instalador em um computador com Windows 10 ou 11 e WebView2.
3. Entre com a sua conta e conceda apenas as permissões necessárias para os recursos que escolher usar.

O instalador atual ainda não possui assinatura de código. O Windows pode exibir um aviso de editor desconhecido; valide que o arquivo foi baixado da release oficial e confira o hash antes de instalar. Não desative proteções do Windows para executar o aplicativo.

```powershell
Get-FileHash .\OrganicCord_0.2.0-beta.1_x64-setup.exe -Algorithm SHA256
```

Hash da `v0.2.0-beta.1`:

```text
7876C6E32CB914414A215C1160EBD8DB1623CE54D436AF279C075884F3DCAEA6
```

## O que você pode fazer

### Conversas e comunidades

- usar várias contas no mesmo aplicativo e alternar entre elas rapidamente;
- navegar por servidores, organizar servidores em pastas e acessar canais de texto, voz e fóruns;
- enviar, responder, editar e apagar suas mensagens;
- enviar arquivos, imagens e mensagens de voz;
- usar emojis, reações, enquetes, mensagens fixadas, pesquisa e formatação Markdown;
- conversar por DM, arquivar conversas, ver digitação, presença e perfis;
- gerenciar amigos, bloquear usuários e criar convites de servidor quando tiver permissão.

### Voz

- iniciar, receber, atender e recusar chamadas de voz em DMs;
- entrar e sair de canais de voz de servidores;
- escolher dispositivos de entrada e saída, testar o microfone e usar supressão de ruído RNNoise;
- mutar o microfone, ensurdecer o áudio e acompanhar participantes e o estado da conexão.

O transporte de voz usa Opus e só considera a conexão pronta após negociar o gateway de voz, transporte criptografado e a proteção DAVE. A interface não deve ser tratada como prova isolada de que uma chamada está conectada.

### Experiência no desktop

- receber notificações nativas do Windows, menções e indicadores de mensagens não lidas;
- silenciar servidores, canais ou pessoas por período definido;
- personalizar tema, contraste, densidade, tamanho de texto, ícone do app e atalhos;
- atualizar avatar, bio e cor do perfil; banners dependem da elegibilidade da conta no Discord;
- detectar jogos locais e publicar Rich Presence por meio do Discord Desktop aberto.

## Arquitetura

```text
React + TypeScript + Zustand
        │ interface e estado local
        ▼
Tauri 2 — comandos e eventos tipados
        │
Rust — sessão, REST, Gateway, permissões, voz e arquivos
        │
Discord API v10 · Gateway · Voice Gateway
```

| Camada | Responsabilidade |
| --- | --- |
| React + Zustand | Interface, navegação, cache de mensagens e estado de chamadas. |
| Tauri | Ponte tipada entre a interface e os recursos nativos do Windows. |
| Rust | Sessões, REST, Gateway, rate limits, permissões, áudio e manipulação de anexos. |
| Gateway v10 | Eventos em tempo real, heartbeat, reconexão e retomada de sessão. |
| Voz | Opus, dispositivos de áudio, RTP criptografado e negociação DAVE com comportamento fail-closed. |

As permissões são calculadas considerando servidor, cargos, membro e sobreposições de canal. Limites de requisição são controlados por rota e há tratamento separado para limite global.

## Segurança e privacidade

- O frontend não recebe nem armazena tokens de conta.
- Credenciais locais são criptografadas; a chave fica protegida pelo sistema operacional.
- Anexos selecionados no Windows viram identificadores temporários e opacos, com validade e tamanho limitados, antes de serem enviados.
- A Content Security Policy restringe origens de script, conexão, mídia e navegação embutida.
- Links externos passam por validação e confirmação antes de abrir no navegador padrão.

Essas medidas reduzem a superfície de ataque, mas não eliminam os riscos inerentes a um cliente não oficial. Consulte a [Política de Segurança](SECURITY.md) para reportar vulnerabilidades.

## Desenvolvimento

### Requisitos

- Windows 10 ou 11 com WebView2;
- Node.js 24 (`>=24 <25`);
- Rust `1.89.0` MSVC, fixado em [`rust-toolchain`](rust-toolchain);
- ferramentas de compilação C++ do Visual Studio para o backend de áudio.

### Executar localmente

```bash
npm ci
npm run tauri:dev
```

### Validar o projeto

```bash
npm run type-check
npm run lint
npm test
npm run build

cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
cargo audit
```

### Gerar um instalador NSIS local

```powershell
$env:CARGO_TARGET_DIR = "$PWD\src-tauri\target-installer"
npm run tauri:build -- --bundles nsis
```

Usar um diretório de build isolado evita conflito com uma instância do OrganicCord já aberta. Todo instalador deve ser verificado por versão, data e SHA-256 antes de distribuição.

## Documentação e contribuição

- [Contribuindo](CONTRIBUTING.md)
- [Política de Segurança](SECURITY.md)
- [Checklist de lançamento](RELEASE_CHECKLIST.md)
- [Repositório oficial](https://github.com/aMathyzinn/OrganicCord)
- [Portfólio do criador](https://damodara.xyz)

Mudanças de protocolo devem apontar para documentação oficial quando ela existir, incluir testes e evitar alegar compatibilidade sem evidência real de transporte, criptografia e mídia.

## Licença

OrganicCord é distribuído sob a licença MIT. A cópia adaptada de [`hpke-rs`](src-tauri/vendor/hpke-rs) permanece sob MPL-2.0; consulte o [`PATCH.md`](src-tauri/vendor/hpke-rs/PATCH.md) do componente.
