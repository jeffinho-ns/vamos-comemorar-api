# Instruções para Deploy - Sistema de Lista de Convidados

## 1. Banco de Dados (MySQL)

Execute a migração SQL no banco de produção:

```sql
-- Arquivo: migrations/create_guest_lists_and_guests.sql
-- Execute este script no MySQL de produção

CREATE TABLE IF NOT EXISTS `guest_lists` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `reservation_id` int(11) NOT NULL,
  `reservation_type` enum('restaurant','large') NOT NULL DEFAULT 'large',
  `event_type` enum('aniversario','despedida','lista_sexta') DEFAULT NULL,
  `shareable_link_token` varchar(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_guest_lists_token` (`shareable_link_token`),
  KEY `idx_reservation` (`reservation_type`, `reservation_id`),
  KEY `idx_expires_at` (`expires_at`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `guest_list_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `whatsapp` varchar(30) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_guest_list_id` (`guest_list_id`),
  CONSTRAINT `fk_guests_guest_list` FOREIGN KEY (`guest_list_id`) REFERENCES `guest_lists` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## 2. Back-end (Render)

### Variáveis de Ambiente no Render:

```bash
# URL base do front-end (onde os links da lista de convidados devem apontar)
PUBLIC_BASE_URL=https://agilizaiapp.com.br

# Configurações do banco de dados MySQL
DB_HOST=193.203.175.55
DB_USER=u621081794_vamos
DB_PASSWORD=@123Mudar!@
DB_NAME=u621081794_vamos

# Configurações FTP (opcional, para upload de imagens)
FTP_HOST=195.35.41.247
FTP_USER=u621081794
FTP_PASSWORD=Jeffl1ma!@

# Porta do servidor (Render define automaticamente)
PORT=10000

# Ambiente
NODE_ENV=production
```

### Arquivos modificados no back-end:
- `server.js` - Registradas novas rotas
- `routes/guestListPublic.js` - Nova rota pública
- `routes/guestListsAdmin.js` - Novas rotas admin
- `routes/largeReservations.js` - Geração automática de guest_list

## 3. Front-end (Vercel)

### Variáveis de Ambiente no Vercel:

```bash
NEXT_PUBLIC_API_URL=https://vamos-comemorar-api.onrender.com
```

### Arquivos modificados no front-end:
- `app/reservar/ReservationForm.tsx` - Removida seleção de mesa para <10 pessoas, adicionada lógica sexta/sábado
- `app/lista/[token]/page.tsx` - Nova página pública para listas de convidados
- `app/admin/restaurant-reservations/page.tsx` - Nova aba "Lista de Convidados" no admin

## 4. Funcionalidades Implementadas

### Cliente (Front-end):
- ✅ Reservas <10 pessoas: cliente só escolhe área (admin define mesa)
- ✅ Reservas >=11 pessoas: 
  - Sexta-feira: opção de criar lista de convidados
  - Sábado: seleção entre "Aniversário" ou "Despedida"
- ✅ Link da lista gerado automaticamente e exibido após confirmação
- ✅ Página pública `/lista/[token]` com lista de convidados e botão WhatsApp

### Admin (Front-end):
- ✅ Nova aba "Lista de Convidados" no sistema de reservas
- ✅ Lista de titulares com dropdown/accordion
- ✅ CRUD completo de convidados (adicionar, editar, excluir)

### Back-end:
- ✅ Endpoints públicos para listas de convidados
- ✅ Endpoints admin protegidos para CRUD
- ✅ Geração automática de token único com expiração
- ✅ Integração com reservas grandes (>=11 pessoas)

## 5. URLs Importantes

- API: `https://vamos-comemorar-api.onrender.com`
- Front-end: `https://agilizaiapp.com.br`
- Lista pública: `https://agilizaiapp.com.br/lista/[token]`

## 6. Testes Recomendados

1. Criar reserva com >=11 pessoas em sexta-feira
2. Criar reserva com >=11 pessoas em sábado (selecionar tipo)
3. Verificar se o link é gerado e funciona
4. Testar a página pública da lista
5. Verificar se a aba admin carrega e funciona o CRUD
