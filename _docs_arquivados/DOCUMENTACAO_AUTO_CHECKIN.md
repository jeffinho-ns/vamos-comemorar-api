# Documentação: Auto Check-in Seguro via QR Code

## 📋 Visão Geral

Este documento descreve a implementação do sistema de **Auto Check-in Seguro via QR Code** com validação de geolocalização para prevenir fraudes.

## 🎯 Objetivo

Permitir que o "Dono da Lista" e seus convidados façam check-in automaticamente usando seus celulares, mas **apenas se estiverem fisicamente no local do evento**.

## 🔒 Requisitos de Segurança (Anti-Fraude)

1. **Validação de Geolocalização:** O check-in só pode ser confirmado se as coordenadas GPS do celular estiverem dentro de um raio de **200 metros** das coordenadas do estabelecimento.

2. **Validação Temporal:** O check-in só é permitido se a data/hora atual estiver dentro do horário do evento/reserva.

3. **Identificação:** O convidado deve informar o **Nome completo** exato que está na lista para validar.

## 🏗️ Arquitetura

### Front-end (Next.js)

#### 1. Nova Página de Auto Check-in
**Arquivo:** `app/checkin/[token]/page.tsx`

- Solicita permissão de localização do navegador
- Captura coordenadas GPS (`latitude`, `longitude`)
- Exibe formulário para o convidado informar nome ou e-mail
- Envia requisição para o backend com: `{ token, email/name, latitude, longitude }`
- Exibe feedback de sucesso ou erro

#### 2. Atualização da Página da Lista
**Arquivo:** `app/lista/[token]/page.tsx`

- Exibe QR Code que aponta para `/checkin/${token}`
- Mostra barra de progresso visual: "X/Y convidados confirmados"
- Atualiza status dos convidados (mostra quem já fez check-in)

### Back-end (Node.js/Express)

#### Endpoint: `POST /api/checkins/self-validate`

**Arquivo:** `routes/checkinsSelfValidate.js`

**Body:**
```json
{
  "token": "ABC123",
  "name": "João Silva",            // Nome completo exatamente como está na lista
  "latitude": -23.5505199,
  "longitude": -46.6333094
}
```

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "message": "Check-in realizado com sucesso! 🎉",
  "guest": {
    "id": 123,
    "name": "João Silva",
    "checked_in": true,
    "checkin_time": "2025-01-20T15:30:00.000Z"
  }
}
```

**Respostas de Erro:**

- **400** - Dados inválidos ou convidado já fez check-in
- **403** - Fora do local (distância > 200m) ou fora do horário
- **404** - Lista não encontrada ou convidado não encontrado na lista
- **410** - Link expirado
- **500** - Erro interno do servidor

## 🔧 Lógica de Validação (Backend)

### Passo 1: Buscar a Lista
```sql
SELECT gl.id, gl.reservation_id, gl.reservation_type, gl.expires_at
FROM guest_lists gl
WHERE gl.shareable_link_token = $1
```

### Passo 2: Buscar Coordenadas do Estabelecimento
```sql
-- Para reservas grandes (large_reservations)
SELECT lr.reservation_date, lr.reservation_time, p.latitude, p.longitude
FROM large_reservations lr
LEFT JOIN eventos e ON lr.evento_id = e.id
LEFT JOIN places p ON e.id_place = p.id
WHERE lr.id = $1

-- Para reservas de restaurante (restaurant_reservations)
SELECT rr.reservation_date, rr.reservation_time, p.latitude, p.longitude
FROM restaurant_reservations rr
LEFT JOIN eventos e ON rr.evento_id = e.id
LEFT JOIN places p ON e.id_place = p.id
WHERE rr.id = $1
```

### Passo 3: Validação Temporal
- Verifica se a data/hora atual está dentro do horário do evento
- Permite check-in até 2 horas após o horário do evento

### Passo 4: Validação de Geolocalização (Fórmula de Haversine)
```javascript
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Raio da Terra em metros
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distância em metros
}

// Se distância > 200m, retornar erro 403
```

### Passo 5: Buscar Convidado na Lista
```sql
-- Busca por nome (case-insensitive)
SELECT id, name, checked_in, checkin_time
FROM guests
WHERE guest_list_id = $1 AND LOWER(name) = LOWER($2)
LIMIT 1
```

**Nota:** A busca é feita apenas por nome completo. O nome deve ser informado exatamente como aparece na lista de convidados.

### Passo 6: Atualizar Status do Convidado
```sql
UPDATE guests
SET checked_in = TRUE, checkin_time = CURRENT_TIMESTAMP
WHERE id = $1
```

## 📦 Dependências

### Front-end
- `qrcode.react` - Geração de QR Codes
- `react-toastify` - Notificações toast (já existente)

### Back-end
- Nenhuma dependência adicional necessária (usa Express e PostgreSQL)

## 🚀 Instalação e Configuração

### 1. Front-end

```bash
cd vamos-comemorar-next
npm install qrcode.react
```

### 2. Back-end

1. Adicionar a rota no `server.js`:
```javascript
const checkinsSelfValidateRoutes = require('./routes/checkinsSelfValidate');
app.use('/api/checkins', checkinsSelfValidateRoutes(pool));
```

2. O arquivo `routes/checkinsSelfValidate.js` já está criado e pronto para uso.

### 3. Banco de Dados

Certifique-se de que a tabela `guests` possui os campos:
- `checked_in` (BOOLEAN, default: false)
- `checkin_time` (TIMESTAMP, nullable)
- `email` (VARCHAR, nullable) - para permitir busca por e-mail

## 🧪 Testes

### Teste Manual

1. Acesse a página da lista: `/lista/{token}`
2. Verifique se o QR Code é exibido
3. Escaneie o QR Code com um celular
4. Permita acesso à localização
5. Informe nome ou e-mail do convidado
6. Clique em "Validar Presença"
7. Verifique se o check-in foi realizado com sucesso

### Teste de Validação de Distância

1. Tente fazer check-in estando a mais de 200m do estabelecimento
2. Deve retornar erro 403: "Você não está no local do evento"

### Teste de Validação Temporal

1. Tente fazer check-in fora do horário do evento
2. Deve retornar erro 403: "Check-in só é permitido dentro do horário do evento"

## 📝 Notas Importantes

1. **Preservação do Código Existente:** A implementação é **aditiva** e não altera a lógica existente de check-in manual da recepcionista.

2. **Coordenadas do Estabelecimento:** Se o estabelecimento não tiver coordenadas cadastradas, o sistema não bloqueará o check-in, mas registrará um aviso no log.

3. **Segurança:** O sistema valida tanto a localização quanto o horário, garantindo que apenas pessoas presentes no local e no horário correto possam fazer check-in.

4. **Compatibilidade:** Funciona com ambos os tipos de reserva:
   - `restaurant_reservations` (reservas de restaurante)
   - `large_reservations` (reservas grandes)

## 🔄 Fluxo Completo

```
1. Dono da Lista acessa /lista/{token}
   ↓
2. Visualiza QR Code e barra de progresso
   ↓
3. Convidado escaneia QR Code
   ↓
4. Navegador solicita permissão de localização
   ↓
5. Convidado informa nome/e-mail
   ↓
6. Frontend envia: { token, name, latitude, longitude }
   ↓
7. Backend valida:
   - Lista existe e não expirou
   - Está dentro do horário do evento
   - Está dentro do raio de 200m
   - Convidado existe na lista
   - Convidado ainda não fez check-in
   ↓
8. Backend atualiza: checked_in = TRUE, checkin_time = NOW()
   ↓
9. Frontend exibe mensagem de sucesso
   ↓
10. Barra de progresso é atualizada automaticamente
```

## 🐛 Troubleshooting

### QR Code não aparece
- Verifique se `qrcode.react` foi instalado
- Verifique se `checkInUrl` está sendo gerado corretamente

### Erro "Permissão de localização negada"
- O usuário precisa permitir acesso à localização no navegador
- Instruções são exibidas na página

### Erro "Você não está no local"
- Verifique se as coordenadas do estabelecimento estão cadastradas
- Verifique se o dispositivo tem GPS ativado
- Tente novamente em uma área com melhor sinal de GPS

### Check-in não atualiza na lista
- Verifique se a API está retornando `checked_in: true`
- Verifique se a página está recarregando os dados após o check-in

## 📞 Suporte

Para dúvidas ou problemas, consulte:
- Código-fonte: `app/checkin/[token]/page.tsx` (frontend)
- Código-fonte: `routes/checkinsSelfValidate.js` (backend)
- Documentação da API: Este arquivo

---

**Última atualização:** Janeiro 2025

