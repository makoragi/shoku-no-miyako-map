# 食のみやこ熊本券 非公式店舗マップ

「食のみやこ熊本券」の利用可能店舗を、地図・現在地・店名・地域から探せる非公式Webアプリです。

> [!IMPORTANT]
> このサイトは非公式です。店舗情報や位置情報に誤りが含まれる場合があります。利用前に店舗または公式情報をご確認ください。

## データ

- 出典：[9月10日利用開始店舗](https://kumamoto-tabeteouen.com/images/store-0910.pdf)・[9月11日利用開始店舗](https://kumamoto-tabeteouen.com/images/store-0911.pdf)
- 2026年9月9日確認
- 1,188店舗（9月10日開始527店、9月11日開始660店、開始日未確認1店）

## 開発

Node.js 22.13以降が必要です。

```bash
npm ci
npm run dev
```

本番ビルド：

```bash
npm run build
```

### Codex Desktop

このリポジトリをCodexのローカルプロジェクトとして開けば、そのまま開発できます。
プロジェクト固有の作業方針と検証コマンドは `AGENTS.md` に記載しています。
初回のみ `npm ci` を実行し、通常は `npm run dev` で開発サーバーを起動してください。

環境変数は現在不要です。今後シークレットが必要になった場合は、Git管理対象外の
`.env.local` に保存し、値を含まない `.env.example` へ変数名と用途を追記してください。

## Cloudflareへのデプロイ

Cloudflare Workers & PagesでGitHubリポジトリを接続し、次を設定します。

| 項目 | 設定値 |
| --- | --- |
| ビルドコマンド | `npm run build` |
| デプロイコマンド | `npx wrangler deploy --config dist/server/wrangler.json` |
| Node.js | 22以降 |

`main` ブランチへのpushを契機に自動デプロイできます。手元から直接公開する場合は、Cloudflareへログイン後に `npm run deploy` を実行してください。

## 地図タイル

[OpenStreetMap Japan](https://tile.openstreetmap.jp/) の `osm-bright-ja` タイルを使用しています。公開運用時は同サービスの利用条件と負荷制限に従ってください。

## ライセンス

店舗一覧の権利は提供元に帰属します。地図データは OpenStreetMap contributors の著作物です。

# 店舗一覧の更新確認

公式Webサイトの6エリアを取得し、現在の `app/data/stores.json` と照合します。

```bash
npm run check:stores
```

このコマンドは、公式Webと現在データの基準日、エリア別件数、双方にのみ存在する店舗、同一住所の表記変更候補を表示します。公式Webの基準日が現在データより古い場合は警告を表示します。確認専用であり、`stores.json` は変更しません。
