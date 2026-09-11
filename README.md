# 関節炎スクリーニングAIアプリ

医療機関スタッフが手指を撮影し、AIで関節炎のスクリーニング結果を管理するアプリケーションです。管理者は医療機関とスタッフを管理します。患者の氏名などの個人情報は保持しません。

## 構成

| ディレクトリ | 内容 | デプロイ |
|---|---|---|
| `web/` | Next.js アプリ | Vercel（Root Directory は `web`） |
| `ai-api/` | FastAPI 推論 API | Cloud Build → Artifact Registry → Cloud Run |
| `contract/` | 関節炎スクリーニング API（`/v1/ra-screening`）の OpenAPI と fixtures | — |
| `docs/` | 契約の解説 | — |

`web/` は Next.js、`ai-api/` は FastAPI です。契約の正は [`contract/`](./contract/) です。解説は [docs/ai_api_contract.md](./docs/ai_api_contract.md) です。

## 起動

Web:

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

詳細は [web/README.md](./web/README.md) です。

推論 API（任意。`.pt` が必要です）:

```bash
cd ai-api
export AI_API_KEY=local-dev-key
export SUPABASE_STORAGE_HOSTS=127.0.0.1
uvicorn api:app --host 127.0.0.1 --port 8080
```

詳細は [ai-api/README.md](./ai-api/README.md) です。`web/.env.local` の `AI_API_URL` が未設定ならモック解析を使います。実推論を見るときは `AI_API_URL` と `AI_API_KEY` をこの API に向けてください。

## デプロイ

| 対象 | 先 |
|---|---|
| `web/` | Vercel。Root Directory を `web` にする |
| `ai-api/` | `ai-api/cloudbuild.yaml` で重みをイメージに焼き込み、Cloud Run へ出す |

手順の詳細は [web/README.md](./web/README.md) と [ai-api/README.md](./ai-api/README.md) です。
