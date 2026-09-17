# 関節炎スクリーニングAIアプリ

医療機関スタッフが被験者の手指を撮影し、その画像をAIモデルが解析して関節炎判定を行うアプリです。被験者の氏名など個人情報は保存せず、匿名の被験者IDで撮影記録をグループ化して管理します。

## ユーザー権限

ユーザー権限に応じてログイン以降の画面が変わります。

1. 医療機関スタッフ … 撮影、被験者IDへの紐付け・訂正、自院の結果閲覧が可能。解析元の撮影画像は閲覧不可。主にスマホやタブレットからの利用を想定。
2. 管理者 … 全医療機関の管理、撮影画像・解析結果の閲覧、再解析、撮影記録の完全削除が可能。主にPCからの利用を想定。

## 構成

| ディレクトリ | 内容 | デプロイ先 |
| --- | --- | --- |
| [`web/`](./web/) | Next.js、Supabase（DB・認証・Storage） | Vercel（Root Directory: `web`） |
| [`ai-api/`](./ai-api/) | FastAPI、AI推論 | Google Cloud Build → Artifact Registry → Cloud Run |
| [`api-spec/`](./api-spec/) | AI APIの仕様 | — |

Webは署名付き画像URLをAI APIへ渡し、AI APIはBearer認証後に画像を取得して推論します。`AI_API_URL` が未設定なら、Webはモック解析を使います。

APIの詳細は [OpenAPI](./api-spec/openapi.yaml) と [API仕様の解説](./api-spec/README.md) を参照してください。

## ローカル起動

具体的な手順は各ディレクトリのREADMEに書いてあります。

1. [Webのセットアップ](./web/README.md#セットアップ) に従って Web とローカルSupabaseを起動する。
2. 実推論も確認する場合は [AI APIのセットアップ](./ai-api/README.md#セットアップ) に従って API を起動し、[Webの環境変数](./web/README.md#環境変数) の `AI_API_URL` と `AI_API_KEY` を API 側と揃える。

## デプロイ

初回は次の順で準備します。それぞれの手順はリンク先に書いてあります。

1. [Supabaseの準備](./web/README.md#supabaseの準備)
2. [AI APIをCloud Runへデプロイ](./ai-api/README.md#cloud-runへデプロイ)
3. [WebをVercelへデプロイ](./web/README.md#vercelへのデプロイ)

Webだけの変更ではAI APIの再デプロイは不要です。モデルまたは `ai-api/` を変更した場合だけAI APIを再デプロイします。DB変更時は、Webのデプロイ前にSupabaseのSQL Editorを使って `web/supabase/` 内のマイグレーションを適用してください。
