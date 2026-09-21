# 関節炎スクリーニングAIアプリ（Web）

Next.jsとSupabaseで構成したWebフロントエンドとバックエンドです。

## 技術構成

- Next.js（App Router、Server Actions）、React、Tailwind CSS
- Supabase（PostgreSQL、Auth、非公開Storage）
- 画像解析はCloud Run上のAI APIを呼び出す。`AI_API_URL` 未設定時はモック解析を行う。

## セットアップ

Node.js 24。`web/` ディレクトリで以下のコマンドを実行します。

```bash
npm install
cp .env.example .env.local
```

### Supabaseの準備

1. Supabaseプロジェクトを作成する。ローカルでは Docker を起動したうえで `npx supabase start` を実行する。
2. ホスト環境の新規DBでは、SQL Editorで `supabase/schema.sql` を実行する。ローカル環境では初期マイグレーションが自動適用される。
3. Authentication > Usersで最初の管理者を作成し、そのUUIDを使ってSQL Editorでプロフィールを登録する。

```sql
insert into public.profiles (id, role, full_name, clinic_id, is_active)
values ('<AuthユーザーのUUID>'::uuid, 'admin', '管理者', null, true)
on conflict (id) do update
set role = 'admin',
    full_name = excluded.full_name,
    clinic_id = null,
    is_active = true;
```

既存DBの場合は、適用状況を確認して未適用の個別マイグレーションを番号順に実行してください。現在の最終はv28です。v27のDBには `supabase/migration_v28_screening_thresholds.sql` を先に適用し、その後Webをデプロイします。既存結果の閾値は埋め戻しません。AI APIの更新は不要です。

### 環境変数

ローカルでは `.env.local` に設定します。`npx supabase start` のあと `npx supabase status` を実行し、Project URL を `NEXT_PUBLIC_SUPABASE_URL`、Publishable key を `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、Secret key を `SUPABASE_SECRET_KEY` へコピーします。本番ではVercelの対象環境へ同じ変数を登録し、変更後に再デプロイします。

| 変数 | VercelのType | 必須 | 用途 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Config | 必須 | SupabaseのAPI URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config | 必須 | SupabaseのPublishable key |
| `SUPABASE_SECRET_KEY` | Secret | 必須 | SupabaseのSecret key |
| `AI_API_URL` | Config | 実推論時 | Cloud RunのサービスURL。ローカルは `http://127.0.0.1:8080` |
| `AI_API_KEY` | Secret | 実推論時 | AI APIと共通の認証用キー。ローカルはAPI起動時と同じ値（例: `local-dev-key`）。本番の作成方法は[Cloud Runへデプロイ](../ai-api/README.md#cloud-runへデプロイ)を参照。 |
| `AI_API_LOG_RESPONSE` | Config | 任意 | `true` で成功レスポンスをサーバーログへ出力 |
| `ENABLE_DARK_MODE` | Config | 任意 | `true` でOS設定に応じたダークモードを有効化 |

ホスト環境のキーはSupabaseの Settings > API Keysで取得します。推奨形式はPublishable key（`sb_publishable_...`）とSecret key（`sb_secret_...`）です。

### 起動

```bash
npm run dev
```

<http://localhost:3000> を開きます。未ログインならログイン画面へ、ログイン後は権限に応じた画面へ進みます。

最初の管理者でログインしたあと、医療機関を作成し、スタッフアカウントを発行します。

## 関節判定の閾値

管理者は「判定設定」(`/admin/settings`) で全医療機関共通の閾値を変更できます。手関節には `thr_wrist`、その他の解析対象関節には `thr_node` を使い、APIのprobabilityが閾値以上ならWebのサーバー側で陽性にします。

初期値は2026-09-15-v1 checkpointの `thr_node = 0.34396984924623114`、`thr_wrist = 0.4344221105527638` です。初期登録後は管理者の保存だけで変更され、checkpointやモデルバージョンの更新には追従しません。Web実行時にcheckpointは読み込みません。

解析開始時に読み取った設定を処理中は固定し、結果と一緒に保存します。設定の取得失敗や関節詳細の不足は解析失敗になります。設定変更は過去の結果に影響せず、明示的な再解析では最新設定を使います。結果画面とCSV末尾の2列には使用した値を表示し、旧記録は画面で「未記録」、CSVで空欄になります。管理者用のAPI原文は加工せず保存するため、原文の陽性判定とWebの判定は異なる場合があります。

## 開発中によく使う操作

開発やデバッグに便利な機能を説明します。

### 手元の画像で解析する

撮影時、URLを手動で `/capture?debug=1` に変更するとカメラの代わりに画像を選択できます。画像は加工せずにアップロードされるため、AI APIの結果と比較できます。条件はJPEG、10MB以下、2000万ピクセル以下です。

### 撮影直後の画像品質チェック

カメラ撮影後、保存するJPEGをブラウザ内で読み戻し、画面上の手のガイド内側を暗さ・明るさ・ぼやけで判定します。疑いがあれば「撮り直す」「この画像を使う」を出しますが、警告が出ても続行できます。ファイル選択では手の位置が特定できないため、画像中央の5:8楕円を使います。結果は撮影中のメモリだけに保持し、DBやAPIには送りません。

判定設定は `src/lib/image-quality.ts` の `IMAGE_QUALITY_CONFIG` です。しきい値は暫定値で、実写での精度検証はしていません。品質チェックを通っても、解析結果が正しいとは限りません。

### DBを元にTypeScriptの型を生成

DBへマイグレーションを適用したあとに実行します。

```bash
npm run types:supabase
```

### テスト

```bash
npm test
npm run build
```

RLSとStorageのテスト (`npm run test:rls`) は本番Supabaseに対して実行しないでください。ローカルDBまたは専用テストプロジェクトで確認します。

```bash
npx supabase start
# 以下は本番Supabaseに対して実行しないこと
npm run test:rls
```

ローカルDBを作り直す場合だけ `npx supabase db reset` を使います。このコマンドはローカルデータを削除します。

専用テストプロジェクトを使う場合は、`.env.local` に次の3変数を設定します。すべて揃っている場合だけアプリ用接続先より優先されます。

```env
TEST_SUPABASE_URL=https://<test-project-ref>.supabase.co
TEST_SUPABASE_PUBLISHABLE_KEY=<test-publishable-key>
TEST_SUPABASE_SECRET_KEY=<test-secret-key>
```

## データと権限

画面上のロールの違いは [リポジトリのREADME](../README.md#ユーザー権限) を参照してください。

- 被験者の氏名・診断名は保存せず、`subjects` の匿名IDで撮影記録をまとめます。
- `clinic_staff` は所属医療機関のデータのみ。`admin` は全医療機関。撮影画像の閲覧は管理者のみです。
- `is_active = false` のアカウントはRLSとStorageポリシーでも拒否します。
- 解析失敗時は記録を `failed` にし、管理者が再解析できる状態を保ちます。

認可は最終的にRLSで制限します。Server Actionでも認証、アカウント状態、ロール、対象医療機関を検証してからService Roleを使用します。

## Vercelへのデプロイ

### 初回デプロイ

GitリポジトリをVercelへ接続します。Framework PresetはNext.js、Root Directoryは `web`。[環境変数](#環境変数)を Production に登録します。実推論時は `AI_API_URL` に Cloud Run のサービスURLを入れます。

### コード修正のデプロイ

Vercelがセットアップ済みの場合、`main`ブランチをpushすると自動でデプロイが走ります。デプロイ結果はVercelのDeploymentsページで確認できます。

`vercel.json` の設定により、`web/` に差分がないデプロイはスキップされます。

### クライアント側でのデプロイ検知

本番ビルドは長時間開いたタブの更新検知用IDを生成します (`app-version.json`)。同じビルドを複数台へ配布する場合は、各台で再ビルドせず成果物を共有してください。

特定のページを1時間以上開きっぱなしにしてユーザーが他のタブから戻ってくるとバージョン確認が走り、新バージョンがデプロイされている場合はページを自動リロードします。
