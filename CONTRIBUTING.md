# Contribuindo com o OrganicCord

Obrigado por ajudar a tornar o OrganicCord mais seguro e confiável.

## Antes de abrir uma mudança

- procure por uma issue existente e descreva o comportamento observado;
- mantenha o pull request focado em um único problema ou funcionalidade;
- nunca inclua tokens, cookies, IDs privados, gravações ou dados de outras pessoas;
- para falhas de segurança, siga o processo privado de [SECURITY.md](SECURITY.md).

## Padrão de implementação

- preserve a fronteira de segurança: credenciais e caminhos locais não devem chegar ao frontend;
- valide entradas no backend e trate falhas de rede de forma explícita;
- não simule sucesso, telemetria, status de conexão ou suporte a recursos incompletos;
- prefira módulos pequenos, tipos concretos e uma única fonte de verdade;
- explique em comentários apenas decisões que não sejam óbvias;
- inclua testes para o caminho feliz, falhas e limites relevantes.

Mudanças em REST, Gateway, OAuth2 ou voz devem citar documentação oficial quando disponível e registrar o teste manual realizado. APIs privadas não devem ser descritas como estáveis.

## Uso responsável

O projeto não aceita recursos para self-bots, automação de contas de usuário, spam, scraping, evasão de limites, abuso de permissões ou contorno de mecanismos de segurança. Integrações automatizadas devem usar bots e OAuth2 oficiais do Discord.

## Validação obrigatória

Antes de enviar um pull request:

```bash
npm ci
npm audit
npm run lint
npm run type-check
npm run build
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
cargo audit
```

Mudanças de interface também precisam ser conferidas em diferentes tamanhos de janela, com teclado, zoom aumentado, estados vazios, carregamento e erro.
