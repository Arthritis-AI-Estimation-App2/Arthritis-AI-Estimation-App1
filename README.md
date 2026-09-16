# 関節炎スクリーニングAIアプリ

医療機関スタッフが手指を撮影し、AIによる関節炎スクリーニング結果を管理するアプリです。管理者は医療機関、スタッフ、撮影・解析データを管理します。

患者の氏名や診断名は保存せず、撮影記録は匿名の被験者IDでまとめます。

## 構成

| ディレクトリ | 内容 | デプロイ先 |
|---|---|---|
| [`web/`](./web/) | Next.js、Supabase（DB・認証・Storage） | Vercel（Root Directory: `web`） |
| [`ai-api/`](./ai-api/) | FastAPI、AI推論 | Cloud Build → Cloud Run |
| [`contract/`](./contract/) | `/v1/ra-screening` のOpenAPIとfixtures（契約の正本） | — |
| [`docs/`](./docs/) | API契約の解説 | — |

Webは署名付き画像URLをAI APIへ渡し、AI APIはBearer認証後に画像を取得して推論します。`AI_API_URL` が未設定なら、Webはモック解析を使います。

APIの詳細は [OpenAPI](./contract/openapi.yaml) と [契約の解説](./docs/ai_api_contract.md) を参照してください。

## ローカル起動

まずWebを起動します。

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Supabaseの準備と環境変数は [WebのREADME](./web/README.md) を参照してください。

実推論も確認する場合は、別のターミナルでAI APIを起動します。学習済み重み `.pt` は別途必要です。

```bash
cd ai-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-test.txt
export AI_API_KEY=local-dev-key
export SUPABASE_STORAGE_HOSTS=127.0.0.1
uvicorn api:app --host 127.0.0.1 --port 8080
```

そのうえで `web/.env.local` に次を設定します。

```env
AI_API_URL=http://127.0.0.1:8080
AI_API_KEY=local-dev-key
```

重みの配置やAPI単体の確認方法は [AI APIのREADME](./ai-api/README.md) を参照してください。

## 重要な設定

- `SUPABASE_SECRET_KEY` と `AI_API_KEY` はサーバー専用です。`NEXT_PUBLIC_` を付けたり、ブラウザへ渡したりしないでください。
- 手画像は非公開Storageに保存します。スタッフは撮影時のアップロードのみ、管理者は認可済み画面から閲覧・削除できます。
- WebとAI APIの `AI_API_KEY` は同じ値にします。AI APIでは `SUPABASE_STORAGE_HOSTS` に画像取得を許可するSupabaseホストだけを設定します。
- 新規DBには `web/supabase/schema.sql`、既存DBには未適用の個別マイグレーションを番号順に適用します。既存データのあるDBへ `migration_v2.sql` を無条件に適用しないでください。
- 学習済み重み `.pt`、APIキー、患者情報をGitへ追加しないでください。

## デプロイ

初回は次の順で準備します。

1. [WebのREADME](./web/README.md#supabaseの準備) に従ってSupabaseを準備する。
2. [AI APIのREADME](./ai-api/README.md#cloud-runへデプロイ) に従ってAI APIをCloud Runへデプロイする。
3. VercelでRoot Directoryを `web` にし、[Webの環境変数](./web/README.md#環境変数)を登録してデプロイする。

Webだけの変更ではAI APIの再デプロイは不要です。モデルまたは `ai-api/` を変更した場合だけAI APIを再デプロイします。DB変更時は、Webのデプロイ前に対象環境へマイグレーションを適用してください。
