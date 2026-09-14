# 関節炎スクリーニングAIアプリ（Web）

医療機関スタッフが診察室等で手指を撮影し、AI解析結果を管理するWebアプリケーションです。管理者は医療機関とスタッフを管理します。患者自身のログイン機能はなく、患者の氏名などの個人情報は保持しません。

スタッフ向けアプリ（撮影・解析・匿名IDによるグルーピング）は `/`、管理者向けアプリは `/admin` から利用します。

このディレクトリが Vercel の Root Directory です。ダッシュボードで Root Directory を `web` にしてください。リポジトリ全体の入口は [../README.md](../README.md) です。

`vercel.json` の `ignoreCommand` は、同じプロジェクト・ブランチの前回成功デプロイのコミット（`VERCEL_GIT_PREVIOUS_SHA`）から `HEAD` までの `web/` の差分でビルドを判断します。複数コミットをまとめて push した場合も、その間の変更を含めて比較します。差分がない場合だけスキップし、SHA が未設定、浅いクローンで比較元が取得できない、Git の比較に失敗した場合はビルドを実行します。

## 技術スタック

- **フロントエンド**: Next.js (App Router), React, Tailwind CSS
- **バックエンド**: Next.js Server Actions
- **DB / 認証 / ストレージ**: Supabase (PostgreSQL, Auth, Storage)
- **AI推論**: Cloud Run (Python/FastAPI) またはモック解析

## セットアップ

コマンドはすべて `web/` で実行します。

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Supabaseプロジェクトの準備

1. [Supabase](https://supabase.com) でプロジェクトを作成します。
2. 新規プロジェクトでは、SQL Editorで `supabase/schema.sql` を実行します。テーブル、RLS、非公開のStorageバケットが作成されます。ローカルSupabaseでは `supabase/migrations/20260822000000_initial_schema.sql` が同じ初期スキーマとして自動適用されます。
3. Authentication > Users で、管理者として使うユーザーをメールアドレス・パスワードで作成します。作成後、そのユーザーのUUIDをコピーします。
4. SQL Editorで、コピーしたUUIDを使って管理者プロフィールを作成します。

```sql
insert into public.profiles (id, role, full_name, clinic_id, is_active)
values ('<AuthユーザーのUUID>'::uuid, 'admin', '管理者', null, true)
on conflict (id) do update
set role = 'admin',
    full_name = excluded.full_name,
    clinic_id = null,
    is_active = true;
```

初期管理者はまだ存在しないため、プロフィールの登録はアプリ画面ではなくSQL Editor（またはService Roleを使う管理手段）で行ってください。ログイン後は `/admin` にリダイレクトされます。

既存プロジェクトに適用する場合は、現在のDBの適用状況を確認してから実行してください。

- `schema.sql` を新規DBへ実行した場合: 追加のマイグレーションは不要です。
- 個別マイグレーションで更新する場合は、未適用のファイルをv3からv25まで番号順に実行します。現在の最終マイグレーションは `migration_v25_account_deletion.sql` です。v25は管理者・スタッフアカウントの削除に対応するため、`profiles`から`auth.users`への外部キーのcascadeを外し、削除済みを示す`deleted_at`列を追加します。既存データは削除しません。

`migration_v2.sql` はテーブルを削除して再作成する処理を含むため、既存データのあるDBへ無条件で実行しないでください。古いDBから移行する場合は、バックアップを取得したうえで、既存データを保持する個別の移行手順を作成してください。

管理者でログインしたら、まず `/admin/clinics` で医療機関を登録し、その後 `/admin/staffs/new` で医療機関スタッフのアカウントを発行します。既存の管理者は `/admin/admins/new` から追加の管理者アカウントを発行できます。

### 3. 環境変数の設定

```bash
cp .env.example .env.local
```

`.env.local` にSupabaseのURL・Anon Key・Service Role Keyを設定してください。`SUPABASE_SERVICE_ROLE_KEY` はアカウント発行・メールアドレス変更・パスワード再設定などのServer Actionからのみ使用し、ブラウザへ公開しないでください。

ローカルSupabaseを使う場合は `npx supabase start` のあと、`npx supabase status` の API URL・anon key・service_role key を書きます。

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AI_API_URL=
AI_API_KEY=
```

ホスト済みプロジェクトを使う場合は URL を `https://<project-ref>.supabase.co` に変えてください。

DBスキーマを変更した場合はローカルDBへマイグレーションを適用したあと、型を再生成します。

```bash
npm run types:supabase
```

### 4. 開発サーバー起動

```bash
npm run dev
```

- ログイン: http://localhost:3000/login
- 医療機関スタッフ向け: http://localhost:3000/
- 管理者向け: http://localhost:3000/admin

カメラ撮影にはブラウザのカメラ権限が必要です。`getUserMedia` は通常HTTPS環境が必要で、ローカル開発では `localhost` が利用できます。

### デバッグ用の画像アップロード

http://localhost:3000/capture?debug=1 を直接開くと、撮影画面のシャッター横に「画像を選択」ボタンが出ます。選んだ画像はカメラ撮影と違い、リサイズも再エンコードもせずそのままアップロードして解析へ渡すため、`ai-api/test_images/` のサンプルなどで手元の推論結果と突き合わせられます。カメラを許可できない環境でも使えます。

「選んだファイル＝解析されたバイト列」を保証するため、次の条件を満たさない画像は理由を表示して受け付けません（劣化させて通すことはしません）。

- JPEG（Storageバケットが `image/jpeg` のみ許可）
- 10MB以下（Storageバケットと推論APIの上限）
- 2000万ピクセル以下（推論APIの `MAX_IMAGE_PIXELS`）

なおクエリはページ遷移で失われるので、アプリ内のリンクから撮影画面に入り直した場合はURLを付け直してください。推論API側は受け取った画像を長辺1024pxへ正規化してから関節を切り出すため、1024pxを超える解像度は判定結果には影響しません。

## AI APIについて

`AI_API_URL` が未設定の場合は、サーバー側のモック解析（左右の判定・確率・陽性関節数を返す）が動作します。

設定した場合は、Next.js Server Actionが`AI_API_URL/v1/ra-screening`へBearer認証付きで同期POSTします。`AI_API_KEY`はサーバー専用の共有APIキーであり、`NEXT_PUBLIC_`を付けないでください。リクエスト／レスポンスと画像の安全な受け渡しは[AI画像解析 REST API 契約](../docs/ai_api_contract.md)と [OpenAPI](../contract/openapi.yaml) を参照してください。

開発時に成功レスポンスをNext.jsのサーバーコンソールへ出すには、`AI_API_LOG_RESPONSE=true`を設定します。出力にはスクリーニング結果が含まれるため、本番環境では通常無効のままにしてください。APIキー、Authorizationヘッダー、署名付きURLは出力しません。

## 主な機能（MVP）

### 医療機関スタッフ向け

- 管理者から発行されたメールアドレス・パスワードでログイン
- ヘッダーの「アカウント設定」画面から、現在のパスワードを確認したうえで自分自身のログイン用メールアドレス・パスワードを変更
- `getUserMedia` による左手→右手のカメラ撮影（ガイド枠付き、クライアント側で最大1280px・JPEG品質0.8程度に圧縮）
- 画像のアップロードとAI解析
- AI解析結果の手のSVG図表示（`HandJointDiagram` 共通コンポーネント）
- 未割り当ての撮影記録を匿名ID（Subject ID）へグルーピング
- 所属医療機関の撮影記録一覧（被験者ID・撮影ID・日付で絞り込み）
- 被験者IDの紐付けを、同一医療機関のスタッフまたは管理者が訂正・解除
- 医療機関内の匿名IDと過去の撮影・判定履歴の確認。撮影画像そのものは表示しない
- 管理者による完了・失敗記録の再解析（既存の判定結果を新しい結果で置換）と、AIモデルバージョン・解析日時の記録

### 管理者向け

- 医療機関の新規登録
- 医療機関の詳細（所属スタッフ・撮影データ）の確認
- 医療機関名の編集
- 医療機関スタッフアカウントの発行（初期パスワードは十分な強度で自動生成）
- スタッフの表示名・所属医療機関・有効状態・ログイン用メールアドレスの編集、およびパスワードの再設定
- 管理者アカウントの発行（初期パスワードはスタッフと同じく自動生成）
- 管理者編集画面から、他の管理者や自分自身のログイン用メールアドレスの変更・パスワードの再設定
- 管理者・スタッフアカウントの削除（撮影データは削除せず、担当スタッフ名は「(削除済みユーザー)」と表示）
- 全医療機関の撮影・解析データ、撮影画像、AI判定結果の確認
- 完了・失敗した記録の再解析

## データと権限

- 患者の氏名・診断名などの個人情報は保存しません。
- `subjects` の匿名IDで撮影記録をグルーピングします。
- `clinic_staff` は所属医療機関の撮影・解析データを操作できます。撮影画像の閲覧はできません。スタッフ自身の表示名・所属医療機関・有効状態、および医療機関名を編集する画面・Server Actionは提供しません。これらのマスタ情報は管理者が管理します。
- `admin` は全医療機関の管理データを参照・操作できます。撮影画像とAI判定結果の閲覧、完了・失敗した解析の再実行、および撮影記録と手画像の完全物理削除も含まれます。
- `clinics` の作成・更新・削除は、管理者だけにRLSで限定しています。スタッフは自院の医療機関を参照できますが、名称を直接変更できません。
- `is_active = false` のアカウントは、Server ActionだけでなくRLSとStorageポリシーでもデータへアクセスできません。
- 手画像は非公開Storageに保存し、管理者にのみ署名付きURLを発行します。スタッフは撮影時のアップロードと、アップロード失敗時の削除だけができます。失敗時の画像削除と、管理者による撮影記録の完全物理削除は、Server Actionで認証・対象記録・パスを確認した後、Service Roleで実行します。スタッフに画像の参照権限は付与しません。

## エラーハンドリング

- 画像アップロード失敗: 途中まで作成した記録と画像の削除を試み、「再度アップロード」ボタンを表示
- AI解析失敗・タイムアウト（55秒）: `screenings.status = failed` に更新し、スタッフ画面には管理者への再解析依頼を案内する。管理者は完了・失敗した記録を再解析でき、開始時に既存の判定結果を消去する。詳細画面からは手画像を含む撮影記録を完全物理削除できる
- ブラウザ終了・通信断等で10分以上 `uploading`／`analyzing` のままの記録: 詳細画面で中断の可能性を表示し、管理者が `failed` へ復旧して再解析できるようにする
- カメラ権限拒否: カメラを使えない場合の案内を表示

## RLS / Storage 統合テスト

RLSはアプリの重要な認可境界のため、実データを含まないDBで確認します。本番プロジェクトのURL・キーは指定しないでください。`npm run test:rls` は `.env.local`（なければ `.env`）を自動で読みます。シェルで `export` する必要はありません。

普段のローカル開発では、アプリと同じ `.env.local` を使います。`NEXT_PUBLIC_SUPABASE_URL` が `http://127.0.0.1:54321`（または `localhost`）のときだけ、同じキーでテストします。リモートのアプリ用プロジェクトは自動では使いません。

```bash
npx supabase start
npm run test:rls
```

スキーマを作り直すときだけ `npx supabase db reset` を実行します。既存のローカルデータは削除されます。テスト自体は一時データを作って終了時に消すので、毎回の reset は不要です。

ホスト済みの専用テストプロジェクトを使う場合は、`schema.sql` と必要なマイグレーションを適用したうえで、`.env.local` に `TEST_SUPABASE_*` を書いてください。この3つが揃っているときは、アプリ用の接続先より優先されます。

```env
TEST_SUPABASE_URL=https://<test-project-ref>.supabase.co
TEST_SUPABASE_ANON_KEY=<test-anon-key>
TEST_SUPABASE_SERVICE_ROLE_KEY=<test-service-role-key>
```

テストは一時的に2施設・4ユーザー・撮影記録・Storageオブジェクトを作成し、終了時に削除します。未認証アクセスの拒否、施設間のDB/Storage隔離、スタッフによる権限昇格・診断結果改ざんの拒否、管理者アクセス、解析開始後の画像削除拒否、無効化アカウントのDB/Storage拒否を確認します。アップロード時の状態・パス制限と、片手だけ保存された場合・両手とも未保存の場合の後片付け、管理者による完了済み記録の完全物理削除も実際のServer ActionとStorageで検証します。

`npm test` では、実際のServer Actionソースと依存スタブを使い、未ログイン時にService Roleへ到達しないこと、後片付けと管理者削除の権限・状態・パス検証、Storage削除失敗時に撮影記録を残すことも確認します。

## 長時間開いたタブの更新

本番ビルドは `web/` で `npm run build` を実行する。`prebuild` が `app-version.json` にランダムなIDを生成し、Next.jsがサーバー・ブラウザの両方へ埋め込む。生成ファイルはGit管理外。同じビルドを複数台へ配布する場合は成果物を共有し、各台で再ビルドしない。`next start` で設定を読むため、生成ファイルもビルド成果物と一緒に保持する。開発中は更新確認を無効にする。

ページ読み込みから1時間以上経過した後、タブ復帰または対象画面への移動時に、キャッシュを使わず `GET /api/version` のIDを比較する。対象はホーム（`/`）、被験者一覧（`/subjects`）、撮影記録一覧（`/screenings`、`/admin/screenings`）だけ。新版があるときだけページ全体を再読み込みする。入力・選択を変更した画面では離れるまで見送り、通信失敗時は次の確認機会まで通常利用を続ける。表示したまま画面移動しない場合や撮影・編集画面に留まる場合は更新されず、1時間以内の更新を保証するものではない。

確認APIは公開ビルドIDだけを返し、認証やDBアクセスは行わない。通常の本番ドメインから最新版へ届く配信構成が前提。独自のデプロイ固定Cookie（Vercelの `__vdpl` など）や旧版へのルーティングを導入する場合は、確認APIと再読み込みが最新版へ届くことも確認する。
