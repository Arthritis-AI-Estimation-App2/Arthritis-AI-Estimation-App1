# 関節炎スクリーニング REST API 契約（Cloud Run）

機械可読の正は [`contract/openapi.yaml`](../contract/openapi.yaml) と [`contract/fixtures/`](../contract/fixtures/) です。この文書は同じ契約の解説です。

## 通信の流れ

ブラウザはAI APIを直接呼び出しません。画像を非公開のSupabase Storageへ保存した後、Next.jsの`analyzeScreening` Server Actionがログイン状態と画像へのアクセス権を確認し、5分間有効な署名付きURLを発行してCloud Runの同期REST APIを呼び出します。検証済みの結果だけをDBへ保存します。

```text
Browser → Supabase Storage → Next.js Server Action → Cloud Run /v1/ra-screening
                                                ← 判定JSON
```

`AI_API_URL`が未設定の場合はアプリ内モックを使います。実APIを使う場合は`AI_API_URL`とサーバー専用の`AI_API_KEY`を両方設定します。

## エンドポイント

```http
POST {AI_API_URL}/v1/ra-screening
Authorization: Bearer {AI_API_KEY}
Content-Type: application/json
```

Next.js側は`cache: "no-store"`を指定し、55秒でリクエストを中断します。
`AI_API_LOG_RESPONSE=true`を設定した開発環境では、成功レスポンスをNext.jsサーバーのコンソールへ1行JSONで出力します。認証情報と署名付きURLはログに含めません。
成功レスポンスは、管理者だけが詳細画面の折りたたみ式デバッグ表示で確認できるよう保存します。失敗レスポンス本文は従来どおりDBへ保存しません。

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

`images`は1〜2件で、`side`は`left`または`right`です。同じ`side`は重複できません。現在の撮影フローは左手、右手の順で両手を送信します。画像本体、患者情報、Supabaseのクレデンシャルは送信しません。

### 正常レスポンス

```json
{
  "model_version": "2026-09-08-v1",
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

`inference_ms`は入力した全ての手の解析処理時間をミリ秒の非負整数（四捨五入）で返します。前処理・推論・後処理を含み、画像取得・推論ロック待ち・モデル初期化は含みません。旧APIとモックでは省略可能です。保存されたレスポンスの一部として、管理者の撮影記録の詳細画面の「AI画像解析 レスポンスデータ」で確認できます。既存の解析結果には遡って追加されません。

アプリは保存前に次を検証します。

- `hands`の件数と順序が入力画像に一致し、`side`が重複しない
- 確率が0以上1以下の有限数である
- 関節数が0以上の整数で、陽性関節数が検出関節数を超えない
- `joints`と`warnings`が配列である
- 全体の`ra_detected`が手ごとの判定の論理和と一致する
- `total_positive_joints`が手ごとの陽性関節数の合計と一致する
- `model_version`が文字列の場合は前後の空白を除去して保存する（未提供・空文字は未提供として保存する）

関節詳細が返る場合は、`joint_id`、`joint_name`、`probability`、`positive`を検証し、`MCP1`〜`MCP5`、`PIP2`〜`PIP5`、`IP1 (thumb)`、`Wrist`を既存の手の図へ対応付けて保存します。`ra_detected`は関節炎スクリーニングモデルの判定値を表します。診断結果ではありません。

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

APIは次のエラーを返すことがあります。画像ごとの失敗には `error.side` が付き、部分的な推論結果は返りません。Next.js側は200以外を解析失敗として扱い、HTTPステータス、発生日時、運用ログ用のレスポンス本文を記録します。DBにはレスポンス本文を保存せず、再解析可能な`failed`状態へ遷移します。

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
