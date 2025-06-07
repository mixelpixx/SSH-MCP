#!/usr/bin/env node
/**
 * MCP SSH Server
 *
 * A Model Context Protocol (MCP) server that provides SSH access to remote servers.
 * This allows AI tools like Claude or VS Code to securely connect to your VPS.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client } from "ssh2";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as dotenv from "dotenv";
// Load environment variables from .env file if present
dotenv.config();
class SSHMCPServer {
    constructor() {
        this.connections = new Map();
        this.server = new Server({
            name: "MCP SSH Server",
            version: "1.0.0"
        }, {
            capabilities: {
                tools: {
                    ssh_connect: {
                        description: "Connect to a remote server via SSH",
                        inputSchema: {
                            type: "object",
                            properties: {
                                host: {
                                    type: "string",
                                    description: "Hostname or IP address of the remote server"
                                },
                                port: {
                                    type: "number",
                                    description: "SSH port (default: 22)"
                                },
                                username: {
                                    type: "string",
                                    description: "SSH username"
                                },
                                password: {
                                    type: "string",
                                    description: "SSH password (if not using key-based authentication)"
                                },
                                privateKeyPath: {
                                    type: "string",
                                    description: "Path to private key file (if using key-based authentication)"
                                },
                                passphrase: {
                                    type: "string",
                                    description: "Passphrase for private key (if needed)"
                                },
                                connectionId: {
                                    type: "string",
                                    description: "Unique identifier for this connection (to reference in future commands)"
                                }
                            },
                            required: ["host", "username"]
                        }
                    },
                    ssh_exec: {
                        description: "Execute a command on the remote server",
                        inputSchema: {
                            type: "object",
                            properties: {
                                connectionId: {
                                    type: "string",
                                    description: "ID of an active SSH connection"
                                },
                                command: {
                                    type: "string",
                                    description: "Command to execute"
                                },
                                cwd: {
                                    type: "string",
                                    description: "Working directory for the command"
                                },
                                timeout: {
                                    type: "number",
                                    description: "Command timeout in milliseconds"
                                }
                            },
                            required: ["connectionId", "command"]
                        }
                    },
                    ssh_upload_file: {
                        description: "Upload a file to the remote server",
                        inputSchema: {
                            type: "object",
                            properties: {
                                connectionId: {
                                    type: "string",
                                    description: "ID of an active SSH connection"
                                },
                                localPath: {
                                    type: "string",
                                    description: "Path to the local file"
                                },
                                remotePath: {
                                    type: "string",
                                    description: "Path where the file should be saved on the remote server"
                                }
                            },
                            required: ["connectionId", "localPath", "remotePath"]
                        }
                    },
                    ssh_download_file: {
                        description: "Download a file from the remote server",
                        inputSchema: {
                            type: "object",
                            properties: {
                                connectionId: {
                                    type: "string",
                                    description: "ID of an active SSH connection"
                                },
                                remotePath: {
                                    type: "string",
                                    description: "Path to the file on the remote server"
                                },
                                localPath: {
                                    type: "string",
                                    description: "Path where the file should be saved locally"
                                }
                            },
                            required: ["connectionId", "remotePath", "localPath"]
                        }
                    },
                    ssh_list_files: {
                        description: "List files in a directory on the remote server",
                        inputSchema: {
                            type: "object",
                            properties: {
                                connectionId: {
                                    type: "string",
                                    description: "ID of an active SSH connection"
                                },
                                remotePath: {
                                    type: "string",
                                    description: "Path to the directory on the remote server"
                                }
                            },
                            required: ["connectionId", "remotePath"]
                        }
                    },
                    ssh_disconnect: {
                        description: "Close an SSH connection",
                        inputSchema: {
                            type: "object",
                            properties: {
                                connectionId: {
                                    type: "string",
                                    description: "ID of an active SSH connection"
                                }
                            },
                            required: ["connectionId"]
                        }
                    }
                }
            }
        });
        this.setupHandlers();
    }
    setupHandlers() {
        // Register tool list handler
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'ssh_connect',
                    description: 'Connect to a remote server via SSH',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            host: { type: 'string', description: 'Hostname or IP address of the remote server' },
                            port: { type: 'number', description: 'SSH port (default: 22)' },
                            username: { type: 'string', description: 'SSH username' },
                            password: { type: 'string', description: 'SSH password (if not using key-based authentication)' },
                            privateKeyPath: { type: 'string', description: 'Path to private key file (if using key-based authentication)' },
                            passphrase: { type: 'string', description: 'Passphrase for private key (if needed)' },
                            connectionId: { type: 'string', description: 'Unique identifier for this connection' }
                        },
                        required: ['host', 'username']
                    }
                },
                {
                    name: 'ssh_exec',
                    description: 'Execute a command on the remote server',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            connectionId: { type: 'string', description: 'ID of an active SSH connection' },
                            command: { type: 'string', description: 'Command to execute' },
                            cwd: { type: 'string', description: 'Working directory for the command' },
                            timeout: { type: 'number', description: 'Command timeout in milliseconds' }
                        },
                        required: ['connectionId', 'command']
                    }
                },
                {
                    name: 'ssh_upload_file',
                    description: 'Upload a file to the remote server',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            connectionId: { type: 'string', description: 'ID of an active SSH connection' },
                            localPath: { type: 'string', description: 'Path to the local file' },
                            remotePath: { type: 'string', description: 'Path where the file should be saved on the remote server' }
                        },
                        required: ['connectionId', 'localPath', 'remotePath']
                    }
                },
                {
                    name: 'ssh_download_file',
                    description: 'Download a file from the remote server',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            connectionId: { type: 'string', description: 'ID of an active SSH connection' },
                            remotePath: { type: 'string', description: 'Path to the file on the remote server' },
                            localPath: { type: 'string', description: 'Path where the file should be saved locally' }
                        },
                        required: ['connectionId', 'remotePath', 'localPath']
                    }
                },
                {
                    name: 'ssh_list_files',
                    description: 'List files in a directory on the remote server',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            connectionId: { type: 'string', description: 'ID of an active SSH connection' },
                            remotePath: { type: 'string', description: 'Path to the directory on the remote server' }
                        },
                        required: ['connectionId', 'remotePath']
                    }
                },
                {
                    name: 'ssh_disconnect',
                    description: 'Close an SSH connection',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            connectionId: { type: 'string', description: 'ID of an active SSH connection' }
                        },
                        required: ['connectionId']
                    }
                }
            ]
        }));
        // Register tool call handler
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            switch (request.params.name) {
                case 'ssh_connect':
                    return this.handleSSHConnect(request.params.arguments);
                case 'ssh_exec':
                    return this.handleSSHExec(request.params.arguments);
                case 'ssh_upload_file':
                    return this.handleSSHUpload(request.params.arguments);
                case 'ssh_download_file':
                    return this.handleSSHDownload(request.params.arguments);
                case 'ssh_list_files':
                    return this.handleSSHListFiles(request.params.arguments);
                case 'ssh_disconnect':
                    return this.handleSSHDisconnect(request.params.arguments);
                default:
                    throw new Error(`Unknown tool: ${request.params.name}`);
            }
        });
    }
    async handleSSHConnect(params) {
        const { host, port = 22, username, password, privateKeyPath, passphrase, connectionId = `ssh-${Date.now()}` } = params;
        // Verify we have either a password or a private key
        if (!password && !privateKeyPath) {
            return {
                content: [{ type: "text", text: "Either password or privateKeyPath must be provided" }],
                isError: true
            };
        }
        // Create SSH connection options
        const sshConfig = {
            host,
            port,
            username,
            readyTimeout: 30000, // 30 seconds timeout for connection
        };
        // Add authentication method
        if (privateKeyPath) {
            try {
                // Expand tilde if present in the path
                const expandedPath = privateKeyPath.replace(/^~/, os.homedir());
                sshConfig.privateKey = fs.readFileSync(expandedPath);
                if (passphrase) {
                    sshConfig.passphrase = passphrase;
                }
            }
            catch (error) {
                return {
                    content: [{ type: "text", text: `Failed to read private key: ${error.message}` }],
                    isError: true
                };
            }
        }
        else if (password) {
            sshConfig.password = password;
        }
        // Create a new SSH client
        const conn = new Client();
        try {
            // Connect to the server and wait for the "ready" event
            await new Promise((resolve, reject) => {
                conn.on("ready", () => {
                    resolve(true);
                });
                conn.on("error", (err) => {
                    reject(new Error(`SSH connection error: ${err.message}`));
                });
                conn.connect(sshConfig);
            });
            // Store the connection for future use
            this.connections.set(connectionId, { conn, config: { host, port, username } });
            return {
                content: [{
                        type: "text",
                        text: `Successfully connected to ${username}@${host}:${port}\nConnection ID: ${connectionId}`
                    }]
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Failed to connect: ${error.message}` }],
                isError: true
            };
        }
    }
    async handleSSHExec(params) {
        const { connectionId, command, cwd, timeout = 60000 } = params;
        // Check if the connection exists
        if (!this.connections.has(connectionId)) {
            return {
                content: [{ type: "text", text: `No active SSH connection with ID: ${connectionId}` }],
                isError: true
            };
        }
        const { conn } = this.connections.get(connectionId);
        // Execute the command
        try {
            const result = await new Promise((resolve, reject) => {
                const execOptions = {};
                if (cwd)
                    execOptions.cwd = cwd;
                // Set up timeout
                const timeoutId = setTimeout(() => {
                    reject(new Error(`Command execution timed out after ${timeout}ms`));
                }, timeout);
                conn.exec(command, execOptions, (err, stream) => {
                    if (err) {
                        clearTimeout(timeoutId);
                        return reject(new Error(`Failed to execute command: ${err.message}`));
                    }
                    let stdout = '';
                    let stderr = '';
                    stream.on('close', (code, signal) => {
                        clearTimeout(timeoutId);
                        resolve({
                            code,
                            signal,
                            stdout: stdout.trim(),
                            stderr: stderr.trim()
                        });
                    });
                    stream.on('data', (data) => {
                        stdout += data.toString();
                    });
                    stream.stderr.on('data', (data) => {
                        stderr += data.toString();
                    });
                });
            });
            const output = result.stdout || result.stderr || '(no output)';
            return {
                content: [{
                        type: "text",
                        text: `Command: ${command}\nExit code: ${result.code}\nOutput:\n${output}`
                    }]
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Command execution failed: ${error.message}` }],
                isError: true
            };
        }
    }
    async handleSSHUpload(params) {
        const { connectionId, localPath, remotePath } = params;
        // Check if the connection exists
        if (!this.connections.has(connectionId)) {
            return {
                content: [{ type: "text", text: `No active SSH connection with ID: ${connectionId}` }],
                isError: true
            };
        }
        const { conn } = this.connections.get(connectionId);
        try {
            // Expand tilde if present in the local path
            const expandedLocalPath = localPath.replace(/^~/, os.homedir());
            // Check if the local file exists
            if (!fs.existsSync(expandedLocalPath)) {
                return {
                    content: [{ type: "text", text: `Local file does not exist: ${expandedLocalPath}` }],
                    isError: true
                };
            }
            // Get SFTP client
            const sftp = await new Promise((resolve, reject) => {
                conn.sftp((err, sftp) => {
                    if (err) {
                        reject(new Error(`Failed to initialize SFTP: ${err.message}`));
                    }
                    else {
                        resolve(sftp);
                    }
                });
            });
            // Upload the file
            await new Promise((resolve, reject) => {
                sftp.fastPut(expandedLocalPath, remotePath, (err) => {
                    if (err) {
                        reject(new Error(`Failed to upload file: ${err.message}`));
                    }
                    else {
                        resolve(true);
                    }
                });
            });
            return {
                content: [{ type: "text", text: `Successfully uploaded ${expandedLocalPath} to ${remotePath}` }]
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `File upload failed: ${error.message}` }],
                isError: true
            };
        }
    }
    async handleSSHDownload(params) {
        const { connectionId, remotePath, localPath } = params;
        // Check if the connection exists
        if (!this.connections.has(connectionId)) {
            return {
                content: [{ type: "text", text: `No active SSH connection with ID: ${connectionId}` }],
                isError: true
            };
        }
        const { conn } = this.connections.get(connectionId);
        try {
            // Expand tilde if present in the local path
            const expandedLocalPath = localPath.replace(/^~/, os.homedir());
            // Ensure the directory exists
            const dir = path.dirname(expandedLocalPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Get SFTP client
            const sftp = await new Promise((resolve, reject) => {
                conn.sftp((err, sftp) => {
                    if (err) {
                        reject(new Error(`Failed to initialize SFTP: ${err.message}`));
                    }
                    else {
                        resolve(sftp);
                    }
                });
            });
            // Download the file
            await new Promise((resolve, reject) => {
                sftp.fastGet(remotePath, expandedLocalPath, (err) => {
                    if (err) {
                        reject(new Error(`Failed to download file: ${err.message}`));
                    }
                    else {
                        resolve(true);
                    }
                });
            });
            return {
                content: [{ type: "text", text: `Successfully downloaded ${remotePath} to ${expandedLocalPath}` }]
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `File download failed: ${error.message}` }],
                isError: true
            };
        }
    }
    async handleSSHListFiles(params) {
        const { connectionId, remotePath } = params;
        // Check if the connection exists
        if (!this.connections.has(connectionId)) {
            return {
                content: [{ type: "text", text: `No active SSH connection with ID: ${connectionId}` }],
                isError: true
            };
        }
        const { conn } = this.connections.get(connectionId);
        try {
            // Get SFTP client
            const sftp = await new Promise((resolve, reject) => {
                conn.sftp((err, sftp) => {
                    if (err) {
                        reject(new Error(`Failed to initialize SFTP: ${err.message}`));
                    }
                    else {
                        resolve(sftp);
                    }
                });
            });
            // List files
            const files = await new Promise((resolve, reject) => {
                sftp.readdir(remotePath, (err, list) => {
                    if (err) {
                        reject(new Error(`Failed to list files: ${err.message}`));
                    }
                    else {
                        resolve(list);
                    }
                });
            });
            const fileList = files.map((file) => ({
                filename: file.filename,
                isDirectory: (file.attrs.mode & 16384) === 16384,
                size: file.attrs.size,
                lastModified: new Date(file.attrs.mtime * 1000).toISOString()
            }));
            return {
                content: [{
                        type: "text",
                        text: `Files in ${remotePath}:\n\n${JSON.stringify(fileList, null, 2)}`
                    }]
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Failed to list files: ${error.message}` }],
                isError: true
            };
        }
    }
    async handleSSHDisconnect(params) {
        const { connectionId } = params;
        // Check if the connection exists
        if (!this.connections.has(connectionId)) {
            return {
                content: [{ type: "text", text: `No active SSH connection with ID: ${connectionId}` }],
                isError: true
            };
        }
        const { conn, config } = this.connections.get(connectionId);
        try {
            // Close the connection
            conn.end();
            this.connections.delete(connectionId);
            return {
                content: [{ type: "text", text: `Disconnected from ${config.username}@${config.host}:${config.port}` }]
            };
        }
        catch (error) {
            return {
                content: [{ type: "text", text: `Failed to disconnect: ${error.message}` }],
                isError: true
            };
        }
    }
    async start() {
        try {
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            console.error("MCP SSH Server started. Waiting for requests...");
            // Handle graceful shutdown
            process.on('SIGINT', () => {
                console.error("Shutting down MCP SSH Server...");
                // Close all active connections
                for (const [connectionId, { conn }] of this.connections.entries()) {
                    try {
                        conn.end();
                    }
                    catch (error) {
                        console.error(`Failed to close connection ${connectionId}:`, error);
                    }
                }
                process.exit(0);
            });
        }
        catch (error) {
            console.error("Failed to start MCP SSH Server:", error);
            process.exit(1);
        }
    }
}
// Start the server
const server = new SSHMCPServer();
server.start().catch(console.error);
//# sourceMappingURL=index.js.map