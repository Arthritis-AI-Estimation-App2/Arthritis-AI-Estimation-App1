# 開発ガイド

- `web/` は Next.js。`npm` コマンドと Supabase 操作は `web/` で実行する。
- `ai-api/` は FastAPI。チェックポイント `.pt`（重みとしきい値などを含む）は Git に入れない。pytest と Cloud Run へのデプロイは `ai-api/` で行う。
- API仕様は `api-spec/` にまとめる。定義は `openapi.yaml` と fixtures、解説は `README.md`。
- デプロイは2系統。Web は Vercel（Root Directory は `web`）、推論は Cloud Build → Artifact Registry → Cloud Run。`web/` だけの変更で Python / Docker を回さない。

被験者の氏名・診断名などは保存せず、`subjects`の匿名IDで撮影記録をグルーピングする。

画面からの更新はServer Actionを基本とする。ファイルダウンロードなどGETが必要なときだけRoute Handlerを使う。

## 認可

- Server Actionは公開されたサーバー側入口であり、`"use server"`だけでは認可されない。各Actionで入力値と権限を検証する。
- `clinic_staff`は所属医療機関のデータのみ、`admin`は全医療機関を扱える。
- `is_active = false`のユーザーは、Server ActionだけでなくRLSとStorageポリシーでも拒否する。
- 読み取りは、Cookieセッション付きの通常クライアント（Publishable key）とRLSを使う。認可は最終的にRLSで制限する。
- `screenings` / `joint_results`の書き込みと、解析確定・再解析・被験者ID訂正などのRPCはService Roleを使う。Service RoleはRLSを迂回するため、使用前に必ず認証・`is_active`・ロール・対象テナントを確認する。
- `SUPABASE_SECRET_KEY`と`AI_API_KEY`はブラウザへ公開しない。
- 新しいテーブル、Storage操作、直接Supabaseアクセスを追加する場合は、アプリ側のチェックだけでなくRLS／Storageポリシーも確認する。

クライアントは次の3つだけを使う。

- `web/src/lib/supabase/server.ts`: Cookieセッション付きの通常クライアント
- `web/src/lib/supabase/client.ts`: 撮影画面のAuth確認とStorage画像アップロード
- `web/src/lib/supabase/admin.ts`: Secret keyを使うService Roleクライアント。クライアント側からimportしない

## 手画像と解析

- Screeningの状態遷移（`uploading` → `analyzing` → `completed`／`failed`）を壊さない。解析失敗時は`failed`へ更新し、再解析できる状態を維持する。
- 手画像は非公開Storageに保存する。画面参照（Signed URLを含む）は本部管理者のみ。スタッフは撮影時のアップロードと、アップロード失敗時の削除だけができる。管理者は認可済みのServer ActionからService Roleで撮影記録と手画像を完全物理削除できる。解析用Signed URLは、認可済みのServer ActionからService Roleで発行し、ブラウザには返さない。
- アプリが生成・登録・削除する画像パスは`{userId}/{screeningId}/right_<timestamp>.jpg`または`left_<timestamp>.jpg`形式に限定する。ファイル名の形式はアプリ側で検証し、StorageのSQLには重複定義しない。
- AI解析は共有APIキーをBearerトークンとして`AI_API_URL/v1/ra-screening`を呼び出す。未設定時はサーバー側モックを使う。
- AIレスポンスは入力した手の件数・順序・sideの一意性、確率と関節数の範囲、手ごとの結果と全体集計の整合性を検証してから保存する。関節詳細がある場合は、対応表に従って既存の手の図の関節名へ変換する。

## テーマ・色

- 色は`web/src/app/globals.css`のCSS変数を正とし、`bg-background`、`text-foreground`、`border-border`、`bg-danger`など役割を表すクラスを使う。Tailwind標準パレットの色は直接指定しない。
- テーマ色を追加・変更するときは、ライト用とダーク用を同時に定義し、コントラストを確認する。
- ダークモードはサーバー側の`ENABLE_DARK_MODE`で制御する。未設定または`false`ではライトモードに固定し、`true`のときだけOSの`prefers-color-scheme`に追従する。CSS変数とTailwindの`dark:` variantは、どちらも`data-dark-mode-enabled="true"`がある場合だけ有効にする。
- 手動切替、Cookie、Local Storage、テーマProviderは使わない。手関節図のSVG色は`--color-joint-*`を使う。
- カメラ映像上の黒背景、白いシャッター、半透明オーバーレイなど、撮影操作の視認性に必要な固定白黒だけは例外とする。

## DB変更

ファイルの役割は次のとおり。中身の判断を別々にしない。

- `web/supabase/schema.sql` … 空の新規DB向けの最終形。SQL Editorで一度実行して完成する定義。
- `web/supabase/migrations/20260822000000_initial_schema.sql` … ローカル（`npx supabase start` / `db reset`）用。`schema.sql` と同一にする。
- `web/supabase/migration_vN_*.sql` … 既存ホストDB向けの差分。前の最終形から新しい `schema.sql` へ揃える。既存データは削除しない。

現在の最終はv28。READMEの手順とずらさない。

DBを変えるときはこの順で行う。差分ファイルだけ書いて `schema.sql` を更新しない、ということをしない。

1. 先に `schema.sql` を「空DBにこれを実行したら完成」の形にする。
2. それを `initial_schema.sql` にコピーする。
3. そのあと `migration_vN` を書く。`CREATE OR REPLACE` する関数は、`schema.sql` と同じ本体にする。
4. 既存行の埋め戻しなど、一度きりのデータ移行は `migration_vN` にだけ書く。空の新規DBには不要。

確認は次で行う。差があれば `schema.sql` とローカル用の同期漏れ。

```bash
diff -u web/supabase/schema.sql \
  web/supabase/migrations/20260822000000_initial_schema.sql
```

SQL変更後はRLS、医療機関ごとのデータ分離、無効アカウント、Storageアクセスを確認する。確認コマンドは`web/`で`npm run build`、`npx tsc --noEmit`、リポジトリルートで`git diff --check`。

## コミットメッセージ

- 件名は変更内容を簡潔に表す。
- 本文には、変更の動機を1文で記載する。
- 本文の続きに、変更した内容を簡潔な箇条書きで記載する。

良い例:

```
解析結果のCSV出力を追加

実証実験の解析データを表計算ソフトで確認・集計できるようにするため。

- 一覧の絞り込み条件を引き継ぐ管理者向けCSV出力を追加
- AI解析の集計値と左右30関節の判定・信頼度を70列で出力
- UTF-8 BOMやCSVエスケープ、出力URLのテストを追加
```

## ローカル環境のテストユーザー

メールアドレスとパスワードはリポジトリに置かない。ログインやブラウザ確認が必要なときは `AGENTS.local.md` を読む。無ければユーザーに確認する。雛形は `AGENTS.local.md.example`。
