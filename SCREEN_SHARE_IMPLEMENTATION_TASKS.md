# OrganicCord Screen Share — Implementation Tasklist

Objetivo: transmitir a tela inteira em uma chamada de voz de servidor pelo OrganicCord e permitir que outro usuário assista pelo cliente oficial do Discord, sem interromper o áudio existente.

## Regras de implementação

- [x] Manter `VoiceSession` de áudio e `StreamSession` de vídeo independentes.
- [x] Não transportar frames pelo IPC React/Tauri.
- [x] Nunca registrar token de conta, token de stream ou SDP completo.
- [x] Implementar e validar cada gate antes de avançar ao seguinte.
- [x] Suportar servidor (`guild`) e chamada direta (`call`); áudio do sistema, câmera e recepção ficam fora do primeiro corte.

## Gate 0 — Contrato e arquitetura

- [x] Criar tipos fortes para o estado de `STREAM_CREATE`, `STREAM_SERVER_UPDATE` e da transmissão.
- [x] Adicionar comandos de Gateway para opcodes 18, 22 e 19.
- [x] Encaminhar os dispatches de stream ao gerenciador sem acoplar ao frontend.
- [x] Criar testes de correlação por `account_id` e `stream_key`; guild/DM e canal são validados contra a sessão de voz ativa.
- [x] Registrar transições estruturadas com credenciais redigidas.

Critério de saída: payloads testados localmente e nenhuma regressão nos testes do Gateway existente.

## Gate 1 — Alocação de Go Live

- [x] Criar `StreamManager` e `PendingStreamConnection`.
- [x] Expor comandos Tauri `start_screen_share` e `stop_screen_share`.
- [x] Enviar `STREAM_CREATE` e `STREAM_SET_PAUSED(false)` somente após voz conectada.
- [x] Processar `STREAM_CREATE` e `STREAM_SERVER_UPDATE` em qualquer ordem.
- [x] Tratar endpoint nulo, eventos repetidos, cancelamento e timeout.

Critério de saída: receber `stream_key`, `rtc_server_id`, endpoint e token temporário válidos em uma chamada de servidor.

## Gate 2 — Stream Voice Gateway + WebRTC

- [x] Abrir uma segunda conexão Voice Gateway v8 exclusiva do stream.
- [x] Reutilizar apenas o `session_id` da chamada de voz; não compartilhar estado mutável da sessão de áudio.
- [x] Negociar SDP com `protocol: webrtc` e codecs explícitos.
- [x] Tratar Hello, Ready, Session Description, heartbeat e encerramento.
- [x] Manter `PeerConnection` e tarefas sob cancelamento estruturado.

Critério de saída: WebRTC conectado com SSRC de vídeo e RTX conhecidos e heartbeats ativos.

## Gate 3 — DAVE de vídeo e fonte sintética

- [x] Criar `DaveSession` exclusiva usando o channel id derivado do `rtc_server_id`.
- [x] Implementar transições MLS do stream sem afetar a sessão de áudio.
- [x] Gerar H.264 Annex-B sintético em 640x360 e 15 FPS com `ORGANICCORD_STREAM_SOURCE=testsrc`.
- [x] Cifrar cada frame como `MediaType::VIDEO` antes da packetização.
- [x] Enviar opcode 12 de vídeo e alimentar RTP/RTCP.

Critério de saída: segunda conta vê o padrão sintético por dois minutos.

## Gate 4 — Captura da tela inteira

- [ ] Substituir o MVP baseado em FFmpeg/gdigrab por Windows Graphics Capture antes da distribuição pública.
- [ ] Implementar pipeline H.264 de baixa latência com aceleração por hardware e fallback seguro.
- [x] Limitar fila a um frame e descartar frames atrasados.
- [ ] Tratar resize, DPI, HDR/SDR, cursor e perda do dispositivo gráfico.
- [x] Usar a tela inteira como fonte padrão em 720p/30 no MVP local.

Critério de saída: outro usuário vê a tela inteira estável pelo cliente oficial.

## Gate 5 — UI e ciclo de vida

- [x] Adicionar estado de compartilhamento ao store sem misturá-lo ao estado de conexão da voz.
- [x] Ativar botão de compartilhar somente em voz de servidor conectada.
- [x] Exibir confirmação explícita da tela compartilhada e indicador persistente.
- [x] Implementar parar, falha e timeout com mensagens acionáveis.
- [x] Ao sair da chamada, interromper o stream antes de desmontar o áudio.

Critério de saída: iniciar/parar três vezes sem derrubar o áudio, sem socket ou task órfão.

## Gate 6 — Verificação para beta

- [x] Testes unitários de alocação, SDP, codecs e separação de frames H.264.
- [x] Testes de geração das chaves `guild:<guild>:<channel>:<user>` e `call:<channel>:<user>`.
- [ ] Teste de integração do handshake com servidor simulado.
- [x] `cargo fmt`, `cargo clippy`, testes Rust, testes frontend e build Tauri.
- [ ] Teste real com dois usuários em servidor.
- [x] Registrar limitações e risco de protocolo Discord não documentado.

Critério de saída: tela inteira visível, voz bidirecional preservada e encerramento limpo.

## Estado e limitações do MVP local

- A sinalização Go Live usa os opcodes de stream do cliente de usuário do Discord. Eles não fazem parte da documentação pública estável e podem mudar sem aviso.
- A captura atual exige `ffmpeg` disponível no `PATH` ou em `ORGANICCORD_FFMPEG_PATH`; o instalador ainda não distribui esse executável.
- O primeiro corte transmite apenas a imagem da área de trabalho em 720p/30. Áudio do sistema, seleção de janela, câmera e recepção de streams ficam fora deste gate.
- A captura usa `gdigrab` e `libx264` para chegar rapidamente ao teste real. Windows Graphics Capture e encoder por hardware continuam obrigatórios antes de uma versão pública.
- Nenhum token permanente, token temporário de stream ou SDP completo é enviado ao frontend ou gravado nos logs.

## Correção do erro 2012 no espectador

Diagnóstico confirmado pelo teste real: o cliente oficial recebia a sinalização da transmissão,
mas não estabelecia a conexão inicial de visualização. O OrganicCord ainda marcava o stream como
ativo após a primeira chamada de escrita no track, mesmo quando o WebRTC não tinha associado esse
track a um transporte conectado.

- [x] Impedir o estado `streaming` antes de `RTCPeerConnectionState::Connected`.
- [x] Iniciar captura/encoder somente depois da conexão WebRTC real.
- [x] Adicionar timeout dedicado à negociação WebRTC/ICE e erro acionável.
- [x] Registrar separadamente as transições do PeerConnection e ICE.
- [x] Preservar todos os candidatos ICE UDP de mídia enviados pelo Discord.
- [x] Negociar os extmaps 1/2/3 esperados pelo Go Live e habilitar TWCC no emissor.
- [ ] Confirmar com duas contas que o espectador passa do carregamento para vídeo reproduzindo.
- [ ] Manter a transmissão por dois minutos sem timeout, falha DAVE ou queda do áudio.

## Correção de SSRC e prova de mídia (segunda rodada)

Causa raiz encontrada no código real: `webrtc-rs 0.14` ignora `send_encodings` em
`add_transceiver_from_track`. O OrganicCord anunciava ao Discord os SSRCs atribuídos no
`READY`, mas o emissor RTP usava SSRCs aleatórios internos. A sinalização ficava verde no
cliente local, enquanto o espectador aguardava um fluxo que nunca chegava nos SSRCs anunciados.

- [x] Forçar áudio, vídeo e RTX a usarem exatamente os SSRCs recebidos no `READY`.
- [x] Reescrever o SDP local para anunciar os mesmos SSRCs realmente usados pelo emissor.
- [x] Anunciar apenas Opus e H.264, os codecs efetivamente implementados neste MVP.
- [x] Só marcar `streaming` depois de observar pacotes e bytes de vídeo nos stats WebRTC.
- [x] Registrar métricas periódicas de saída sem expor SDP ou credenciais.
- [x] Gerar a prévia local a partir da mesma captura usada pela transmissão.
- [x] Mostrar a transmissão em foco e os participantes em uma faixa compacta abaixo.
- [x] Cobrir SSRC, codecs, parser da prévia e mudança de estado com testes automatizados.
- [x] Executar testes Rust, frontend, lint, typecheck e build do instalador.
- [ ] Validar novamente com duas contas que o espectador deixa o carregamento infinito.

## Correção da negociação DAVE bloqueada

Diagnóstico do teste real: WebRTC conecta e o encoder inicia, mas a sessão fica em
`Aguardando criptografia da transmissão`. O stream divergia do pipeline de voz funcional:
ignorava a sequência das mensagens binárias no `seq_ack`, sinalizava uma transição como pronta
antes de processar o commit MLS e não recuperava commits/welcomes rejeitados.

- [x] Incluir a sequência das mensagens DAVE binárias no heartbeat do Voice Gateway.
- [x] Remover o `ready_for_transition` prematuro do opcode 21.
- [x] Enviar opcode 23 somente depois de processar commit/welcome com sucesso.
- [x] Enviar opcode 31 e recriar o pacote de chave após commit/welcome inválido.
- [x] Adicionar timeout e estados observáveis para cada etapa da negociação DAVE.
- [x] Testar parsing de sequência/opcode e as regras de prontidão da transição.
- [x] Rodar validação completa e regenerar o instalador.
- [ ] Confirmar DAVE pronto e vídeo visível com duas contas.
