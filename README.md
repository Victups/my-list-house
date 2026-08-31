# Checklist da mudança

HTML estático + uma função serverless. O estado fica num Redis (Upstash), então
marcar no celular reflete no PC e vice-versa.

```
public/index.html   interface
api/state.js        GET (ler) e PUT (gravar com merge)
```

## Subir no Vercel

1. Sobe a pasta pro GitHub e importa no Vercel — ou, na raiz da pasta, `vercel`.
   Sem framework, sem build. Detecta `public/` e `api/` sozinho.

2. No projeto → **Storage** → **Upstash Redis** (Marketplace) → criar e conectar.
   Isso injeta `KV_REST_API_URL` e `KV_REST_API_TOKEN` automaticamente.

3. Em **Settings → Environment Variables**, cria `APP_PIN` com um valor qualquer
   (ex.: `4417`). Sem isso a URL fica aberta pra quem descobrir o endereço.

4. Redeploy. Na primeira abertura o app pede o PIN e guarda no aparelho.

## Como o sync funciona

Cada marcação guarda um timestamp. O `PUT` mescla o que veio do aparelho com o
que está no Redis e devolve o resultado — vence a alteração mais recente por
item. Dois aparelhos editando offline não sobrescrevem um ao outro.

Sem internet o app continua funcionando com o cache local (`localStorage`) e
sincroniza quando a conexão volta ou quando você abre a aba de novo.

## Custo

Free tier do Upstash: 256 MB e 30 mil comandos por dia. Uso pessoal disso aqui
não passa de algumas centenas por mês.

## Nota

`APP_PIN` é proteção simples, adequada pra uma lista de compras. Não use esse
mesmo padrão pra nada sensível.
