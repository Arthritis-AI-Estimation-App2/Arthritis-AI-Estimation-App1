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

既存DBの場合は、適用状況を確認して未適用の個別マイグレーションを番号順に実行してください。

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

## 開発中によく使う操作

開発やデバッグに便利な機能を説明します。

### 手元の画像で解析する

撮影時、URLを手動で `/capture?debug=1` に変更するとカメラの代わりに画像を選択できます。画像は加工せずにアップロードされるため、AI APIの結果と比較できます。条件はJPEG、10MB以下、2000万ピクセル以下です。

### 撮影直後の画像品質チェック

カメラ撮影後、保存するJPEGをブラウザ内で読み戻し、画面上のガイド楕円内をチェックします。暗さ・明るさ・ぼやけの疑いがあれば「撮り直す」「この画像を使う」を表示します。警告は続行を禁止しません。左右の確認画面にも警告が残り、撮り直し中に「確認に戻る」を選ぶと以前の採用画像を維持します。

ファイル選択にも同じチェックを適用します。ファイルは無変換で保持し、画像中央に収まる最大の5:8ガイドを仮定します。品質結果・計測値は撮影中のメモリだけに保持し、DBやAPIには送信しません。

判定設定の正本は `src/lib/image-quality.ts` の `IMAGE_QUALITY_CONFIG`（`guide-v1`）です。評価画像は拡大せず長辺最大512px、楕円境界から2px内側を評価します。Laplacianは中心と上下左右がすべて評価範囲内の画素だけで計算します。

| 指標 | 暫定の警告条件 |
| --- | --- |
| 暗さ | 平均輝度40未満、または輝度20以下が60%以上 |
| 明るさ | 平均輝度220超、または輝度245以上が30%以上 |
| ぼやけ | 露出警告がなく、4近傍Laplacian分散が20未満 |

ガイド範囲の元画像または縮小後の短辺が64px未満の場合は解像度不足として「未確認」にします。ガイド取得・デコード・Workerの失敗、品質チェックが5秒で終わらない場合も「未確認」とし、写真の確認後に続行できます。判定中の離脱・破棄では処理を中断し、遅れて届いた結果を採用しません。

これらは実写で精度検証済みのしきい値ではありません。背景の模様、手の大きさ、肌の質感、照明、端末の画像処理の影響を受けます。手の位置検出、ブレとピンボケの区別、局所的な影・反射の網羅的な検出は行いません。

検証済み: 合成画素の単体テスト、Workerの失敗・中断、デスクトップChromiumでの合成JPEGによる警告・続行・左右別再撮影・元画像への復帰・未確認・離脱確認。合成カメラ映像で390×844、820×1180、844×390の画面に対するガイド座標と保存画像の対応も確認しています。

未検証: iPhone Safari / Android Chromeの実機での処理時間、実際の手画像での見逃し率・誤警告率、肌の色・背景・端末ごとの偏り。導入先の実写で正常・手ブレ・ピンボケ・暗所・白飛びを比較し、しきい値変更時は設定バージョンを更新して正常・不良の両方を再評価してください。品質チェックの通過は解析結果の正しさを保証しません。

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
