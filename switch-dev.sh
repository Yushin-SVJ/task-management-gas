#!/bin/bash
# 開発環境に切り替えるスクリプト

echo "🔄 開発環境に切り替え中..."

cp .clasp.development.json .clasp.json

echo "✅ 開発環境に切り替え完了"
echo "   シート: https://docs.google.com/spreadsheets/d/1o2Vtdz4f5FCcKimsj_KH9w9yzRTb3qPJ0zNISHunup4/edit"

echo ""
echo "確認: clasp status"
npx clasp status
