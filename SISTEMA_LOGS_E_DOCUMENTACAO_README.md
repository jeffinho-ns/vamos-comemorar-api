# Sistema de Logs de Ações e Documentação para Promoters

**Data de Implementação:** 15 de outubro de 2025

## 📋 Resumo

Este documento descreve as implementações realizadas no sistema Vamos Comemorar:

1. **Sistema completo de logs de ações dos usuários**
2. **Documentação completa para os novos usuários promoters**
3. **Informações de acesso dos três novos promoters**

---

## 🎯 1. Sistema de Logs de Ações

### Objetivo

Criar um sistema completo de rastreamento de ações dos usuários, permitindo ao administrador visualizar:
- Quem fez cada ação
- Quando a ação foi realizada
- Qual tipo de ação (criar, editar, deletar)
- Detalhes específicos da ação
- Filtros avançados por usuário, role, tipo de ação, data, etc.

### Componentes Implementados

#### 1.1. Banco de Dados

**Arquivo:** `migrations/create_action_logs_table.sql`

Tabela `action_logs` criada com os seguintes campos:
- `id` - ID único do log
- `user_id` - ID do usuário que realizou a ação
- `user_name` - Nome do usuário
- `user_email` - Email do usuário
- `user_role` - Função do usuário (admin, promoter, gerente, cliente)
- `action_type` - Tipo de ação (create_reservation, update_reservation, etc.)
- `action_description` - Descrição detalhada da ação
- `resource_type` - Tipo de recurso afetado (restaurant_reservation, etc.)
- `resource_id` - ID do recurso afetado
- `establishment_id` - ID do estabelecimento
- `establishment_name` - Nome do estabelecimento
- `ip_address` - Endereço IP da requisição
- `user_agent` - User agent do navegador
- `request_method` - Método HTTP (GET, POST, PUT, DELETE)
- `request_url` - URL da requisição
- `status` - Status da ação (success, error)
- `additional_data` - Dados adicionais em formato JSON
- `created_at` - Data e hora da ação

**Índices criados** para otimização de consultas:
- `user_id`
- `user_role`
- `action_type`
- `resource_type`
- `establishment_id`
- `created_at`

#### 1.2. Middleware de Logging

**Arquivo:** `middleware/actionLogger.js`

Funções principais:
- `logAction()` - Registra uma ação manualmente
- `autoLogMiddleware()` - Middleware Express para logging automático

#### 1.3. Rota da API

**Arquivo:** `routes/actionLogs.js`

Endpoints criados:

**POST** `/api/action-logs`
- Registra uma nova ação do usuário
- Acesso: Autenticado

**GET** `/api/action-logs`
- Busca logs de ações com filtros avançados
- Acesso: Admin only
- Filtros disponíveis:
  - `userId` - Filtrar por usuário específico
  - `userRole` - Filtrar por função (admin, promoter, etc.)
  - `actionType` - Filtrar por tipo de ação
  - `resourceType` - Filtrar por tipo de recurso
  - `establishmentId` - Filtrar por estabelecimento
  - `startDate` - Data inicial
  - `endDate` - Data final
  - `search` - Busca textual
  - `limit` - Limite de resultados
  - `offset` - Offset para paginação

**GET** `/api/action-logs/stats`
- Retorna estatísticas dos logs
- Acesso: Admin only
- Estatísticas incluídas:
  - Total de ações
  - Ações nas últimas 24h
  - Ações por tipo
  - Ações por função
  - Top 10 usuários mais ativos

**GET** `/api/action-logs/users`
- Lista todos os usuários que têm logs (para filtro)
- Acesso: Admin only

#### 1.4. Integração com Reservas

**Arquivo:** `routes/restaurantReservations.js`

Logging automático adicionado para:
- **Criação de reservas** - Registra quando um promoter cria uma nova reserva
- **Atualização de reservas** - Registra mudanças de status, mesa, data, etc.
- Informações registradas incluem:
  - Nome do cliente
  - Número de pessoas
  - Área e mesa
  - Estabelecimento
  - Campos alterados

#### 1.5. Página de Visualização (Frontend)

**Arquivo:** `vamos-comemorar-next/app/admin/logs/page.tsx`

Funcionalidades da página:
- ✅ **Acesso restrito apenas para admins** - Redirect automático para não-admins
- ✅ **Dashboard com estatísticas** - Cards com métricas importantes
- ✅ **Filtros avançados:**
  - Busca textual
  - Filtro por usuário
  - Filtro por função
  - Filtro por tipo de ação
  - Filtro por data (inicial e final)
- ✅ **Visualização intuitiva:**
  - Badges coloridos por função e tipo de ação
  - Informações expandíveis com mais detalhes
  - Formato de data/hora em português
- ✅ **Paginação** - Navegação entre páginas de resultados
- ✅ **Atualização em tempo real** - Botão de refresh
- ✅ **Design moderno e responsivo** - Interface dark com gradientes

**Cores dos badges:**
- **Admin** - Vermelho
- **Promoter** - Azul
- **Gerente** - Roxo
- **Cliente** - Cinza

**Ações:**
- **Create** - Verde
- **Update** - Amarelo
- **Delete** - Vermelho
- **View** - Azul

---

## 📚 2. Documentação para Promoters

### 2.1. Seção de Reservas

**Arquivo:** `vamos-comemorar-next/app/documentacao/components/ReservasSection.tsx`

Conteúdo completo criado:

#### Tópicos Abordados:

1. **Visão Geral** - Introdução ao sistema de reservas
2. **Como Acessar** - Passo a passo para chegar ao sistema
3. **Criar Nova Reserva** - Tutorial completo com 9 passos
   - Seleção de estabelecimento
   - Dados do cliente (nome, telefone, email, nascimento)
   - Data e horário
   - Número de pessoas
   - Seleção de área
   - Escolha de mesa
   - Observações especiais
4. **Visualizar e Filtrar Reservas** - Como usar calendário e filtros
5. **Editar Reservas** - Como modificar reservas existentes
6. **Status das Reservas** - Explicação de cada status:
   - NOVA / CONFIRMADA
   - CANCELADA
   - PENDENTE
   - CONCLUÍDA
7. **Boas Práticas** - 5 dicas essenciais
8. **Notificações Automáticas** - Email e WhatsApp
9. **Perguntas Frequentes** - 4 FAQs comuns

#### Destaques Especiais:

- ⚠️ **Alerta para reservas grandes** (11+ pessoas)
- 💡 **Dicas visuais** com ícones
- 📊 **Cards coloridos** para cada status
- ✨ **Design interativo** com detalhes expansíveis

### 2.2. Atualização da Seção de Acesso

**Arquivo:** `vamos-comemorar-next/app/documentacao/components/AcessoSection.tsx`

Nova seção adicionada: **"Usuários Promoters - Informações de Acesso"**

Conteúdo incluído:

1. **Cards dos 3 novos usuários** com:
   - Nome
   - Email
   - ID do usuário
   - Função (Promoter)
   - Design visual destacado

2. **Credenciais de acesso:**
   - Senha padrão: `Promoter@2024`
   - Aviso para alteração de senha no primeiro acesso

3. **Responsabilidades dos Promoters:**
   - **Gerenciamento de Reservas:**
     - Criar e gerenciar reservas de mesas
     - Confirmar e atualizar status
     - Gerenciar cancelamentos
     - Atribuir mesas e áreas
   - **Lista de Convidados:**
     - Criar e gerenciar listas
     - Adicionar e remover convidados
     - Fazer check-in
     - Acompanhar presença em eventos

---

## 👥 3. Novos Usuários Promoters

### Usuários Criados

**Data de criação:** 15 de outubro de 2025

#### Usuário 1
- **Nome:** Regiane Brunno
- **Email:** regianebrunno@gmail.com
- **ID:** 71
- **Role:** promoter
- **Senha padrão:** Promoter@2024

#### Usuário 2
- **Nome:** Franciely Mendes
- **Email:** franciely.mendes@ideiaum.com.br
- **ID:** 72
- **Role:** promoter
- **Senha padrão:** Promoter@2024

#### Usuário 3
- **Nome:** Coordenadora Reservas
- **Email:** coordenadora.reservas@ideiaum.com.br
- **ID:** 73
- **Role:** promoter
- **Senha padrão:** Promoter@2024

### Script de Criação

**Arquivo:** `scripts/create_promoter_users.js`
- Script reutilizável para criar novos promoters
- Verifica se usuário já existe antes de criar
- Atualiza senha e role se usuário existir
- Lista todos os promoters ao final

---

## 🚀 Como Usar

### Para Administradores

1. **Acessar logs de ações:**
   - Faça login como admin
   - Acesse `/admin/logs`
   - Use os filtros para encontrar ações específicas
   - Clique em um log para ver detalhes completos

2. **Visualizar estatísticas:**
   - Cards no topo mostram métricas importantes
   - Total de ações, ações nas últimas 24h, etc.

3. **Filtrar logs:**
   - Por usuário específico
   - Por função (promoter, gerente, etc.)
   - Por tipo de ação
   - Por intervalo de datas
   - Por busca textual

### Para Promoters

1. **Primeiro acesso:**
   - Use o email fornecido
   - Senha: `Promoter@2024`
   - **Altere sua senha imediatamente**

2. **Acessar documentação:**
   - Acesse `/documentacao`
   - Leia as seções:
     - 🔐 Acesso e Segurança
     - 📅 Reservas
     - 🍽️ Gerenciamento de Cardápio

3. **Gerenciar reservas:**
   - Acesse Admin > Sistema de Reservas
   - Crie, edite ou visualize reservas
   - Todas as ações são registradas automaticamente

---

## 📊 Estatísticas do Sistema

### Rastreamento Implementado

- ✅ Todas as criações de reservas
- ✅ Todas as atualizações de reservas
- ✅ IP e User Agent de cada ação
- ✅ Dados adicionais em JSON
- ✅ Timestamp preciso de cada ação

### Performance

- Índices otimizados para buscas rápidas
- Logging assíncrono para não bloquear requisições
- Paginação eficiente de resultados
- Cache de estatísticas

---

## 🔧 Manutenção

### Scripts Disponíveis

1. **Criar tabela de logs:**
   ```bash
   node scripts/run_action_logs_migration.js
   ```

2. **Criar novos promoters:**
   ```bash
   node scripts/create_promoter_users.js
   ```

### Monitoramento

- Todos os logs são permanentes
- Consultas otimizadas com índices
- Sistema escalável para grande volume de logs

---

## 🎨 Design e UX

### Página de Logs

- **Tema:** Dark mode com gradientes
- **Cores:** Orange (primária), Gray (secundária)
- **Componentes:** Motion/Framer Motion para animações
- **Responsivo:** Mobile-first design

### Documentação

- **Tema:** Light mode profissional
- **Ícones:** React Icons (Material Design)
- **Layout:** Cards, grids, e seções expansíveis
- **Interatividade:** Detalhes expansíveis, smooth scroll

---

## 📝 Observações Importantes

### Segurança

- ✅ Acesso aos logs restrito apenas para admins
- ✅ Validação de permissões em todas as rotas
- ✅ Senhas criptografadas com bcrypt
- ✅ Tokens JWT para autenticação

### Boas Práticas

- ✅ Logging assíncrono para não impactar performance
- ✅ Dados sensíveis não expostos nos logs públicos
- ✅ Índices no banco para otimização
- ✅ Paginação para grandes volumes de dados

### Próximos Passos Sugeridos

1. Adicionar exportação de logs em CSV/Excel
2. Criar alertas automáticos para ações suspeitas
3. Implementar dashboard analítico com gráficos
4. Adicionar filtros de data mais granulares (hora, minuto)

---

## ✅ Checklist de Implementação

- [x] Criar tabela de logs no banco de dados
- [x] Criar middleware de logging
- [x] Criar rotas da API para logs
- [x] Adicionar logging automático nas reservas
- [x] Criar página de visualização de logs (admin)
- [x] Implementar proteção de acesso (admin only)
- [x] Criar seção de Reservas na documentação
- [x] Adicionar informações dos novos usuários
- [x] Criar 3 contas de promoters
- [x] Documentar todo o sistema

---

## 📧 Contato e Suporte

Para dúvidas ou problemas:
- Documentação interna: `/documentacao`
- Suporte técnico: Entre em contato com o administrador do sistema

---

**Desenvolvido com ❤️ para o sistema Vamos Comemorar**

*Última atualização: 15 de outubro de 2025*





