# Política de Segurança

## Versões suportadas

Somente a Beta mais recente recebe correções de segurança. Versões Alpha antigas não devem ser usadas com contas reais.

## Como reportar

Não publique uma vulnerabilidade explorável em uma issue. Use um aviso de segurança privado do GitHub quando o recurso estiver habilitado no repositório. Até lá, entre em contato com o mantenedor por um canal privado já publicado no perfil do projeto, sem anexar tokens ou dados pessoais.

Inclua:

- versão e sistema operacional;
- impacto e pré-condições;
- passos mínimos para reprodução;
- logs sanitizados;
- sugestão de correção, se houver.

## Escopo prioritário

- exposição, persistência ou registro de credenciais;
- acesso indevido ao keyring ou armazenamento local;
- bypass de CSP, permissões Tauri ou comandos IPC;
- leitura ou envio de arquivos fora da seleção explícita do usuário;
- cálculo incorreto de permissões e ações não autorizadas;
- bypass de rate limit;
- downgrade ou falha aberta na proteção DAVE;
- execução de código ou injeção na interface.

O uso de APIs privadas do Discord é um risco de compatibilidade conhecido, mas falhas que ampliem acesso ou exponham dados continuam dentro do escopo.
