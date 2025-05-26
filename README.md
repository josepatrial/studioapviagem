# Rota Certa - App de Viagens para Motoristas

Este é um projeto Next.js para o aplicativo "Rota Certa", focado na gestão de viagens para motoristas, com funcionalidades offline e sincronização de dados.

## Primeiros Passos

Para iniciar o desenvolvimento ou explorar o código:
1.  Verifique o arquivo `src/app/page.tsx` como ponto de entrada da aplicação.
2.  As configurações do Firebase podem ser encontradas em `src/lib/firebase.ts` e as variáveis de ambiente em `.env`.
3.  Os principais componentes da interface estão em `src/components/` e as páginas em `src/app/`.

## Funcionalidades

*   Login e Autenticação de Usuários (Motoristas e Administrador)
*   Gerenciamento de Viagens (Criação, Edição, Status)
*   Registro de Visitas, Despesas e Abastecimentos por viagem
*   Armazenamento de dados local (IndexedDB) para operação offline
*   Sincronização de dados com Firebase Firestore
*   Painel Administrativo com visão consolidada e filtros
*   Gerenciamento de Tipos de Visita e Despesa pelo Administrador
