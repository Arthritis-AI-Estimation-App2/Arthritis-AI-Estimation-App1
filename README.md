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

## 環境変数

### Web

ローカルでは `web/.env.example` を `web/.env.local` にコピーして設定する。本番ではVercelの対象環境の環境変数に登録し、変更後に再デプロイする。

| 変数 | 必須 | 用途・値の取得／作成方法 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 必須 | SupabaseプロジェクトのAPI URL（`https://<project-ref>.supabase.co`）。ローカルは `web/` で `npx supabase start` 後、`npx supabase status` のAPI URLを使う。 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 必須 | Supabaseの Settings > API Keys で Publishable key（`sb_publishable_...`）を取得する。未作成なら同画面で作成する。ローカルは `npx supabase status` のPublishable key（旧CLIではanon key）を使う。 |
| `SUPABASE_SECRET_KEY` | 必須 | 同じプロジェクトの Settings > API Keys で Secret key（`sb_secret_...`）を作成・取得する。ローカルは `npx supabase status` のSecret key（旧CLIではservice_role key）を使う。サーバー専用。 |
| `AI_API_URL` | 実推論時 | デプロイしたCloud RunのサービスURLを設定する（`/v1/ra-screening` は付けない）。ローカルは `http://127.0.0.1:8080`。未設定ならモック解析。 |
| `AI_API_KEY` | 実推論時 | 下記の手順で共有キーを作成し、AI APIと同じ値を設定する。Secret名ではなくキーの値を使う。サーバー専用。 |
| `AI_API_LOG_RESPONSE` | 任意 | 解析レスポンスをサーバーログへ出す場合だけ `true`。本番は通常 `false` または未設定。 |
| `ENABLE_DARK_MODE` | 任意 | OS設定に応じたダークモードを有効にする場合は `true`。`false` または未設定ではライト固定。 |

Supabaseの推奨キーは Publishable key / Secret key。従来の `anon` / `service_role` キーはレガシー形式で、単なる名称変更ではない。このアプリでは `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` と `SUPABASE_SECRET_KEY` にそれぞれのキーを設定する（[公式ドキュメント](https://supabase.com/docs/guides/getting-started/api-keys)）。

`SUPABASE_SECRET_KEY` と `AI_API_KEY` に `NEXT_PUBLIC_` を付けない。専用DBでRLSテストを行う場合の `TEST_SUPABASE_*` は [Web README](./web/README.md#rls--storage-統合テスト) を参照。

### AI API

ローカルでは起動前にシェルで `export` する（`.env` の自動読込はない）。Cloud Runでは `scripts/deploy-cloud-run.sh` が次の2変数を設定する。

| 変数 | 必須 | 用途・値の取得／作成方法 |
|---|---|---|
| `AI_API_KEY` | 必須 | 下記の手順で作成した共有キー。Cloud Runではデプロイスクリプトの第3引数にSecret名を渡し、Secret Managerの `latest` バージョンから注入する。Webの `AI_API_KEY` と一致させる。 |
| `SUPABASE_STORAGE_HOSTS` | 必須 | Webが使うSupabaseのURLからホスト名だけを取り出す（例: `PROJECT_REF.supabase.co`）。複数はカンマ区切り。デプロイスクリプトの第2引数に渡す。ローカルSupabaseは `127.0.0.1`。スキームやパスは含めない。 |

`PORT` はDockerfileで `8080` を既定値としており、デプロイスクリプトも同じポートを指定するため、手動設定は不要。

### 共有APIキーの作成（初回）

以下は `ai-api/` で実行する例。`PROJECT_ID` は対象のGoogle CloudプロジェクトIDに置き換える。生成ファイルの値をVercelの `AI_API_KEY` にも登録し、登録後に一時ファイルを削除する。キーやファイルをGitに追加しない。

```bash
umask 077
api_key_file=$(mktemp)
openssl rand -hex 32 | tr -d '\n' > "$api_key_file"
gcloud secrets create ra-ai-api-key --project=PROJECT_ID --replication-policy=automatic
gcloud secrets versions add ra-ai-api-key --project=PROJECT_ID --data-file="$api_key_file"
# 一時ファイルの値をVercelへ登録した後に実行
rm "$api_key_file"
```

Secretが既にある場合は `create` を省略する。キーを更新するときはWebとAI APIの両方を再デプロイし、同じ値に揃える。

## デプロイ

### Web（Vercel）

1. Vercel に Git リポジトリを連携し、Framework Preset を Next.js、Root Directory を `web` に設定する。
2. 対象環境の環境変数に `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY` を登録する。実推論を使う場合は `AI_API_URL`（Cloud Run のサービスURL）と `AI_API_KEY`（APIと同じ共有キー）も登録する。秘密キーに `NEXT_PUBLIC_` を付けない。
3. 初回は [Supabaseのセットアップ](./web/README.md#2-supabaseプロジェクトの準備) を行う。既存DBは未適用の個別マイグレーションを番号順に適用する。
4. Vercel で設定した Production Branch へ push して本番デプロイする。環境変数の変更後は再デプロイする。

`web/` に差分がない場合は `web/vercel.json` によりビルドをスキップする。Webのみの変更ではAI APIの再デプロイは不要。

### AI API（Cloud Run）

前提: Google Cloud CLIでログイン済みで、対象プロジェクトの課金・Cloud Build / Artifact Registry / Cloud Run / Secret Manager APIが有効であること。デプロイ実行者とCloud Buildに必要なIAM権限を設定し、共有キーをSecret Managerへ登録しておく（[詳細](./ai-api/README.md#http-api-とデプロイ)）。CLIは `gcloud run deploy --max` 対応版を使う。

リポジトリルートから以下を実行する。`.pt` は別途受け取り、Gitには追加しない。

```bash
cd ai-api
cp /path/to/ra_screening_model.pt model/ra_screening_model.pt
scripts/verify-received-files.sh
scripts/deploy-cloud-run.sh PROJECT_ID PROJECT_REF.supabase.co ra-ai-api-key
```

第3引数は共有キーを登録したSecret名。Cloud Buildで重みを含むイメージを作成し、Artifact Registry経由で `asia-northeast1` のCloud Run（既定サービス名: `ra-image-inference`）へ反映する。更新時も同じデプロイコマンドを実行する。成功後はスクリプトがArtifact Registryの `ra-inference` リポジトリを削除するため、イメージを再利用する場合は再ビルドが必要。

デプロイ後はサービスURLの `GET /health` が `{"status":"ok"}` を返すことを確認し、Vercelの `AI_API_URL` と `AI_API_KEY` を設定してWebを再デプロイする。推論エンドポイントは共有キーによるBearer認証を使う。

手順の詳細は [web/README.md](./web/README.md) と [ai-api/README.md](./ai-api/README.md) です。
