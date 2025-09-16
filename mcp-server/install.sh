#!/bin/bash

# Daisy MCP Server Installation Script
# This script installs the daisy MCP server and sets up configurations for various AI assistants

set -e

echo "🌼 Installing Daisy MCP Server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed. Please install npm first."
    exit 1
fi

# Install the MCP server globally
echo "📦 Installing daisy-mcp-server..."
cd mcp-server
npm install
npm run build

# Make CLI available globally (optional)
echo "🔗 Linking for global use..."
npm link

echo "✅ Daisy MCP Server installed successfully!"
echo ""
echo "🚀 Next Steps:"
echo ""
echo "1. For Claude Desktop:"
echo "   Copy configs/claude-desktop.json to your Claude Desktop configuration"
echo "   Typically located at: ~/.claude/config.json"
echo ""
echo "2. For VS Code + Copilot:"
echo "   Use the configuration in configs/vscode-copilot.json"
echo "   Add to your VS Code settings under 'mcp.servers'"
echo ""
echo "3. For Cursor:"
echo "   Copy configs/cursor.json to your Cursor configuration"
echo "   Add to .cursor-settings/mcp.json in your project"
echo ""
echo "4. For Windsurf:"
echo "   Copy configs/windsurf.mcp.json to your Windsurf MCP configuration"
echo "   Typically located at: ~/.windsurf/mcp.json"
echo ""
echo "5. Test the installation:"
echo "   daisy-mcp --help"
echo "   daisy-mcp --auto-detect"
echo ""
echo "📖 For detailed setup instructions, see: docs/setup-guide.md"
echo ""
echo "🌼 Happy debugging with Daisy!"