# Diagnóstico de voz — OrganicCord

Executado em 18–19/09/2026. Este arquivo não contém tokens, chaves de sessão, tokens RTC, chaves de transporte ou payloads sensíveis.

## Fase 1 — reconhecimento

- [x] Mapear `PendingVoiceConnection` e todas as transições em `maybe_start`.
- [x] Mapear o envio de Opcode 4 no Gateway principal.
- [x] Mapear `VOICE_STATE_UPDATE` e `VOICE_SERVER_UPDATE`, inclusive `endpoint: null` e chamadas DM/GDM.
- [x] Confirmar a correlação por conta, tentativa, canal e conexão pendente.
- [x] Mapear handshake do Voice Gateway v8, UDP discovery, seleção de protocolo e heartbeats.
- [x] Mapear DAVE v1: Opcode 4 e opcodes 21–31.
- [x] Confirmar os caminhos de timeout, cancelamento e encerramento.

## Fase 2 — causa raiz e plano

### Evidência e causa raiz

1. O estado pendente era correlacionado somente por conta. Eventos atrasados de uma tentativa anterior podiam encerrar ou sobrescrever a tentativa atual.
2. Um `VOICE_STATE_UPDATE` intermediário com `channel_id: null` cancelava a tentativa. Em DM, esse evento pode existir durante troca ou realocação e não comprova falha da nova tentativa.
3. Um `VOICE_SERVER_UPDATE` parcial com `endpoint: null` apagava um endpoint válido recebido anteriormente. `maybe_start` então permanecia esperando indefinidamente.
4. Não havia timeout de alocação nem diagnóstico dos três pré-requisitos (`session_id`, token RTC e endpoint).
5. A interface aceitava eventos apenas por conta, portanto um evento atrasado podia alterar a chamada atual.
6. O Gateway principal usava o heartbeat legado de bot para uma sessão de usuário. No teste real isso invalidou a sessão e o Voice Gateway encerrou com `4006`.
7. O Voice Gateway v8 enviava heartbeat no formato antigo. A versão v8 requer `d.t` e `d.seq_ack`; o ACK retorna o timestamp em `d.t`.
8. O cliente só marcava a conexão como estabelecida depois de uma transição MLS/DAVE. Em chamada solo, a formação do grupo pode ficar pendente até outro participante entrar; a conexão Discord, porém, já está estabelecida após UDP discovery e `SELECT_PROTOCOL_ACK` com a chave de transporte.
9. Só havia implementação de AES-GCM, sem fallback XChaCha20-Poly1305 quando AES não é oferecido.

### Plano executado

- [x] Tornar a alocação parcial, idempotente e tolerante a eventos repetidos ou fora de ordem.
- [x] Preservar token/endpoint válidos quando o Discord enviar atualizações parciais.
- [x] Ignorar estado nulo intermediário e rejeitar estado de outro canal.
- [x] Correlacionar backend e frontend por `attempt_id`.
- [x] Adicionar timeout de alocação de 30 segundos com diagnóstico sem segredos.
- [x] Corrigir heartbeats do Gateway principal e Voice Gateway v8.
- [x] Separar conexão de transporte estabelecida de grupo MLS ainda pendente.
- [x] Manter DAVE ativo e continuar processando opcodes 21–31 após a conexão.
- [x] Implementar AES-GCM e fallback XChaCha20-Poly1305 para RTP.
- [x] Adicionar logs estruturados para cada transição relevante.

## Fase 3 — implementação

- [x] Cobrir `endpoint: null`, estado nulo e eventos fora de ordem com testes.
- [x] Cobrir o formato dos heartbeats dos dois Gateways.
- [x] Cobrir round-trip dos dois modos AEAD.
- [x] Limpar controles concluídos sem remover uma tentativa mais nova.
- [x] Impedir eventos de uma tentativa antiga de corromper a interface atual.
- [x] Aplicar as correções somente em voz, Gateway, áudio de voz, store e dependências necessárias.
- [x] Executar formatação, Clippy, testes Rust, lint, tipos e build do frontend.

## Fase 4 — teste prático

- [x] Criar harness opt-in e ignorado no CI, lendo a credencial somente da memória do processo.
- [x] Autenticar, abrir a DM de teste, tocar a chamada e enviar Opcode 4 no Gateway principal.
- [x] Receber `VOICE_STATE_UPDATE` com sessão e `VOICE_SERVER_UPDATE` com token/endpoint.
- [x] Receber Voice Gateway Opcode 8 (Hello), Opcode 2 (Ready) e Opcode 4 (Session Description).
- [x] Negociar `aead_aes256_gcm_rtpsize` e DAVE protocol version 1.
- [x] Receber o pacote MLS external sender (Opcode binário 25).
- [x] Confirmar ACK do Gateway principal.
- [x] Confirmar dois ACKs consecutivos do heartbeat do Voice Gateway (Opcode 6).
- [x] Atingir o estado backend `connected` sem falsificação de UI.
- [x] Encerrar a chamada de teste com Opcode 4 de saída e fechar os sockets.

### Resultado final observado

O teste real `live_dm_voice_reaches_dave_and_heartbeat_ack` passou em 18/09/2026 no horário de Brasília (19/09 em UTC). A conexão saiu da alocação, completou WebSocket + UDP discovery, negociou transporte AEAD e DAVE v1, atingiu `connected` e permaneceu ativa por pelo menos dois intervalos completos de heartbeat do Voice Gateway. A formação do grupo MLS permaneceu corretamente independente do estado de transporte durante a chamada solo; quando participantes entram, os opcodes DAVE continuam sendo processados pelo mesmo loop.
