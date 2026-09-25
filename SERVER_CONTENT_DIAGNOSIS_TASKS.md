# Diagnóstico end-to-end: conteúdo dos servidores

## Escopo e sintoma

- [x] Confirmar visualmente que os servidores continuam presentes na barra lateral.
- [x] Separar o indicador de não lido do estado de seleção do servidor.
- [x] Mapear o fluxo completo entre clique, navegação, REST/Gateway, cache e renderização.
- [x] Não alterar o comportamento do produto durante a fase de reconhecimento.

Sintoma informado: servidores associados a um indicador de não lido ainda parecem carregar, enquanto outros ficam sem canais/conteúdo e sem feedback suficiente para distinguir servidor selecionado, vazio, carregando ou com falha.

## Fluxo real encontrado

1. `GuildSidebar` obtém os servidores de `cache.guilds[accountId]`.
2. O clique executa `setView("guilds")` e `setActiveGuild(guild.id)` independentemente de `hasUnread`.
3. `MainLayout` monta `ChannelSidebar` quando existe `activeGuildId`.
4. `ChannelSidebar` chama `fetchChannels(accountId, guildId)` somente quando a entrada de cache não existe ou existe um erro capturado naquela renderização.
5. `discordStore.fetchChannels` chama em paralelo:
   - `get_channels`, que busca `/api/v10/guilds/{guildId}/channels` e tenta anexar threads ativas;
   - `get_current_guild_member`, usado no cálculo de permissões;
   - depois envia a inscrição de guild ao Gateway.
6. O resultado REST é salvo em `cache.channels[guildId]`.
7. Somente depois disso o store compara `last_message_id` com o estado de leitura e cria entradas em `cache.unreads`.
8. `ChannelSidebar` agrupa os canais por categoria e renderiza a lista.

## Achados comprovados no código

- [x] O indicador de não lido não participa do `onClick` e não decide se os canais serão buscados.
- [x] A correlação observada é inversa: a bolinha pode surgir porque uma carga anterior de canais terminou e encontrou `last_message_id` não lido.
- [x] Um resultado vazio (`[]`) vira estado terminal. Como arrays vazios são truthy, novas montagens deixam de refazer a busca.
- [x] O cache de canais, loading e erros não é separado por conta. Duas contas no mesmo servidor podem compartilhar indevidamente dados, permissões e estado de requisição.
- [x] Erros antigos de `channels-{guildId}` não são limpos no início nem depois do sucesso.
- [x] `GUILD_CREATE` é recebido do Gateway, mas os `channels` eventualmente presentes no evento são ignorados; apenas emojis, cargos e o membro atual são aproveitados.
- [x] A UI não possui um marcador lateral próprio para servidor ativo. O único marcador lateral é o de não lido e ele desaparece quando o servidor fica ativo, o que torna seleção e falha visualmente ambíguas.
- [x] Um servidor sem canais e uma resposta REST vazia renderizam uma área vazia, sem estado explicativo nem ação de tentar novamente.
- [x] Não existem testes do fluxo `clicar no servidor -> buscar -> cachear -> renderizar`, nem casos de resposta vazia, troca rápida ou duas contas no mesmo servidor.

## Hipótese principal a validar com telemetria

O pipeline aceita uma resposta vazia ou incompleta como carga definitiva e deixa de tentar novamente. Servidores já hidratados são os mesmos com maior chance de possuir entradas de não lido, criando a aparência de que a bolinha habilita o conteúdo. A falta do marcador ativo e de um estado vazio/erro torna a falha indistinguível de um clique que não funcionou.

Ainda é necessário capturar, por servidor afetado, o status da requisição e a quantidade de canais recebida antes de declarar a causa externa exata (resposta vazia, erro HTTP, corrida ou cache cruzado).

## Tasklist de correção proposta

### 1. Observabilidade e reprodução determinística

- [x] Instrumentar `guild_selected`, `channels_request_started`, `channels_request_succeeded`, `channels_request_failed` e `channels_cache_committed` sem registrar token ou conteúdo de mensagens.
- [x] Registrar `accountId`, `guildId`, erro/status retornado, quantidade de canais, origem (`REST`, `GUILD_CREATE`, cache) e duração.
- [ ] Reproduzir com um servidor com bolinha e outro sem bolinha.
- [ ] Confirmar se o servidor afetado retorna vazio, falha ou tem a resposta descartada.

### 2. Modelo de estado escalável

- [x] Chavear canais, loading e erros por `accountId + guildId`.
- [x] Substituir o estado implícito por `idle | loading | ready | empty | error`.
- [x] Usar geração/ID de requisição para impedir commit de resposta obsoleta.
- [x] Limpar erro ao iniciar uma nova tentativa e no sucesso.
- [x] Não considerar resposta vazia como cache definitivo sem uma política de revalidação.

### 3. Hidratação resiliente

- [x] Aproveitar canais válidos recebidos em `GUILD_CREATE` como fonte inicial do cache.
- [x] Manter REST como revalidação/fallback, sem sobrescrever dados válidos por resposta vazia transitória.
- [x] Tratar `GUILD_CREATE` de guild indisponível separadamente.
- [x] Atualizar incrementalmente `CHANNEL_CREATE`, `CHANNEL_UPDATE`, `CHANNEL_DELETE` e threads, evitando refetch completo desnecessário.

### 4. Navegação e UX

- [x] Criar marcador visual próprio e persistente para o servidor ativo, separado do ponto de não lido.
- [x] Exibir skeleton durante a primeira carga.
- [x] Exibir estado vazio real com explicação e ação `Tentar novamente`.
- [x] Preservar a lista anterior durante revalidação para evitar painel piscando ou desaparecendo.
- [x] Garantir foco de teclado, `aria-current` e feedback de seleção.

### 5. Testes

- [ ] Testar seleção de servidor com e sem mensagens não lidas.
- [x] Testar resposta REST vazia seguida de sucesso.
- [x] Testar falha HTTP e retry.
- [x] Testar respostas concorrentes fora de ordem.
- [x] Testar duas contas que compartilham o mesmo servidor.
- [x] Testar fallback `GUILD_CREATE -> REST`, normalização do payload e eventos incrementais.
- [ ] Validar manualmente no executável instalado, não apenas no navegador de desenvolvimento.

### 6. Critério de conclusão

- [ ] Todo servidor selecionável mostra imediatamente o estado ativo.
- [ ] Canais aparecem independentemente de existir indicador de não lido.
- [ ] Falhas são visíveis e recuperáveis sem reiniciar o aplicativo.
- [ ] Nenhum cache de uma conta é usado por outra.
- [ ] Testes automatizados e validação no build instalado aprovados.
