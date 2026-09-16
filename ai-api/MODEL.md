# モデル提供元資料

以下はモデル提供元の説明を、リポジトリ内の配置に合う最小限の調整だけ加えて掲載しています。

モデル単体の最小依存は `pip install -r requirements.txt` で導入できます。Python 3.9以降でCPU・GPUのどちらでも動作します。`test_images/` は実患者データではなく3DCGの合成画像です。実運用では、スマートフォンなどで撮影した実際の手のRGB画像を入力してください。

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
| --- | --- | --- |
| 画像 | RGB画像（`PIL.Image` または 画像URL） | 片手全体が写ったRGB写真。解像度は問わない（内部で自動的に正規化される）。関節の炎症所見（発赤・腫れ等）が写っていることが望ましい。 |

**画像1枚＝片手1枚分**です。両手を判定したい場合は`predict_from_urls`に2枚のURLを渡してください（内部で1枚ずつ処理し、結果を統合します）。

内部処理の流れ（`serve.py`内）:

1. `download_image(url)` または直接渡した `PIL.Image` を受け取る
2. `HandLandmarkCropper`（MediaPipe Handsを使用）が手のランドマークを検出し、1024×1024に正規化した画像から、**11関節分の関節パッチ**（各256×256）と、**背側（甲側）の参照パッチ**（発赤判定の基準用、256×256）を自動的に切り出す
3. 各パッチを`torch.Tensor`に変換し（`[-1, 1]`に正規化）、モデルに入力する

対象となる11関節（`JOINT_NAMES`、MediaPipeのランドマークから自動特定）:

| joint_id | 関節名 |
| --- | --- |
| 1〜5 | MCP1〜MCP5（中手指節関節） |
| 6〜9 | PIP2〜PIP5（近位指節間関節） |
| 14 | IP1（母指指節間関節） |
| 15 | Wrist（手関節） |

手のランドマークが検出できない画像や、関節が撮影範囲外の場合は、その関節はスキップされ`warnings`に理由が記録されます（後述）。

## モデル内部のテンソル形状（開発者向け）

`predict_from_image`が内部で構築する入力バッチの実体は以下の通りです（`N`=検出できた関節数、通常は11、検出できなかった関節がある場合はそれより少なくなります）。

| 変数名 | 形状 | dtype | 内容 |
| --- | --- | --- | --- |
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
| --- | --- | --- |
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
| --- | --- | --- |
| MediaPipe検出＋関節クロップ（デバイスによらずCPU処理） | 約120ms | 約105ms |
| モデル推論（11関節分） | 約420ms | 約9ms |
| **合計（1画像あたり）** | **約570ms** | **約120ms** |

前処理（MediaPipeによる手検出・クロップ）はCPU固定のコストのため、GPUを使っても大きくは変わりません。モデル推論部分はGPUで約46倍高速化されます。バッチでまとめて大量の画像を処理する用途であれば、GPUの利用を推奨します。

## 補足

- 同梱の`ra_screening_model.pt`は、ハイパーパラメータ探索（Optuna）で見つけた最良設定を使い、5分割交差検証（患者単位で分割、リーク無し）で本番学習した5つのモデルのうち、最も精度の高かった1つです。実運用に耐える精度かどうかは別途評価対象の画像で検証してください。
- モデルは学習用の合成データ（RASH: 3DCGで生成したRA症例データセット）で事前学習し、少数の実患者データでファインチューニングしたものです。
