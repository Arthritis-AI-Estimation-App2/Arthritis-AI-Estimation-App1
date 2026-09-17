# 関節炎スクリーニング REST API 仕様（Cloud Run）

OpenAPI形式の仕様書は [`openapi.yaml`](./openapi.yaml) です。この文書はAPI仕様の解説です。

## 通信の流れ

ブラウザはAI APIを直接呼び出しません。画像を非公開のSupabase Storageへ保存した後、Next.jsの`analyzeScreening` Server Actionがログイン状態と、その撮影記録をRLSで参照できることを確認します。解析用の5分間有効な署名付きURLはService Roleで発行し、ブラウザには返しません。Cloud Runの同期REST APIを呼び、検証済みの結果だけをDBへ保存します。

```text
Browser ──画像アップロード──► Supabase Storage（非公開）
Browser ──analyzeScreening──► Next.js Server Action
Next.js ──ログイン確認・撮影記録のRLS参照──► DB
Next.js ──Service Roleで5分の署名付きURL発行──► Storage
Next.js ──POST /v1/ra-screening──► Cloud Run
Cloud Run ──署名付きURLで画像取得──► Storage
Cloud Run ──判定JSON──► Next.js
Next.js ──検証済み結果のみ保存──► DB
```

`AI_API_URL`が未設定の場合はアプリ内モックを使います。実APIを使う場合は`AI_API_URL`とサーバー専用の`AI_API_KEY`を両方設定します。

## エンドポイント

```http
POST {AI_API_URL}/v1/ra-screening
Authorization: Bearer {AI_API_KEY}
Content-Type: application/json
```

Next.js側は`cache: "no-store"`を指定し、55秒でリクエストを中断します。
`AI_API_LOG_RESPONSE=true`のときは、成功レスポンスをNext.jsサーバーのコンソールへ1行JSONで出力します。

### リクエスト

```json
{
  "images": [
    {
      "side": "left",
      "image_url": "<左手画像の署名付きURL>"
    },
    {
      "side": "right",
      "image_url": "<右手画像の署名付きURL>"
    }
  ]
}
```

`images`は1-2要素で、`side`は`left`（左手）または`right`（右手）です。同じ`side`は重複できません。現在の撮影フローは左手、右手の順で両手を送信します。

### 正常レスポンス

```json
{
  "model_version": "2026-09-15-v1",
  "inference_ms": 1234,
  "hands": [
    {
      "side": "left",
      "ra_detected": true,
      "hand_probability": 0.48,
      "num_positive_joints": 3,
      "num_joints_detected": 11,
      "joints": [],
      "warnings": []
    },
    {
      "side": "right",
      "ra_detected": false,
      "hand_probability": 0.22,
      "num_positive_joints": 0,
      "num_joints_detected": 11,
      "joints": [],
      "warnings": []
    }
  ],
  "ra_detected": true,
  "total_positive_joints": 3
}
```

`inference_ms`は入力した全ての手の解析処理時間です。前処理・推論・後処理を含み、画像取得・推論ロック待ち・モデル初期化は含みません。

`model_version`は使用したモデルのバージョンです。

手ごとの `ra_detected`、`hand_probability`、関節数、`joints`、`warnings` は、モデル提供元の `serve.py` が `to_dict()` で返す値です。`side` はAPIがリクエストの手に合わせて付与します。全体の `ra_detected` は手ごとの論理和、`total_positive_joints` は手ごとの陽性関節数の合計です。

### エラーレスポンス

```json
{
  "error": {
    "code": "NO_HAND_DETECTED",
    "message": "No hand was detected in the image.",
    "side": "left"
  },
  "request_id": "..."
}
```

APIは次のエラーを返すことがあります。画像ごとの失敗には `error.side` が付き、部分的な推論結果は返りません。

| HTTP | `error.code` | 内容 |
| ---: | --- | --- |
| 401 | `UNAUTHORIZED` | APIキー未指定・不正 |
| 413 | `IMAGE_TOO_LARGE` | 画像サイズまたは画素数の上限超過 |
| 415 | `UNSUPPORTED_IMAGE_TYPE` | JPEG・PNG以外 |
| 422 | `INVALID_REQUEST` | リクエスト形式、左右指定、署名付きURLが不正 |
| 422 | `INVALID_IMAGE` | 破損画像 |
| 422 | `NO_HAND_DETECTED` | 手を検出できなかった |
| 502 | `IMAGE_FETCH_FAILED` | 署名付きURL期限切れ、リダイレクト、取得失敗 |
| 504 | `IMAGE_FETCH_TIMEOUT` | 画像取得タイムアウト |
| 500 | `INFERENCE_ERROR` | 推論処理の内部エラー |
