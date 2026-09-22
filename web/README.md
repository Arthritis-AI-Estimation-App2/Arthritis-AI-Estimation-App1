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

既存DBの場合は、適用状況を確認して未適用の個別マイグレーションを番号順に実行してください。現在の最終はv29です。v28からの更新には `supabase/migration_v29_analysis_history.sql` を使います。

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

管理者は「判定設定」（`/admin/settings`）で、全医療機関共通の閾値を変更できます。手関節は `thr_wrist`、それ以外の解析対象関節は `thr_node` を使い、APIのprobabilityが閾値以上ならWebのサーバー側で陽性にします。初期値は9月15日に提供されたAIモデル（チェックポイント）に埋め込まれていた `thr_node = 0.34396984924623114`、`thr_wrist = 0.4344221105527638` です。閾値は管理画面で設定した値が使用されます。AIモデルを差し替えても閾値は自動更新されません。

管理者に表示されるAI画像解析レスポンスデータはAIモデル（チェックポイント）に埋め込まれた閾値による生の判定結果です。そのため画面に表示される判定結果（管理画面で設定した閾値を使用）とは閾値の出所が異なります。

## 解析履歴（v29）

初回解析と、管理者が再解析を実行するたびに `screening_analysis_runs` を1件追加します。開始時の実行者・日時・画像パス・閾値・API／モック区分と、結果・確率・モデルバージョン・応答原文または失敗情報を保存します。メモ欄はありません。閾値は開始時に固定し、解析中の設定変更を反映しません。

管理者の撮影詳細に20件ずつ履歴を表示します。各履歴を開くと、その回の関節図や確率、閾値適用前のAI応答原文を確認できます。通常の結果画面と既存CSVは最新実行を表示するため、再解析が失敗した場合は「解析失敗」となります。過去の成功結果は履歴で確認できます。

一覧の「解析履歴CSV」は、撮影日・医療機関・被験者ID・撮影ID・最新ステータスによる絞り込みに該当した撮影記録の**全実行**を出力します。詳細画面からは1撮影分を出力できます。1実行1行、81列、最大10,000件です。CSVの被験者IDと医療機関は出力時点の所属であり、解析時点の所属履歴ではありません。開始／終了日時は日本時間、未記録・未検出の値は空欄です。失敗・解析中の履歴も含みます。

履歴は有効な管理者のみ閲覧でき、スタッフにはRLSでも公開しません。実行条件と確定後の結果は変更できず、履歴だけの削除もできません。撮影記録を完全削除すると、手画像と全解析履歴も削除されます。

### v28からv29への更新

1. メンテナンス中は撮影・解析・再解析の受付を停止し、進行中の処理が完了するのを待ちます。中断した記録は既存の管理画面で復旧し、`analyzing` を解消します。
2. DBをバックアップし、SQL Editorで `supabase/migration_v29_analysis_history.sql` を実行します。解析中の記録がある場合は、変更前にエラーで停止します。
3. v29対応のWebをデプロイし、古い画面を再読み込みしてから受付を再開します。旧解析RPCを無効化するため、DB移行後に旧Webで解析を続けないでください。AI APIのデプロイは不要です。
4. 既存の完了／失敗記録が履歴に1件残り、再解析後に履歴が1件増えることを確認します。

移行時は、残っている結果・閾値・関節詳細・応答原文・失敗情報だけを引き継ぎます。過去の実行者や開始時刻は推測で埋めません。履歴の記録番号は保存された順番です。既に上書きされた結果は復元できません。開始受付前のアップロード中断は、解析履歴を作らず撮影記録の失敗として扱います。

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
