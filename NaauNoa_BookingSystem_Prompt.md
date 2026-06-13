# Na'au Noa 予約システム 再現プロンプト

以下のプロンプトをそのまま別タブのClaudeに渡すと、同等の予約システムを一から構築できます。

---

## ▼ 別Claudeへのプロンプト（ここからコピー）

---

Na'au Noa（ナアウノア）という個人コーチングサービスの予約システムを構築してください。Vercel（サーバーレス）+ Supabase（PostgreSQL）構成で、フロントは単一HTMLファイルです。

---

## 1. 技術スタック

- **ホスティング**: Vercel（`/api/*.js` = サーバーレス関数）
- **DB**: Supabase（REST API経由 / 直接httpリクエスト、supabaseクライアントライブラリは使わない）
- **メール**: Resend API（管理者通知）+ Gmail SMTP nodemailer（お客様確認、失敗時はResendフォールバック）
- **トラッキング**: Meta Conversions API（予約完了時）
- **フォント**: Noto Serif JP（Google Fonts）

---

## 2. ブランドカラー

```
--deep:  #1a3a3a  （濃いグリーン、ヘッダー・ボタン背景）
--amber: #b8976a  （ゴールドブラウン、アクセント）
--gold:  #e8c080  （薄ゴールド）
--cream: #faf8f5  （ページ背景）
--bg:    #f0ebe3  （セクション背景）
```

---

## 3. Supabaseの接続情報

```
SUPABASE_URL: https://quacqiugfcwdqxzutqpq.supabase.co
SUPABASE_ANON_KEY: sb_publishable_eyMShPrkyDZvtSejJDx9HA_UgMsRwJI
```

---

## 4. Supabase テーブル構成

### `slots` テーブル
```sql
CREATE TABLE slots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  start_time time NOT NULL,
  is_available boolean DEFAULT true,
  is_booked boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

### `bookings` テーブル
```sql
CREATE TABLE bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id uuid REFERENCES slots(id),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  menu text NOT NULL,
  message text,
  created_at timestamptz DEFAULT now()
);
```

### `admin_settings` テーブル
```sql
CREATE TABLE IF NOT EXISTS admin_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO admin_settings (key, value)
VALUES ('daily_capacity_mins', '180')
ON CONFLICT (key) DO NOTHING;
```

---

## 5. メニュー構成（booking.html）

```javascript
const MENU_CONFIG = {
  'オンライン無料個別相談':              { duration: 60, type: 'online' },
  'ベストエンディングワーク':             { duration: 60, type: 'online' },
  'リミットブレイクセッション':            { duration: 60, type: 'online' },
  'リミットブレイクセッション（2回目以降）': { duration: 60, type: 'online' }
};

const MENU_MAX_SLOTS = {
  'オンライン無料個別相談':              17,
  'ベストエンディングワーク':             17,
  'リミットブレイクセッション':            17,
  'リミットブレイクセッション（2回目以降）': 17
};
```

---

## 6. APIエンドポイント（/api/*.js）

### `/api/get-slots` — GET
クエリ: `?year=YYYY&month=M`
- Supabaseの`slots`テーブルから`is_available=true, is_booked=false`の枠を取得
- 22:00以降を除外
- `admin_settings`の`daily_capacity_mins`（デフォルト180分）を取得し、その日の予約済み分数が上限以上の日は全枠を除外
- レスポンス: `[{ id, date, start_time, ... }]`

### `/api/create-booking` — POST
ボディ: `{ slotId, name, email, phone, menu, message, sourceUrl, fbc, fbp }`
1. 対象スロットが`is_available=true, is_booked=false`か確認（競合なら409）
2. 1日あたりの上限チェック（daily_capacity_mins）
3. メニューの所要時間（60分）分の連続スロット（15分刻み）がすべて空きか確認
4. `bookings`テーブルにINSERT
5. 連続スロット全てを`is_booked=true`にPATCH
6. 管理者・お客様にメール送信（Resend + Gmail SMTP）
7. Meta CAPI送信（`CompleteRegistration`イベント）

**メニューごとの所要時間（MENU_DURATIONS）**:
```javascript
const MENU_DURATIONS = {
  'オンライン無料個別相談': 60,
  'ベストエンディングワーク': 60,
  'リミットブレイクセッション': 60,
  'リミットブレイクセッション（2回目以降）': 60
};
```

### `/api/admin-bookings` — GET
- ヘッダー `X-Admin-Password: taisyo1023` が必要
- `bookings?select=*,slots(date,start_time)&order=created_at.desc` を返す

### `/api/admin-slots` — GET / POST / DELETE
- ヘッダー `X-Admin-Password: taisyo1023` が必要
- **GET**: `?year=YYYY&month=M` でその月の全スロット取得（is_availableに関わらず全件）
- **POST**: `{ date, times: ["HH:MM",...], blocked?: bool }` で枠を追加。`blocked=true`なら`is_available=false, is_booked=true`（ブロック枠）
- **DELETE**: `?ids=uuid1,uuid2&force=true` で一括削除。`force=true`なら予約済みも削除

### `/api/admin-settings` — GET / POST
- ヘッダー `X-Admin-Password: taisyo1023` が必要
- **GET**: `daily_capacity_mins` を返す（デフォルト180）
- **POST**: `{ key, value }` でupsert

---

## 7. booking.html の機能仕様

### UI フロー（ステップ形式）
1. **Step 1**: メニュー選択 → カレンダーが有効化される
2. **Step 2（同一Step1カードの下）**: カレンダー表示（月単位）
   - `GET /api/get-slots?year=&month=` で枠を取得
   - 日セルに色ドットで残り枠数を表示:
     - 🟢 緑（●）= 全枠空き（MAX_SLOTS以上）
     - 🟡 黄（●）= 残りあり（1〜MAX_SLOTS-1）
     - 🔴 赤（●）= 残りわずか（2枠以下）→ パルスアニメーション付き
     - ⚫ 灰（●）= 満席（枠あるが全部埋まり）
   - 過去日はグレーアウト
3. **Step 2（別カード）**: 時間選択グリッド（3列）→ 選んだ日の有効スロットを表示
4. **Step 3**: 入力フォーム（お名前・メール・電話・お悩み）→ 予約確定ボタン

### 連続枠チェック（フロント）
`hasConsecutiveSlots(dateStr, startTime, durationMins)`: 選択した時刻から60分分（4枠）の15分スロットがすべて存在するか確認。条件を満たす枠のみ時間グリッドに表示。

### 予約完了後
- 成功: `step3`を完了メッセージに差し替え、`fbq('track','CompleteRegistration')` 発火
- 失敗: エラーメッセージ表示

### メニュー表示HTML
```html
<div class="menu-opt" data-key="オンライン無料個別相談" onclick="selectMenu(this)">
  <div class="menu-opt-title">🎁 無料オンライン個別相談</div>
  <div class="menu-opt-detail">60分 / 完全無料 / Zoom（全国対応）</div>
  <span class="menu-check">✓</span>
</div>
<div class="menu-opt" data-key="ベストエンディングワーク" onclick="selectMenu(this)">
  <div class="menu-opt-title">🙏 人生の軸と停滞の原因が見つかるベストエンディングワーク</div>
  <div class="menu-opt-detail">60分 / 自由料金 / Zoom（全国対応）</div>
  <span class="menu-check">✓</span>
</div>
<div class="menu-opt" data-key="リミットブレイクセッション" onclick="selectMenu(this)">
  <div class="menu-opt-title">⚡ リミットブレイクセッション
    <span style="background:#c0392b;color:#fff;font-size:0.68rem;padding:2px 8px;border-radius:10px;margin-left:6px;">初回割引</span>
  </div>
  <div class="menu-opt-detail">60分 / Zoom（全国対応）<br>
    <span style="font-weight:700;color:#b8976a;">¥33,000</span>
    <span style="text-decoration:line-through;color:#aaa;font-size:0.75rem;margin-left:4px;">¥55,000</span>
  </div>
  <span class="menu-check">✓</span>
</div>
<div class="menu-opt" data-key="リミットブレイクセッション（2回目以降）" onclick="selectMenu(this)">
  <div class="menu-opt-title">⚡ リミットブレイクセッション（2回目以降）</div>
  <div class="menu-opt-detail">60分 / Zoom（全国対応）<br>
    <span style="font-weight:700;">¥55,000</span>
  </div>
  <span class="menu-check">✓</span>
</div>
```

---

## 8. admin.html の機能仕様

### ログイン
- パスワード入力 → `GET /api/admin-bookings`（`X-Admin-Password`ヘッダー）で認証確認
- 正解パスワード: `taisyo1023`

### タブ1: 予約一覧
- `GET /api/admin-bookings` で取得
- テーブル表示: 日時 / メニュー / お名前 / メール / 電話 / 相談内容 / 受付日時

### タブ2: 枠設定

#### タイムラインカレンダー（週単位）
- 横軸: 月〜日（7列）
- 縦軸: 08:00〜21:45（15分刻み、56行）
- セルの色:
  - ⬜ 白（`empty`）= 未設定
  - 🟩 緑（`available`）= 予約受付中
  - 🟥 赤（`booked`）= 予約済み
  - 🟦 青（`sel-add`）= 追加予定（選択中）
  - 🟧 オレンジ（`sel-del`）= 削除予定（選択中）
  - 🟪 紫（`sel-booked-del`）= 予約済み強制削除予定（選択中）
- マウスドラッグで矩形範囲選択

#### アクションボタン
- **✚ 選択枠を追加**: 選択中の空白セル → 受付中（`POST /api/admin-slots`）
- **🔒 ブロック追加**: 選択中の空白セル → ブロック枠（blocked=true）
- **✕ 選択枠を削除**: 選択中の受付中セル → 削除（`DELETE /api/admin-slots?ids=...`）
- **🗑 予約済み枠を削除**: 選択中の予約済みセル → 強制削除（`?force=true`）

#### 定例ブロック（一括追加/削除）
- 対象月 × 曜日（複数選択可）× 開始〜終了時間
- **一括追加**: 対象月の選択曜日すべてに15分刻みで枠を`POST`
- **一括削除**: 該当する未予約枠を一括`DELETE`

#### 満枠設定
- `daily_capacity_mins`（デフォルト180分）
- `GET /api/admin-settings` で取得 / `POST /api/admin-settings` で保存
- 1日の予約済み分数がこれ以上になると、残り枠を顧客側に非表示

---

## 9. メール仕様

### 管理者通知（Resend）
- **From**: `Na'au Noa 予約 <onboarding@resend.dev>`
- **To**: `neuro.vitality.revival@gmail.com`
- **件名**: `【予約通知】{name}様 {dateLabel} {startTime}〜`
- Zoomリンク: `https://us06web.zoom.us/j/5906154770?pwd=mMgbqphSP1cBUW33dnvKadsBUmHpwz.1`（ID: 590 615 4770 / PW: 777）

### お客様確認（Gmail SMTP優先 → Resendフォールバック）
- **From**: `"Na'au Noa" <neuro.vitality.revival@gmail.com>`
- **件名**: `ご予約を承りました（{dateLabel} {startTime}〜）`
- 内容: 予約詳細 + Zoom情報 + アンケートリンク（`https://naau-noa.vercel.app/survey.html`）

---

## 10. Meta CAPI

- **Pixel ID**: `2080933312746435`
- **アクセストークン**: `EAAU7PbtGoZAIBReDwLpfbbo6AvazK5yqebVjLuEZCN2IKvNoh9Y4Gkbb2jrD9v2HWHpgUkKKJhZCvsba65MKnj3wLP1ZAzE5R7GKr8j4lwZBEcPcdC3FVGmLefu3HsjVV66Wf7EZCCRVi5M4SqM0HXlxPnHGz85zmmqpWUVNSBvS95wO3S1dASP3ag2vRPXkEa`
- イベント: `CompleteRegistration`（予約確定時）
- user_data: em/ph/fn/ln をSHA256ハッシュ化

---

## 11. 環境変数（Vercel）

```
RESEND_API_KEY=（Resend APIキー）
GMAIL_PASS=（GmailアプリパスワードまたはOAuth）
```

---

## 12. ファイル構成

```
/
├── booking.html          # ユーザー向け予約ページ
├── admin.html            # 管理画面
└── api/
    ├── get-slots.js      # 月別スロット取得（認証不要）
    ├── create-booking.js # 予約作成（メール+CAPI）
    ├── admin-slots.js    # スロット管理CRUD（管理者専用）
    ├── admin-bookings.js # 予約一覧取得（管理者専用）
    └── admin-settings.js # 満枠設定（管理者専用）
```

---

## 13. 作成の手順

1. まず`/api/get-slots.js`と`/api/admin-slots.js`と`/api/admin-bookings.js`と`/api/admin-settings.js`と`/api/create-booking.js`の5ファイルを上記仕様通りに作成
2. `booking.html`を作成（単一ファイル、インラインCSS+JS）
3. `admin.html`を作成（単一ファイル、インラインCSS+JS）
4. `booking.html`と`admin.html`の`<head>`にMeta Pixel（Pixel ID: `2080933312746435`）を埋め込む

---

## 14. デザイン指示

- モバイルファースト（`max-width: 680px`の中央寄せコンテナ）
- 角丸カード（`border-radius: 12px`）+ 薄影（`box-shadow: 0 2px 20px rgba(0,0,0,0.06)`）
- ホバー時は`translateY(-3px)` + 影強調
- タップ時は`scale(0.94)`
- アニメーション: 選択・遷移は`transition: all 0.2s`
- フォントは`Noto Serif JP`（400/600）
- 残り枠わずかのセルは`animation: pulse 1.8s ease-in-out infinite`（赤いglow）

---

▲ ここまでがプロンプト

