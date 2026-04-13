#!/bin/bash
# 本番環境に切り替えるスクリプト

echo "🔄 本番環境に切り替え中..."

cp .clasp.production.json .clasp.json

echo "✅ 本番環境に切り替え完了"
echo "   シート: https://docs.google.com/spreadsheets/d/1XFduMSLrX9viD8pnWSEHTT-RRhHdy9uxePgytNNCYIU/edit"

echo ""
echo "確認: clasp status"
npx clasp status
