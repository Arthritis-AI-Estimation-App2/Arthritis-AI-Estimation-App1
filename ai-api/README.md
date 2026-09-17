# AI関節炎判定API

手のRGB画像から関節ごとの炎症を判定するAIモデルをFastAPIでREST API化したものです。API仕様は [`api-spec/openapi.yaml`](../api-spec/openapi.yaml) と [`api-spec/fixtures/`](../api-spec/fixtures/)、解説は [`api-spec/README.md`](../api-spec/README.md) です。

## 主なファイル

| パス | 内容 |
| --- | --- |
| `api.py` | FastAPI、Bearer認証、画像ダウンロード |
| `serve.py` | モデルの読み込みと推論 |
| `model/ra_screening_model.json` | APIが返す `model_version`（Git管理） |
| `model/ra_screening_model.pt` | 学習済み重み（Git管理外、別途配置） |
| `scripts/deploy-cloud-run.sh` | Cloud BuildとCloud Runへのデプロイ |
| `MODEL.md` | モデルの使い方、入出力仕様、内部構造、推論速度（提供元資料） |
| `test_images/` | モデル提供元が3DCGで生成した動作確認用画像 |

## セットアップ

Python 3.11を推奨します。モデル提供元の要件はPython 3.9以降です。

```bash
cp /path/to/ra_screening_model.pt model/ra_screening_model.pt
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

`ra_screening_model.pt` がない状態では推論とデプロイは起動しません。API仕様適合テストには重みは不要です。

```bash
MPLCONFIGDIR=/tmp/ra-mpl python -m pytest -q
```

ローカルでAPIを起動する場合:

```bash
export AI_API_KEY=local-dev-key
export SUPABASE_STORAGE_HOSTS=127.0.0.1
uvicorn api:app --host 127.0.0.1 --port 8080
```

`GET /health` は認証なしで `{"status":"ok"}` を返します。Webから使う設定は [リポジトリのREADME](../README.md#ローカル起動) を参照してください。

## Cloud Runへデプロイ

Google Cloudで支払い方法、必要なAPI、`gcloud` の認証とIAMを準備します。以下の手順で共有APIキーを生成し、Google CloudのSecret Managerと、Vercelの `AI_API_KEY` 環境変数に、それぞれ同じ値を登録してください。

```bash
umask 077
api_key_file=$(mktemp)
openssl rand -hex 32 | tr -d '\n' > "$api_key_file"

# Secret Managerへ値を登録
gcloud secrets create ra-ai-api-key --project=PROJECT_ID --replication-policy=automatic
gcloud secrets versions add ra-ai-api-key --project=PROJECT_ID --data-file="$api_key_file"

# Vercelへ値を登録したあとに削除
rm "$api_key_file"
```

`ra_screening_model.pt` をローカルの `model/ra_screening_model.pt` に配置し、次のデプロイコマンドを実行します。

```bash
# PROJECT_ID と PROJECT_REF は正しい値に置き換えてください
scripts/deploy-cloud-run.sh PROJECT_ID PROJECT_REF.supabase.co ra-ai-api-key
```

- 第1引数: Google CloudプロジェクトID（例：`arthritis-ai-estimation-app`）
- 第2引数: 許可するSupabaseホスト。複数はカンマ区切り（例：`jmtbvryovlvofgowzwbg.supabase.co`）
- 第3引数: APIキーを保存したSecret名（`ra-ai-api-key`）
- 第4引数（任意）: Cloud Runサービス名。デフォルトは `ra-image-inference`

デプロイ先は `asia-northeast1`、8 vCPU、4GiB、concurrency 1、0–2インスタンス、タイムアウト60秒です。サービス自体は公開し、Bearerキーで保護します。デプロイ成功後は課金を抑えるためArtifact Registryの一時リポジトリを削除します。古い版へ戻す場合は再ビルド（デプロイコマンドの再実行）が必要です。

デプロイ後はサービスURLの `GET /health` と実際の解析結果を確認します。

### モデルを更新する

新しいモデルを識別するためのバージョン名を付けます。

```bash
# 新しいバージョン名（任意の形式でOK）
VERSION=2026-09-15-v1
printf '{"model_version": "%s"}\n' "$VERSION" > model/ra_screening_model.json
```

新しいモデルをローカルの `model/ra_screening_model.pt` に配置し、読み込めることを確認します。

```bash
cp /path/to/new_ra_screening_model.pt model/ra_screening_model.pt
python -c 'from serve import RAScreeningService; RAScreeningService.from_checkpoint("model/ra_screening_model.pt", device="cpu"); print("Model loaded successfully")'
# Model loaded successfully と出力されれば成功
```

問題がなければデプロイコマンドを実行します。前述の使い方と同じです。

```bash
# PROJECT_ID と PROJECT_REF は正しい値に置き換えてください
scripts/deploy-cloud-run.sh PROJECT_ID PROJECT_REF.supabase.co ra-ai-api-key
```

サービスURLとキーが変わらなければ、Webの再デプロイは不要です。

### ログの注意

ログには左右、解析結果、`model_version`、エラー理由が含まれます。APIキーと画像データは出しませんが、署名付きURLのトークンは記録されるため、Cloud Loggingの閲覧権限と保持期間を制限してください。

## モデル提供元資料

モデルの使い方、入出力仕様、内部構造、推論速度は [モデル提供元資料](./MODEL.md) を参照してください。
