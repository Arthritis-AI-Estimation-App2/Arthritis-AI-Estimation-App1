# RA関節炎スクリーニング 推論モジュール

手の写真（RGB画像）から、関節リウマチ(RA)による関節炎症の有無を関節ごとに判定するモデルの推論コード一式です。

HTTP API契約の正本は [`contract/`](../contract/) です。解説は [`docs/ai_api_contract.md`](../docs/ai_api_contract.md) を参照してください。リポジトリ全体の説明は [../README.md](../README.md) を参照してください。

## フォルダ構成

```
ai-api/
├── api.py                    FastAPI（認証・署名付きURL取得・契約エラー）
├── serve.py                  推論コード本体
├── Dockerfile                Cloud Run 用イメージ
├── cloudbuild.yaml           Cloud Build（重みをイメージに焼き込んで push）
├── scripts/
│   ├── deploy-cloud-run.sh   Cloud Run へのデプロイ
│   └── verify-received-files.sh  受け取りファイルの検証
├── model/
│   ├── ra_screening_model.json モデルのバージョン情報（Git管理）
│   └── ra_screening_model.pt   学習済みモデル（重みと設定情報を含む。Gitには含まれず、別途配置）
└── test_images/
    └── sample_001〜005.jpg   動作確認用のサンプル画像（CG生成の合成データ）
```

`test_images/` は実患者データではなく、3DCGで生成した合成データです（研究倫理・同意の範囲外のため、実患者の写真は含めていません）。実運用では、実際の手のRGB写真（スマートフォン撮影等）を入力してください。

## セットアップ

重みと設定情報を含む学習済みモデル `model/ra_screening_model.pt` はサイズが大きいので Git には入れていません。clone しただけでは推論できないため、別途受け取った `.pt` を `ai-api/model/ra_screening_model.pt` に置いてください。API が返す `model_version` は、別途 Git 管理している `model/ra_screening_model.json` から読み込みます。

```bash
# 受け取った重みをこのパスへコピーする（ファイル名も合わせる）
cp /path/to/ra_screening_model.pt model/ra_screening_model.pt

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-test.txt
```

重みが無い状態で `serve.py`・API・デプロイを起動すると、配置を促すエラーで停止します。Python 3.11を推奨します。GPU（CUDA）がなくても動作しますが、後述の通り推論速度が変わります。

API の契約テスト（モデル重みは不要）:

```bash
MPLCONFIGDIR=/tmp/ra-mpl python -m pytest -q
```

ローカルで FastAPI を起動する場合（`.pt` が必要です）:

```bash
export AI_API_KEY=local-dev-key
export SUPABASE_STORAGE_HOSTS=127.0.0.1
uvicorn api:app --host 127.0.0.1 --port 8080
```

Web 側の `AI_API_URL` を `http://127.0.0.1:8080` に向けると、モックではなくこの API を使います。

## HTTP API とデプロイ

ブラウザからは直接呼びません。呼び出し元は Next.js の Server Action（`web/src/lib/ai-api.ts`）だけです。リクエストとレスポンスの形式は契約を参照してください。

`GET /health` は認証なしで `{"status":"ok"}` を返します。Cloud Run が予約する `/healthz` は使いません。

Cloud Run へデプロイする前に、共有 API キーを Vercel と Secret Manager の両方へ入れます。キーをログへ出さないでください。

```bash
gcloud secrets create ra-ai-api-key --replication-policy=automatic
gcloud secrets versions add ra-ai-api-key --data-file=/path/to/key-file
scripts/verify-received-files.sh
scripts/deploy-cloud-run.sh PROJECT_ID PROJECT_REF.supabase.co ra-ai-api-key
# 複数のSupabaseプロジェクトを許可する場合
scripts/deploy-cloud-run.sh PROJECT_ID PROJECT_REF.supabase.co,ANOTHER_PROJECT_REF.supabase.co ra-ai-api-key
```

`model/ra_screening_model.pt` が無いと Cloud Build は失敗します。スクリプトは Artifact Registry のリポジトリが無ければ作り、`cloudbuild.yaml` で linux/amd64 イメージに重みを焼き込んで push し、Cloud Run へデプロイします。Cloud Build は標準の `e2-standard-2` を使い、月 2,500 分の無料枠の対象です。高性能マシンは指定しません。リージョンは `asia-northeast1`、8 vCPU、4GiB、concurrency 1、0–2 インスタンス、リクエストタイムアウト 60 秒です。PyTorch の推論スレッド数は 8 に設定しています。リクエストベース課金で、無料枠内に収まるかは起動時間や解析件数に依存します。プラットフォーム上は未認証で公開し、アプリ側の Bearer キーで守ります。

推論イメージは Artifact Registry の月 0.5GB の無料枠より大きいので、残しておくと保管料がかかります。Cloud Run はデプロイ時にイメージを取り込むため、成功後は `ra-inference` リポジトリごと消します。イメージだけ消すとレイヤーが翌日まで残るためです。起動やスケールアウトには、この取り込み済みのコピーで十分です。古い版に戻すときは再ビルドします。次のデプロイでリポジトリは作り直します。デプロイが途中で止まったときのために、直近 1 件を残し、作成から 2 日以上経ったイメージを消すクリーンアップも付けてあります。

Cloud Build のソースアーカイブは `{PROJECT_ID}_cloudbuild` に残ります。Artifact Registry のクリーンアップはこのバケットには効かないため、作成から 3 日以上経ったオブジェクトを削除する Lifecycle を付けます。

リクエストログには手の左右と署名付き画像 URL、成功レスポンスのログにはスクリーニング結果と `model_version` を含めます。署名付き URL の検証に失敗した場合は、`image_url_validation_failed` イベントに対象の左右・URLと、許可外ホスト、スキーム不一致、不正ポート、署名パス不一致、token 不足などの具体的な判定理由を記録します。画像の取得に失敗した場合は、`image_download_failed` イベントに HTTP ステータス、Content-Type、サイズ超過、タイムアウト、通信例外、画像デコード失敗などの原因を記録します。API キーと画像データは出しません。署名付き URL のトークンも Cloud Logging に記録されるため、ログの閲覧権限と保持期間を適切に制限してください。

## 使い方

### ライブラリとして呼び出す場合

```python
from PIL import Image
from serve import RAScreeningService

# モデルを読み込む（1回だけでOK。使い回してください）
service = RAScreeningService.from_checkpoint("model/ra_screening_model.pt", device="cpu")  # GPUなら device="cuda"

# ローカル画像ファイルから推論
image = Image.open("test_images/sample_001.jpg").convert("RGB")
result = service.predict_from_image(image)
print(result.to_dict())

# 画像URL（クラウドストレージ等にアップロード済みの画像）から推論
result_dict = service.predict_from_url("https://example.com/hand.jpg")
print(result_dict)

# 左右両方の手をまとめて判定したい場合
result_dict = service.predict_from_urls(["https://example.com/left.jpg", "https://example.com/right.jpg"])
```

### コマンドラインから呼び出す場合

```bash
python serve.py --checkpoint model/ra_screening_model.pt --image-url https://example.com/hand.jpg
```

結果はJSON形式で標準出力に表示されます。

## 入力の仕様

| 項目 | 型 | 説明 |
|---|---|---|
| 画像 | RGB画像（`PIL.Image` または 画像URL） | 片手全体が写ったRGB写真。解像度は問わない（内部で自動的に正規化される）。関節の炎症所見（発赤・腫れ等）が写っていることが望ましい。 |

**画像1枚＝片手1枚分**です。両手を判定したい場合は`predict_from_urls`に2枚のURLを渡してください（内部で1枚ずつ処理し、結果を統合します）。

内部処理の流れ（`serve.py`内）:
1. `download_image(url)` または直接渡した `PIL.Image` を受け取る
2. `HandLandmarkCropper`（MediaPipe Handsを使用）が手のランドマークを検出し、1024×1024に正規化した画像から、**11関節分の関節パッチ**（各256×256）と、**背側（甲側）の参照パッチ**（発赤判定の基準用、256×256）を自動的に切り出す
3. 各パッチを`torch.Tensor`に変換し（`[-1, 1]`に正規化）、モデルに入力する

対象となる11関節（`JOINT_NAMES`、MediaPipeのランドマークから自動特定）:

| joint_id | 関節名 |
|---|---|
| 1〜5 | MCP1〜MCP5（中手指節関節） |
| 6〜9 | PIP2〜PIP5（近位指節間関節） |
| 14 | IP1（母指指節間関節） |
| 15 | Wrist（手関節） |

手のランドマークが検出できない画像や、関節が撮影範囲外の場合は、その関節はスキップされ`warnings`に理由が記録されます（後述）。

## モデル内部のテンソル形状（開発者向け）

`predict_from_image`が内部で構築する入力バッチの実体は以下の通りです（`N`=検出できた関節数、通常は11、検出できなかった関節がある場合はそれより少なくなります）。

| 変数名 | 形状 | dtype | 内容 |
|---|---|---|---|
| `x` | `(N, 3, 256, 256)` | `float32` | 関節パッチのRGB画像。`Normalize([0.5]*3, [0.5]*3)`適用済み（値域は概ね`[-1, 1]`） |
| `joint_id` | `(N,)` | `int64` | 各パッチがどの関節かを表すID（上表参照。0はパディング用の未使用ID） |
| `edge_index` | `(2, E)` | `int64` | 関節間の隣接関係を表すグラフのエッジ（GNNの入力。指のMCP-PIP間・MCP同士の隣接に基づく双方向グラフ） |
| `dorsum_x` | `(N, 3, 256, 256)` | `float32` | 背側参照パッチを関節数分複製したもの（発赤の基準値計算に使用。検出できなかった場合は`None`で、その場合は自己参照で代替） |

モデル本体（`DualPathGNNClassifier.forward`）は上記をひとまとめにした`torch_geometric.data.Batch`を受け取り、関節ごとの炎症確率（シグモイド後、`0〜1`のfloat、形状`(N,)`）を返します。

## 出力の仕様

`predict_from_image` / `predict_from_url` の返り値（`HandResult.to_dict()`、JSON化可能な辞書）:

```json
{
  "ra_detected": true,
  "hand_probability": 0.4808,
  "num_positive_joints": 3,
  "num_joints_detected": 11,
  "joints": [
    {
      "joint_id": 1,
      "joint_name": "MCP1",
      "probability": 0.4802,
      "positive": true
    },
    ...
  ],
  "warnings": []
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `ra_detected` | `bool` | この手（画像1枚）全体としてRA陽性と判定したか。全関節中の最大確率がしきい値`thr_hand`以上なら`true` |
| `hand_probability` | `float`（0〜1） | 全関節の確率のうち最大値（手レベルの代表確率） |
| `num_positive_joints` | `int` | 陽性と判定された関節の数 |
| `num_joints_detected` | `int` | 検出・判定できた関節の数（最大11。手が一部隠れている等で検出できない場合はそれ未満） |
| `joints` | `list` | 関節ごとの結果のリスト（検出できた関節の分だけ） |
| `joints[].joint_id` | `int` | 関節ID（上表参照） |
| `joints[].joint_name` | `str` | 関節名（例: `"MCP1"`） |
| `joints[].probability` | `float`（0〜1） | その関節の炎症確率（モデルの生出力にシグモイドを適用した値） |
| `joints[].positive` | `bool` | `probability >= thr_node`（関節レベルのしきい値）で陽性判定したか |
| `warnings` | `list[str]` | 手が検出できなかった、特定の関節が撮影範囲外だった等の注意事項（正常系でも空リストとは限らない） |

しきい値（`thr_node`＝関節レベル、`thr_hand`＝手レベル）は学習時に検証データで調整された値が`model/ra_screening_model.pt`内に保存されており、モデル読み込み時に自動的に反映されます（コード側で指定する必要はありません）。

`predict_from_urls`（両手をまとめて判定する場合）の返り値:

```json
{
  "hands": [ /* 上記のHandResult辞書が手の数だけ並ぶ（各要素に image_url も含む） */ ],
  "ra_detected": true,
  "total_positive_joints": 5
}
```

## 推論速度の目安

同一ハードウェア（Intel Xeon w9-3475X / NVIDIA RTX 6000 Ada Generation）で計測した、画像1枚あたりの処理時間の目安です。

| 処理 | CPU | GPU |
|---|---|---|
| MediaPipe検出＋関節クロップ（デバイスによらずCPU処理） | 約120ms | 約105ms |
| モデル推論（11関節分） | 約420ms | 約9ms |
| **合計（1画像あたり）** | **約570ms** | **約120ms** |

前処理（MediaPipeによる手検出・クロップ）はCPU固定のコストのため、GPUを使っても大きくは変わりません。モデル推論部分はGPUで約46倍高速化されます。バッチでまとめて大量の画像を処理する用途であれば、GPUの利用を推奨します。

## 補足

- 別途配置する`ra_screening_model.pt`は、ハイパーパラメータ探索（Optuna）で見つけた最良設定を使い、5分割交差検証（患者単位で分割、リーク無し）で本番学習した5つのモデルのうち、最も精度の高かった1つです。実運用に耐える精度かどうかは別途評価対象の画像で検証してください。
- モデルは学習用の合成データ（RASH: 3DCGで生成したRA症例データセット）で事前学習し、少数の実患者データでファインチューニングしたものです。
