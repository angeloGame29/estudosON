# Como conectar o app ao Google Sheets

Isso leva uns 5 minutos e só precisa ser feito uma vez.

## 1. Crie a planilha
1. Acesse **sheets.google.com** e crie uma planilha em branco.
2. Dê um nome a ela, por exemplo **"Legislação — Dados"**.

## 2. Cole o código da API
1. No menu da planilha, vá em **Extensões → Apps Script**.
2. Apague todo o código de exemplo que aparece.
3. Abra o arquivo **CodigoAppsScript.gs** (que veio junto com este guia), copie tudo e cole no editor do Apps Script.
4. Clique no ícone de salvar (💾) e dê um nome ao projeto, por exemplo **"API Legislação"**.

## 3. Publique como "App da Web"
1. Clique em **Implantar → Nova implantação**.
2. Clique no ícone de engrenagem ⚙️ ao lado de "Selecionar tipo" e escolha **App da Web**.
3. Preencha:
   - **Executar como:** Eu (seu e-mail)
   - **Quem pode acessar:** Qualquer pessoa
4. Clique em **Implantar**.
5. O Google vai pedir autorização (é o seu próprio script). Clique em **Autorizar acesso**, escolha sua conta, e se aparecer um aviso de "app não verificado", clique em **Avançado → Acessar [nome do projeto] (não seguro)** — é seguro porque o código é o que você mesmo colou.
6. Copie a **URL do app da Web** que aparece no final (algo como `https://script.google.com/macros/s/AKfycb.../exec`).

## 4. Conecte no site de Legislação
1. Abra o `index.html`.
2. Toque no menu **⋯** no topo.
3. Clique em **🔗 Conectar ao Google Sheets**.
4. Cole a URL que você copiou e confirme.
5. A página recarrega e passa a mostrar **🟢 Conectado ao Google Sheets** no menu.

Pronto — a partir de agora, toda lei, curtida, favorito e comentário é salvo direto na sua planilha, na aba **"leis"** e **"comentarios"** (o Apps Script cria essas abas sozinho na primeira vez que você adicionar algo).

## Notas importantes

- **Quem tiver essa URL consegue ler e escrever nos seus dados** — não compartilhe publicamente. Se ela vazar, é só ir em Implantar → Gerenciar implantações → arquivar a implantação antiga e criar uma nova.
- O app verifica a planilha a cada ~6 segundos, então se você (ou outra pessoa usando a mesma URL) editar em um dispositivo, os outros dispositivos atualizam sozinhos em poucos segundos.
- Cada linha da aba guarda o conteúdo completo em uma coluna chamada `dados_json` — é assim que o app consegue reconstruir a lei com toda a formatação, notas e cores. As outras colunas (`titulo`, `categoria`, `status`, `curtidas`, `favorito`) ficam ali só pra você conseguir dar uma olhada rápida na planilha.
- Se quiser voltar a usar só o navegador (sem Sheets), abra o menu **⋯** e clique em **🔌 Desconectar do Google Sheets**.
- Se algo der errado, o menu mostra **🔴 Erro ao falar com o Google Sheets** — confira se a URL foi colada certinha e se a implantação ainda está "Ativa" no Apps Script.
