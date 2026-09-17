# 関節炎スクリーニングAIアプリ（Web）

Next.jsとSupabaseで構成したWebフロントエンドとバックエンドです。

## 技術構成

- Next.js（App Router、Server Actions）、React、Tailwind CSS
- Supabase（PostgreSQL、Auth、非公開Storage）
- 画像解析はCloud Run上のAI APIを呼び出す。`AI_API_URL` 未設定時はモック解析を行う。

## セットアップ

`web/` ディレクトリで以下のコマンドを実行します。

```bash
npm install
cp .env.example .env.local
```

### Supabaseの準備

1. Supabaseプロジェクトを作成する。ローカル環境では `npx supabase start` を実行する。
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

ログイン後、`/admin/clinics` で医療機関を作成し、`/admin/staffs/new` でスタッフを発行します。

既存DBの場合は、適用状況を確認して未適用の個別マイグレーションを番号順に実行してください。

### 環境変数

`.env.local` に設定します。本番ではVercelの対象環境へ同じ変数を登録し、変更後に再デプロイします。

| 変数 | VercelのType | 必須 | 用途 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Config | 必須 | SupabaseのAPI URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config | 必須 | SupabaseのPublishable key。ローカルは `npx supabase status` で確認 |
| `SUPABASE_SECRET_KEY` | Secret | 必須 | SupabaseのSecret key |
| `AI_API_URL` | Config | 実推論時 | Cloud RunのサービスURL。ローカルは `http://127.0.0.1:8080` |
| `AI_API_KEY` | Secret | 実推論時 | AI APIと共通の認証用キー。作成方法は[Cloud Runへデプロイ](../ai-api/README.md#cloud-runへデプロイ)を参照。 |
| `AI_API_LOG_RESPONSE` | Config | 任意 | `true` で成功レスポンスをサーバーログへ出力 |
| `ENABLE_DARK_MODE` | Config | 任意 | `true` でOS設定に応じたダークモードを有効化 |

ホスト環境のキーはSupabaseの Settings > API Keysで取得します。推奨形式はPublishable key（`sb_publishable_...`）とSecret key（`sb_secret_...`）です。

### 起動

```bash
npm run dev
```

- ログイン: <http://localhost:3000/login>
- スタッフ画面: <http://localhost:3000/>
- 管理画面: <http://localhost:3000/admin>

## 開発時の確認

### 手元の画像で解析する

撮影時、URLを手動で `/capture?debug=1` に変更するとカメラの代わりに画像を選択できます。画像は加工せずにアップロードされるため、AI APIの結果と比較できます。条件はJPEG、10MB以下、2000万ピクセル以下です。

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

- 患者の氏名・診断名は保存せず、`subjects` の匿名IDで撮影記録をまとめます。
- `clinic_staff` は所属医療機関のデータだけを扱えます。撮影、被験者IDへの紐付け・訂正、結果の閲覧ができます。撮影画像は閲覧できません。
- `admin` は全医療機関の管理、画像・解析結果の閲覧、再解析、撮影記録の完全削除ができます。
- `is_active = false` のアカウントはRLSとStorageポリシーでも拒否します。
- 解析失敗時は記録を `failed` にし、管理者が再解析できる状態を保ちます。

認可の最終境界はRLSです。Server Actionでも認証、アカウント状態、ロール、対象医療機関を検証してからService Roleを使用します。

## Vercelへのデプロイ

### 初回デプロイ

VercelのFramework PresetをNext.js、Root Directoryを `web` にし、[環境変数](#環境変数)を登録します。`vercel.json` は `web/` に差分がないデプロイのビルドをスキップします。

### コード修正のデプロイ

Vercelがセットアップ済みの場合、`main`ブランチをpushすると自動でデプロイが走ります。デプロイ結果はVercelのDeploymentsページで確認できます。

### クライアント側でのデプロイ検知

本番ビルドは長時間開いたタブの更新検知用IDを生成します (`app-version.json`)。同じビルドを複数台へ配布する場合は、各台で再ビルドせず成果物を共有してください。

特定のページを1時間以上開きっぱなしにしてユーザーが他のタブから戻ってくるとバージョン確認が走り、新バージョンがデプロイされている場合はページを自動リロードします。
