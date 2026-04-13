#!/bin/bash

# 現在の .clasp.json から scriptId を取得
CURRENT_ID=$(grep '"scriptId"' .clasp.json | awk -F'"' '{print $4}')
DEV_ID=$(grep '"scriptId"' .clasp.development.json | awk -F'"' '{print $4}')
PROD_ID=$(grep '"scriptId"' .clasp.production.json | awk -F'"' '{print $4}')

echo "=== 現在の環境ステータス ==="

if [ "$CURRENT_ID" = "$DEV_ID" ]; then
    echo "🛠  開発環境 (Development)"
    echo "   ID: $CURRENT_ID"
    echo "   シート: https://docs.google.com/spreadsheets/d/1o2Vtdz4f5FCcKimsj_KH9w9yzRTb3qPJ0zNISHunup4/edit"
elif [ "$CURRENT_ID" = "$PROD_ID" ]; then
    echo "🚀 本番環境 (Production)"
    echo "   ID: $CURRENT_ID"
    echo "   シート: https://docs.google.com/spreadsheets/d/1XFduMSLrX9viD8pnWSEHTT-RRhHdy9uxePgytNNCYIU/edit"
else
    echo "⚠️  不明な環境 (ID: $CURRENT_ID)"
fi
