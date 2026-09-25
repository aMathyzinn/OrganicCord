# Checklist de lançamento

Este documento define a condição mínima para promover uma versão. Uma build verde não substitui os testes manuais.

## Evidência local da `0.2.0-beta.1` — 18/09/2026

- frontend reinstalado do zero, auditado e compilado com Node 24;
- TypeScript sem `any` explícito, lint sem avisos e bundle principal com 389,54 kB (89,40 kB gzip);
- 7 testes de permissões no frontend e 8 testes Rust aprovados;
- Rust formatado e Clippy com `-D warnings`;
- `npm audit`: 0 vulnerabilidades;
- `cargo audit`: 0 vulnerabilidades e 8 avisos transitivos permitidos. Os avisos de `glib` são exclusivos da árvore Linux; os de `unic-*` vêm do Tauri e `instant` vem da implementação DAVE/OpenMLS;
- instalador NSIS local reproduzível, porém ainda não assinado;
- varredura básica dos arquivos rastreados não encontrou padrão de token, chave privada ou client secret. A checagem completa de histórico/artefatos com Gitleaks continua pendente.

Esses resultados comprovam a base local, não o comportamento em contas e redes reais nem a build exata que será publicada.

## Automação e reprodutibilidade

- [x] versões iguais em `package.json`, `Cargo.toml` e `tauri.conf.json`;
- [x] instalação limpa com `npm ci`;
- [x] `npm audit`, lint, tipos e build sem erro ou aviso;
- [x] formatação, Clippy, testes Rust e `cargo audit` aprovados;
- [ ] CI aprovado no commit exato da tag;
- [x] dependências vendorizadas com licença e justificativa documentadas;
- [ ] repositório e artefatos verificados contra segredos e dados pessoais.

## Distribuição Windows

- [ ] certificado Authenticode válido configurado fora do repositório;
- [ ] executável e instalador assinados e verificados após a assinatura;
- [ ] hashes SHA-256 publicados junto da release;
- [ ] instalação, primeira abertura, atualização e desinstalação testadas em Windows 10 e 11 limpos;
- [ ] SmartScreen, WebView2 e dependências nativas validados;
- [ ] canal de avisos de segurança habilitado;
- [ ] se houver atualizador, manifesto, endpoint, chave pública e rollback validados antes de ativá-lo.

## Contas, mensagens e permissões

- [ ] login, reautenticação, troca de conta e logout sem exposição da credencial;
- [ ] servidor, DM e grupo testados com estados vazio, carregando, erro e sem permissão;
- [ ] enviar, editar, excluir, responder, reagir e anexar arquivos;
- [ ] canais de texto, fórum e threads;
- [ ] reconexão do Gateway após perda de rede, suspensão e troca de conta;
- [ ] permissões conferidas com owner, administrator, `@everyone`, cargo, membro e sobrescritas de canal;
- [ ] rate limit 429 e limite global testados sem repetição agressiva.

## Voz e DAVE

- [ ] chamadas 1:1 e salas com 2, 3 e 5 participantes;
- [ ] entrada e saída padrão e alternativas, inclusive 44,1 kHz e 48 kHz;
- [ ] mute, deafen, troca de dispositivo e desconexão;
- [ ] redes com perda, jitter, reconexão e sessão contínua de pelo menos 30 minutos;
- [ ] participantes entrando e saindo, SSRC alterado e múltiplas fontes simultâneas;
- [ ] negociação DAVE entre clientes compatíveis e falha fechada quando a cifra não puder ser estabelecida;
- [ ] consumo de CPU, memória, atraso e qualidade registrados em hardware fraco e intermediário.

## Produto e acessibilidade

- [x] onboarding deixa claro que o cliente é não oficial e experimental;
- [x] nenhum botão ou texto promete recurso indisponível;
- [x] configurações persistem e mostram erro quando uma alteração falha;
- [ ] notificações respeitam a preferência do usuário;
- [ ] navegação completa por teclado, foco visível, contraste e zoom de 200%;
- [ ] janelas estreitas, 1366x768 e alta densidade verificadas;
- [ ] estados offline, vazios e de erro têm ação de recuperação;
- [ ] textos públicos, screenshots e vídeo de lançamento correspondem à build publicada.

## Critério de promoção

- **Beta pública:** todos os itens de automação, segurança, instalação e fluxos principais concluídos; limitações de compatibilidade claramente publicadas.
- **1.0:** Beta estabilizada com uso real, sem defeitos críticos abertos, matriz de voz aprovada, distribuição assinada e processo de atualização/rollback comprovado.
