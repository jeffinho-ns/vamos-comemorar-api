# Como Testar o Check-in Automático

## 🧪 Modo de Teste (Sem Validação de Geolocalização)

Para testar o check-in automático sem estar no local do evento, você tem duas opções:

### Opção 1: Variável de Ambiente (Recomendado para desenvolvimento)

1. Crie ou edite o arquivo `.env` na raiz do projeto `vamos-comemorar-api`:

```bash
SKIP_GEO_VALIDATION=true
SKIP_TIME_VALIDATION=true  # Opcional: também desabilita validação de horário
```

2. Reinicie o servidor para aplicar as mudanças:

```bash
# Se estiver usando nodemon, ele reinicia automaticamente
# Caso contrário, pare e inicie novamente
npm start
```

3. Agora você pode testar o check-in de qualquer lugar!

### Opção 2: Parâmetro na Requisição (Para testes pontuais)

Ao fazer a requisição de check-in, adicione o parâmetro `skip_geo_validation: true`:

```javascript
// Exemplo de requisição para teste
fetch('https://vamos-comemorar-api.onrender.com/api/checkins/self-validate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    token: 'SEU_TOKEN_AQUI',
    name: 'Nome do Convidado',
    latitude: -23.5505199,  // Qualquer coordenada
    longitude: -46.6333094,  // Qualquer coordenada
    skip_geo_validation: true,  // ⚠️ Apenas para testes!
    skip_time_validation: true   // ⚠️ Apenas para testes! (opcional)
  })
})
```

## 📋 Passos para Testar

1. **Obter o token da lista:**
   - Acesse a página da lista: `/lista/[token]`
   - O token está na URL

2. **Acessar a página de check-in:**
   - Acesse: `/checkin/[token]`
   - Ou escaneie o QR Code da lista

3. **Preencher o formulário:**
   - Nome: deve ser exatamente como está na lista de convidados
   - Localização: será capturada automaticamente (ou use qualquer coordenada se estiver testando via API)

4. **Verificar resultado:**
   - Se tudo estiver correto, você verá: "Check-in realizado com sucesso! 🎉"
   - Se houver erro, verá a mensagem específica

## ⚠️ Importante

- **NUNCA** deixe `SKIP_GEO_VALIDATION=true` ou `SKIP_TIME_VALIDATION=true` em produção!
- Use apenas para desenvolvimento e testes
- As validações de geolocalização e horário são importantes para segurança

## 🔍 Verificar se está em Modo de Teste

O servidor irá logar avisos quando as validações estiverem desabilitadas:

```
⚠️ [MODO TESTE] Validação de geolocalização desabilitada para teste
⚠️ [MODO TESTE] Validação de horário desabilitada para teste
```

## 🧹 Limpar Modo de Teste

Para voltar ao modo normal (com todas as validações):

1. Remova ou comente as linhas do `.env`:
```bash
# SKIP_GEO_VALIDATION=true
# SKIP_TIME_VALIDATION=true
```

2. Reinicie o servidor

## 📝 Exemplo Completo de Teste via cURL

```bash
curl -X POST https://vamos-comemorar-api.onrender.com/api/checkins/self-validate \
  -H "Content-Type: application/json" \
  -d '{
    "token": "SEU_TOKEN_AQUI",
    "name": "Nome do Convidado",
    "latitude": -23.5505199,
    "longitude": -46.6333094,
    "skip_geo_validation": true,
    "skip_time_validation": true
  }'
```

## 🎯 Validações que Ainda Funcionam em Modo de Teste

Mesmo com as validações desabilitadas, as seguintes validações continuam ativas:

1. ✅ Token válido e não expirado
2. ✅ Nome do convidado existe na lista
3. ✅ Convidado ainda não fez check-in
4. ✅ Validação de horário (a partir da hora da reserva até o final do dia seguinte) - **a menos que `skip_time_validation=true`**

