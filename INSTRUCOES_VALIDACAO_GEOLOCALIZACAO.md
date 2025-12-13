# ⚠️ Instruções: Validação de Geolocalização

## Status Atual: DESABILITADA (Modo Teste)

A validação de geolocalização está **temporariamente desabilitada** para permitir testes.

## 📋 Como Habilitar/Desabilitar

### Opção 1: Via Render Dashboard (Recomendado)

1. Acesse o [Render Dashboard](https://dashboard.render.com)
2. Vá em **Environment** do serviço `vamos-comemorar-api`
3. Procure pela variável `SKIP_GEO_VALIDATION`
4. Para **HABILITAR** (ativar validação): Remova a variável ou defina como `false`
5. Para **DESABILITAR** (modo teste): Defina como `true`
6. Clique em **Save Changes**
7. O serviço será reiniciado automaticamente

### Opção 2: Via render.yaml

Edite o arquivo `render.yaml`:

**Para DESABILITAR (modo teste):**
```yaml
envVars:
  - key: SKIP_GEO_VALIDATION
    value: "true"
```

**Para HABILITAR (produção):**
```yaml
# Remova ou comente a linha:
# - key: SKIP_GEO_VALIDATION
#   value: "true"
```

Depois faça commit e push:
```bash
git add render.yaml
git commit -m "Habilitar validação de geolocalização"
git push
```

## ✅ Validações que Continuam Ativas

Mesmo com a geolocalização desabilitada, as seguintes validações continuam funcionando:

1. ✅ **Token válido** - O token da lista deve ser válido e não expirado
2. ✅ **Nome do convidado** - O nome deve existir na lista (case-insensitive)
3. ✅ **Check-in único** - Cada convidado só pode fazer check-in uma vez
4. ✅ **Validação de horário** - Check-in permitido a partir da hora da reserva até o final do dia seguinte

## 🔒 Segurança

- ⚠️ **NUNCA** deixe `SKIP_GEO_VALIDATION=true` em produção por muito tempo
- A validação de geolocalização é importante para prevenir fraudes
- Use apenas para testes e depois **HABILITE novamente**

## 📝 Logs

Quando a validação está desabilitada, você verá este log no console:

```
⚠️ [MODO TESTE] Validação de geolocalização desabilitada para teste
```

## 🎯 Próximos Passos

1. ✅ Testar o check-in com geolocalização desabilitada
2. ⏳ Verificar se tudo está funcionando corretamente
3. ⏳ **HABILITAR** a validação de geolocalização novamente após os testes

---

**Última atualização:** Configurado para modo teste (geolocalização desabilitada)

