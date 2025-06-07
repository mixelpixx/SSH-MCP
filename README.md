# SSH MCP

A Model Context Protocol (MCP) server that provides SSH access to remote servers, allowing AI tools like Claude Desktop or VS Code to securely connect to your VPS for website management.

## Features

- SSH connection management with password or key-based authentication
- Remote command execution with timeout handling
- File upload and download via SFTP
- Directory listing
- Secure connection handling
- Compatible with Claude Desktop, VS Code, and other MCP-compatible clients

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- Compatible with Windows, macOS, and Linux

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/mcp-ssh-server.git
   cd mcp-ssh-server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Install globally (optional):**
   ```bash
   npm install -g .
   ```

## Configuration

### Claude Desktop Configuration

1. Open Claude Desktop
2. Go to Settings > Developer (or press Ctrl+Shift+D)
3. Edit the MCP configuration
4. Add the following configuration:

```json
{
  "mcpServers": {
    "ssh-server": {
      "command": "node",
      "args": ["/path/to/mcp-ssh-server/build/index.js"],
      "env": {
        "NODE_NO_WARNINGS": "1"
      }
    }
  }
}
```

**Important:** Replace `/path/to/mcp-ssh-server/build/index.js` with the absolute path to your built index.js file.

### VS Code Configuration (if using MCP extension)

Create or edit `.vscode/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "ssh-server": {
      "command": "node",
      "args": ["/path/to/mcp-ssh-server/build/index.js"]
    }
  }
}
```

## Available Tools

### ssh_connect
Establish an SSH connection to a remote server.

**Parameters:**
- `host` (required) - Hostname or IP address
- `username` (required) - SSH username  
- `password` (optional) - SSH password
- `privateKeyPath` (optional) - Path to private key file
- `passphrase` (optional) - Passphrase for private key
- `port` (optional) - SSH port (default: 22)
- `connectionId` (optional) - Unique identifier for this connection

**Returns:**
- `success` - Boolean indicating success
- `connectionId` - ID to use for subsequent commands
- `message` - Connection status message

**Example:**
```
Connect to my server at example.com using username 'admin' and password authentication
```

### ssh_exec
Execute a command on the remote server.

**Parameters:**
- `connectionId` (required) - ID from ssh_connect
- `command` (required) - Command to execute
- `cwd` (optional) - Working directory
- `timeout` (optional) - Command timeout in milliseconds (default: 60000)

**Returns:**
- `code` - Exit code
- `signal` - Signal that terminated the process (if any)
- `stdout` - Standard output
- `stderr` - Standard error

**Example:**
```
Run "ls -la /var/www/html" on the server
```

### ssh_upload_file
Upload a file to the remote server.

**Parameters:**
- `connectionId` (required) - ID from ssh_connect
- `localPath` (required) - Local file path
- `remotePath` (required) - Remote destination path

**Returns:**
- `success` - Boolean indicating success
- `message` - Upload status message

### ssh_download_file
Download a file from the remote server.

**Parameters:**
- `connectionId` (required) - ID from ssh_connect
- `remotePath` (required) - Remote file path
- `localPath` (required) - Local destination path

**Returns:**
- `success` - Boolean indicating success
- `message` - Download status message

### ssh_list_files
List files in a directory on the remote server.

**Parameters:**
- `connectionId` (required) - ID from ssh_connect
- `remotePath` (required) - Directory path to list

**Returns:**
- `files` - Array of file objects with properties:
  - `filename` - File name
  - `isDirectory` - Boolean indicating if it's a directory
  - `size` - File size
  - `lastModified` - Last modification time

### ssh_disconnect
Close an SSH connection.

**Parameters:**
- `connectionId` (required) - ID from ssh_connect

**Returns:**
- `success` - Boolean indicating success
- `message` - Disconnection status message

## Usage Examples with Claude

1. **Connect to your server:**
   ```
   Please connect to my VPS at example.com using username 'admin' and my SSH key at ~/.ssh/id_rsa
   ```

2. **Check server status:**
   ```
   Run the command "systemctl status nginx" to check web server status
   ```

3. **Upload a website file:**
   ```
   Upload my local file ~/websites/index.html to /var/www/html/index.html on the server
   ```

4. **List website files:**
   ```
   Show me all files in the /var/www/html directory
   ```

5. **Download a backup:**
   ```
   Download the file /var/backups/website-backup.tar.gz to my local Downloads folder
   ```

6. **Disconnect when done:**
   ```
   Please disconnect from the SSH session
   ```

## Planned Ubuntu Website Management Tools

The foundation is in place to add Ubuntu website management tools in `src/ubuntu-website-tools.ts`. Future enhancements will include:

- Web server control (Apache/Nginx)
- System package updates
- Website deployment with backup
- SSL certificate management (Let's Encrypt)
- Server performance monitoring
- Website backup functionality
- WordPress management
- Firewall (UFW) management

## Security Notes

- Store SSH private keys securely
- Use key-based authentication when possible
- Limit SSH access to specific IP addresses
- Keep your server updated
- Use strong passwords or passphrases
- Consider setting up environment variables in a `.env` file for sensitive information

## Troubleshooting

### Server won't start
- Check that Node.js is installed: `node --version`
- Verify all dependencies are installed: `npm install`
- Rebuild the project: `npm run build`

### Connection issues
- Verify SSH server is running on the target
- Check firewall settings
- Confirm credentials are correct
- Test SSH connection manually first

### Claude Desktop integration
- Ensure the path in configuration is absolute
- Restart Claude Desktop after configuration changes
- Check Developer Console for error messages

## Development

To modify or extend the server:

1. Edit source files in `src/`
2. Rebuild: `npm run build`
3. Test your changes
4. Restart Claude Desktop or VS Code to pick up changes

### Running in Development Mode

For quick testing during development:

```bash
npm run dev
```

## Contributing

Contributions for additional tools and features are welcome. Please feel free to submit pull requests or open issues for enhancements and bug fixes.

## License

MIT License
