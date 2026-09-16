# 関節炎スクリーニングAIアプリ

医療機関スタッフが被験者の手指を撮影し、その画像をAIモデルが解析して関節炎判定を行うアプリです。患者の氏名など個人情報は保存せず、匿名の被験者IDで撮影記録をグループ化して管理します。

## ユーザー権限

ユーザー権限に応じてログイン以降の画面が変わります。

1. 医療機関スタッフ … 撮影・結果判定と自院の結果の閲覧のみ可能。解析元の撮影画像は閲覧不可。主にスマホやタブレットからの利用を想定。
2. 管理者 … 撮影画像も含めて全データの閲覧が可能。主にPCからの利用を想定。

## 構成

| ディレクトリ | 内容 | デプロイ先 |
| --- | --- | --- |
| [`web/`](./web/) | Next.js、Supabase（DB・認証・Storage） | Vercel（Root Directory: `web`） |
| [`ai-api/`](./ai-api/) | FastAPI、AI推論 | Google Cloud Build → Artifact Registry → Cloud Run |
| [`api-spec/`](./api-spec/) | AI APIの仕様 | — |

Webは署名付き画像URLをAI APIへ渡し、AI APIはBearer認証後に画像を取得して推論します。`AI_API_URL` が未設定なら、Webはモック解析を使います。

APIの詳細は [OpenAPI](./api-spec/openapi.yaml) と [API仕様の解説](./api-spec/README.md) を参照してください。

## ローカル起動

まずWebを起動します。

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Supabaseの準備と環境変数は [WebのREADME](./web/README.md) を参照してください。

実推論も確認する場合は、別のターミナルでAI APIを起動します。学習済み重み `ra_screening_model.pt` は別途必要です。

```bash
cd ai-api
python3 -m venv .venv
source .venv/bin/activate
```

Linuxでは次を実行して依存関係をインストールします。

```bash
pip install -r requirements-test.txt
```

macOSでは代わりに次を実行します。

```bash
pip install -r requirements-macos-py311.txt -r requirements-api.txt
pip install pytest==8.4.2 httpx==0.28.1
```

依存関係をインストールしたら、AI APIを起動します。

```bash
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

- WebとAI APIの `AI_API_KEY` は同じ値にします。AI APIでは `SUPABASE_STORAGE_HOSTS` に画像取得を許可するSupabaseホストだけを設定します。
- 新規DBには `web/supabase/schema.sql`、既存DBには未適用の個別マイグレーションを番号順に適用します。
- 学習済み重み `ra_screening_model.pt` はバイナリでサイズが大きいためGitへ追加していません。AIモデルの提供元からファイルを取得して `ai-api/model/ra_screening_model.pt` に置いてください。

## デプロイ

初回は次の順で準備します。

1. [WebのREADME](./web/README.md#supabaseの準備) に従ってSupabaseを準備する。
2. [AI APIのREADME](./ai-api/README.md#cloud-runへデプロイ) に従ってAI APIをCloud Runへデプロイする。
3. VercelでRoot Directoryを `web` にし、[Webの環境変数](./web/README.md#環境変数)を登録してデプロイする。

Webだけの変更ではAI APIの再デプロイは不要です。モデルまたは `ai-api/` を変更した場合だけAI APIを再デプロイします。DB変更時は、Webのデプロイ前にSupabaseのSQL Editorを使って `web/supabase/` 内のマイグレーションを適用してください。
