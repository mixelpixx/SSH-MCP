/**
 * Ubuntu Website Management Tools for MCP SSH Server
 *
 * Extended tools specifically for managing Ubuntu web servers
 * and website deployments. This module provides specialized tools for managing
 * Nginx, system packages, SSL certificates, website deployments, and firewalls
 * on Ubuntu servers.
 */
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
// Utility function to execute commands with error handling
async function executeSSHCommand(conn, command, timeout = 60000) {
    return new Promise((resolve, reject) => {
        // Set up timeout
        const timeoutId = setTimeout(() => {
            reject(new Error(`Command execution timed out after ${timeout}ms`));
        }, timeout);
        conn.exec(command, {}, (err, stream) => {
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
}
// Helper function to check if a connection exists
function getConnection(connections, connectionId) {
    if (!connections.has(connectionId)) {
        throw new Error(`No active SSH connection with ID: ${connectionId}`);
    }
    return connections.get(connectionId).conn;
}
// Global connection map (will be populated by the main module)
let connectionMap;
// Tool handlers for Ubuntu-specific operations
// Export this to be accessible from index.ts
export const ubuntuToolHandlers = {
    // 1. Web Server Control (Nginx)
    async ubuntu_nginx_control(params) {
        const { connectionId, action, sudo = true } = params;
        try {
            const conn = getConnection(connectionMap, connectionId);
            // Validate action
            const validActions = ['start', 'stop', 'restart', 'status', 'reload', 'check-config'];
            if (!validActions.includes(action)) {
                throw new Error(`Invalid action: ${action}. Valid actions are: ${validActions.join(', ')}`);
            }
            let command = '';
            const sudoPrefix = sudo ? 'sudo ' : '';
            switch (action) {
                case 'start':
                case 'stop':
                case 'restart':
                case 'status':
                case 'reload':
                    command = `${sudoPrefix}systemctl ${action} nginx`;
                    break;
                case 'check-config':
                    command = `${sudoPrefix}nginx -t`;
                    break;
            }
            const result = await executeSSHCommand(conn, command);
            let status = result.code === 0 ? 'success' : 'error';
            let message = result.stdout || result.stderr;
            if (action === 'status') {
                // Extract status info from systemctl output
                const isActive = message.includes('Active: active');
                status = isActive ? 'active' : 'inactive';
            }
            return {
                content: [{
                        type: 'text',
                        text: `Nginx ${action} result: ${status}\n\n${message}`
                    }]
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `Nginx control error: ${error.message}` }],
                isError: true
            };
        }
    },
    // 2. System Package Updates
    async ubuntu_update_packages(params) {
        const { connectionId, securityOnly = false, upgrade = true, autoremove = false, sudo = true } = params;
        try {
            const conn = getConnection(connectionMap, connectionId);
            const sudoPrefix = sudo ? 'sudo ' : '';
            // Build the update command
            let commands = [];
            // Always update package lists first
            if (securityOnly) {
                commands.push(`${sudoPrefix}apt-get update -o Dir::Etc::SourceList=/etc/apt/security.sources.list`);
            }
            else {
                commands.push(`${sudoPrefix}apt-get update`);
            }
            // Upgrade if requested
            if (upgrade) {
                if (securityOnly) {
                    commands.push(`${sudoPrefix}apt-get upgrade -s | grep "^Inst" | grep -i security | awk '{print $2}' | xargs ${sudoPrefix}apt-get install -y`);
                }
                else {
                    commands.push(`${sudoPrefix}apt-get upgrade -y`);
                }
            }
            // Auto-remove if requested
            if (autoremove) {
                commands.push(`${sudoPrefix}apt-get autoremove -y`);
            }
            // Execute all commands in sequence and collect results
            let output = '';
            for (const cmd of commands) {
                const result = await executeSSHCommand(conn, cmd, 300000); // 5-minute timeout for upgrades
                output += `Command: ${cmd}\nExit code: ${result.code}\nOutput:\n${result.stdout || result.stderr}\n\n`;
            }
            return {
                content: [{
                        type: 'text',
                        text: `Package update completed.\n\n${output}`
                    }]
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `Package update error: ${error.message}` }],
                isError: true
            };
        }
    },
    // 3. SSL Certificate Management
    async ubuntu_ssl_certificate(params) {
        const { connectionId, action, domain, email, webroot = '/var/www/html', sudo = true } = params;
        try {
            const conn = getConnection(connectionMap, connectionId);
            const sudoPrefix = sudo ? 'sudo ' : '';
            // Validate action
            const validActions = ['issue', 'renew', 'status', 'list'];
            if (!validActions.includes(action)) {
                throw new Error(`Invalid action: ${action}. Valid actions are: ${validActions.join(', ')}`);
            }
            // Check for required parameters
            if ((action === 'issue' || action === 'renew') && !domain) {
                throw new Error(`Domain name is required for ${action} action`);
            }
            if (action === 'issue' && !email) {
                throw new Error('Email address is required for issue action');
            }
            // Ensure certbot is installed
            const checkCertbot = await executeSSHCommand(conn, 'which certbot || echo "not-found"');
            if (checkCertbot.stdout === 'not-found') {
                const installCertbot = await executeSSHCommand(conn, `${sudoPrefix}apt-get update && ${sudoPrefix}apt-get install -y certbot python3-certbot-nginx`);
                if (installCertbot.code !== 0) {
                    throw new Error(`Failed to install certbot: ${installCertbot.stderr}`);
                }
            }
            let command = '';
            switch (action) {
                case 'issue':
                    command = `${sudoPrefix}certbot certonly --webroot -w ${webroot} -d ${domain} --email ${email} --agree-tos --non-interactive`;
                    break;
                case 'renew':
                    command = domain
                        ? `${sudoPrefix}certbot renew --cert-name ${domain} --force-renewal`
                        : `${sudoPrefix}certbot renew`;
                    break;
                case 'status':
                    command = domain
                        ? `${sudoPrefix}certbot certificates -d ${domain}`
                        : `${sudoPrefix}certbot certificates`;
                    break;
                case 'list':
                    command = `${sudoPrefix}certbot certificates`;
                    break;
            }
            const result = await executeSSHCommand(conn, command);
            return {
                content: [{
                        type: 'text',
                        text: `SSL certificate ${action} result:\n\n${result.stdout || result.stderr}`
                    }]
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `SSL certificate error: ${error.message}` }],
                isError: true
            };
        }
    },
    // 4. Website Deployment & Backup
    async ubuntu_website_deployment(params) {
        const { connectionId, action, localPath, remotePath = '/var/www/html', backupPath = '/var/backups/websites', createBackup = true, sudo = true } = params;
        try {
            const conn = getConnection(connectionMap, connectionId);
            const sudoPrefix = sudo ? 'sudo ' : '';
            // Validate action
            const validActions = ['deploy', 'backup', 'restore'];
            if (!validActions.includes(action)) {
                throw new Error(`Invalid action: ${action}. Valid actions are: ${validActions.join(', ')}`);
            }
            // Create backup directory if it doesn't exist
            await executeSSHCommand(conn, `${sudoPrefix}mkdir -p ${backupPath}`);
            // Generate timestamp for backups
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `website-backup-${timestamp}.tar.gz`;
            const fullBackupPath = `${backupPath}/${backupFileName}`;
            let output = '';
            if (action === 'deploy') {
                // Check if localPath is provided
                if (!localPath) {
                    throw new Error('Local path is required for deployment');
                }
                // Create backup before deployment if requested
                if (createBackup) {
                    const backupCmd = `${sudoPrefix}tar -czf ${fullBackupPath} -C ${path.dirname(remotePath)} ${path.basename(remotePath)}`;
                    const backupResult = await executeSSHCommand(conn, backupCmd);
                    output += `Backup created: ${fullBackupPath}\n`;
                    if (backupResult.code !== 0) {
                        output += `Warning: Backup may have issues: ${backupResult.stderr}\n`;
                    }
                }
                // Expand tilde if present in the local path
                const expandedLocalPath = localPath.replace(/^~/, os.homedir());
                // Check if localPath exists
                if (!fs.existsSync(expandedLocalPath)) {
                    throw new Error(`Local path does not exist: ${expandedLocalPath}`);
                }
                // Get SFTP client for file upload
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
                // Check if localPath is a directory or a single file
                const stats = fs.statSync(expandedLocalPath);
                if (stats.isDirectory()) {
                    // For directories, we need to zip, upload, and extract
                    const tempZipFile = path.join(os.tmpdir(), `deployment-${timestamp}.zip`);
                    // Create a zip of the directory
                    await executeSSHCommand(conn, `zip -r ${tempZipFile} ${expandedLocalPath}`);
                    // Upload the zip file
                    await new Promise((resolve, reject) => {
                        sftp.fastPut(tempZipFile, `/tmp/deployment-${timestamp}.zip`, (err) => {
                            if (err) {
                                reject(new Error(`Failed to upload deployment file: ${err.message}`));
                            }
                            else {
                                resolve(true);
                            }
                        });
                    });
                    // Extract the zip file to the destination
                    await executeSSHCommand(conn, `${sudoPrefix}unzip -o /tmp/deployment-${timestamp}.zip -d ${remotePath}`);
                    // Clean up temporary files
                    fs.unlinkSync(tempZipFile);
                    await executeSSHCommand(conn, `${sudoPrefix}rm /tmp/deployment-${timestamp}.zip`);
                    output += `Deployed directory ${expandedLocalPath} to ${remotePath}`;
                }
                else {
                    // For a single file, upload directly
                    const remoteFilePath = path.join(remotePath, path.basename(expandedLocalPath));
                    await new Promise((resolve, reject) => {
                        sftp.fastPut(expandedLocalPath, remoteFilePath, (err) => {
                            if (err) {
                                reject(new Error(`Failed to upload file: ${err.message}`));
                            }
                            else {
                                resolve(true);
                            }
                        });
                    });
                    // Fix permissions
                    await executeSSHCommand(conn, `${sudoPrefix}chown www-data:www-data ${remoteFilePath}`);
                    output += `Deployed file ${expandedLocalPath} to ${remoteFilePath}`;
                }
            }
            else if (action === 'backup') {
                // Create backup
                const backupCmd = `${sudoPrefix}tar -czf ${fullBackupPath} -C ${path.dirname(remotePath)} ${path.basename(remotePath)}`;
                const backupResult = await executeSSHCommand(conn, backupCmd);
                if (backupResult.code === 0) {
                    output += `Backup created: ${fullBackupPath}`;
                }
                else {
                    throw new Error(`Backup failed: ${backupResult.stderr}`);
                }
            }
            else if (action === 'restore') {
                // List available backups
                const listResult = await executeSSHCommand(conn, `ls -la ${backupPath}`);
                // Return list if no specific backup file was provided
                if (!localPath) {
                    return {
                        content: [{
                                type: 'text',
                                text: `Available backups:\n\n${listResult.stdout}`
                            }]
                    };
                }
                // Restore from specific backup
                const restoreCmd = `${sudoPrefix}tar -xzf ${localPath} -C ${path.dirname(remotePath)}`;
                const restoreResult = await executeSSHCommand(conn, restoreCmd);
                if (restoreResult.code === 0) {
                    output += `Restored from backup: ${localPath} to ${remotePath}`;
                }
                else {
                    throw new Error(`Restore failed: ${restoreResult.stderr}`);
                }
            }
            return {
                content: [{
                        type: 'text',
                        text: output
                    }]
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `Website deployment error: ${error.message}` }],
                isError: true
            };
        }
    },
    // 5. Firewall (UFW) Management
    async ubuntu_ufw_firewall(params) {
        const { connectionId, action, port, protocol, from, sudo = true } = params;
        try {
            const conn = getConnection(connectionMap, connectionId);
            const sudoPrefix = sudo ? 'sudo ' : '';
            // Validate action
            const validActions = ['enable', 'disable', 'status', 'allow', 'deny', 'delete', 'reset'];
            if (!validActions.includes(action)) {
                throw new Error(`Invalid action: ${action}. Valid actions are: ${validActions.join(', ')}`);
            }
            // Ensure UFW is installed
            const checkUfw = await executeSSHCommand(conn, 'which ufw || echo "not-found"');
            if (checkUfw.stdout === 'not-found') {
                const installUfw = await executeSSHCommand(conn, `${sudoPrefix}apt-get update && ${sudoPrefix}apt-get install -y ufw`);
                if (installUfw.code !== 0) {
                    throw new Error(`Failed to install ufw: ${installUfw.stderr}`);
                }
            }
            let command = '';
            switch (action) {
                case 'enable':
                    command = `${sudoPrefix}ufw --force enable`;
                    break;
                case 'disable':
                    command = `${sudoPrefix}ufw disable`;
                    break;
                case 'status':
                    command = `${sudoPrefix}ufw status verbose`;
                    break;
                case 'reset':
                    command = `${sudoPrefix}ufw --force reset`;
                    break;
                case 'allow':
                case 'deny':
                    // Check if port is provided
                    if (!port) {
                        throw new Error('Port or service name is required for allow/deny actions');
                    }
                    let ruleCommand = `${sudoPrefix}ufw ${action} `;
                    // Add protocol if specified
                    if (protocol) {
                        ruleCommand += `${port}/${protocol} `;
                    }
                    else {
                        ruleCommand += `${port} `;
                    }
                    // Add source IP/network if specified
                    if (from) {
                        ruleCommand += `from ${from}`;
                    }
                    command = ruleCommand;
                    break;
                case 'delete':
                    if (!port) {
                        throw new Error('Port or service name is required for delete action');
                    }
                    let deleteCommand = `${sudoPrefix}ufw delete allow `;
                    if (protocol) {
                        deleteCommand += `${port}/${protocol}`;
                    }
                    else {
                        deleteCommand += port;
                    }
                    command = deleteCommand;
                    break;
            }
            const result = await executeSSHCommand(conn, command);
            return {
                content: [{
                        type: 'text',
                        text: `Firewall ${action} result:\n\n${result.stdout || result.stderr}`
                    }]
            };
        }
        catch (error) {
            return {
                content: [{ type: 'text', text: `Firewall error: ${error.message}` }],
                isError: true
            };
        }
    }
};
// Tool schema definitions
const ubuntuToolSchemas = {
    ubuntu_nginx_control: {
        description: 'Control Nginx web server on Ubuntu',
        inputSchema: {
            type: 'object',
            properties: {
                connectionId: {
                    type: 'string',
                    description: 'ID of an active SSH connection'
                },
                action: {
                    type: 'string',
                    description: 'Action to perform (start, stop, restart, status, reload, check-config)'
                },
                sudo: {
                    type: 'boolean',
                    description: 'Whether to run the command with sudo (default: true)'
                }
            },
            required: ['connectionId', 'action']
        }
    },
    ubuntu_update_packages: {
        description: 'Update system packages on Ubuntu',
        inputSchema: {
            type: 'object',
            properties: {
                connectionId: {
                    type: 'string',
                    description: 'ID of an active SSH connection'
                },
                securityOnly: {
                    type: 'boolean',
                    description: 'Whether to update only security packages (default: false)'
                },
                upgrade: {
                    type: 'boolean',
                    description: 'Whether to upgrade packages after update (default: true)'
                },
                autoremove: {
                    type: 'boolean',
                    description: 'Whether to remove unused packages after update (default: false)'
                },
                sudo: {
                    type: 'boolean',
                    description: 'Whether to run the command with sudo (default: true)'
                }
            },
            required: ['connectionId']
        }
    },
    ubuntu_ssl_certificate: {
        description: 'Manage SSL certificates using Let\'s Encrypt on Ubuntu',
        inputSchema: {
            type: 'object',
            properties: {
                connectionId: {
                    type: 'string',
                    description: 'ID of an active SSH connection'
                },
                action: {
                    type: 'string',
                    description: 'Action to perform (issue, renew, status, list)'
                },
                domain: {
                    type: 'string',
                    description: 'Domain name for the certificate (required for issue and renew)'
                },
                email: {
                    type: 'string',
                    description: 'Email address for Let\'s Encrypt notifications (required for issue)'
                },
                webroot: {
                    type: 'string',
                    description: 'Web root path for domain verification (default: /var/www/html)'
                },
                sudo: {
                    type: 'boolean',
                    description: 'Whether to run the command with sudo (default: true)'
                }
            },
            required: ['connectionId', 'action']
        }
    },
    ubuntu_website_deployment: {
        description: 'Deploy website files and create backups on Ubuntu',
        inputSchema: {
            type: 'object',
            properties: {
                connectionId: {
                    type: 'string',
                    description: 'ID of an active SSH connection'
                },
                action: {
                    type: 'string',
                    description: 'Action to perform (deploy, backup, restore)'
                },
                localPath: {
                    type: 'string',
                    description: 'Local path to the website files for deployment'
                },
                remotePath: {
                    type: 'string',
                    description: 'Remote path where the website is located (default: /var/www/html)'
                },
                backupPath: {
                    type: 'string',
                    description: 'Path to store backups (default: /var/backups/websites)'
                },
                createBackup: {
                    type: 'boolean',
                    description: 'Whether to create a backup before deployment (default: true)'
                },
                sudo: {
                    type: 'boolean',
                    description: 'Whether to run the command with sudo (default: true)'
                }
            },
            required: ['connectionId', 'action']
        }
    },
    ubuntu_ufw_firewall: {
        description: 'Manage Ubuntu Uncomplicated Firewall (UFW)',
        inputSchema: {
            type: 'object',
            properties: {
                connectionId: {
                    type: 'string',
                    description: 'ID of an active SSH connection'
                },
                action: {
                    type: 'string',
                    description: 'Action to perform (enable, disable, status, allow, deny, delete, reset)'
                },
                port: {
                    type: 'string',
                    description: 'Port number or service name (e.g., 80, 443, ssh, http)'
                },
                protocol: {
                    type: 'string',
                    description: 'Protocol (tcp, udp)'
                },
                from: {
                    type: 'string',
                    description: 'Source IP address or network'
                },
                sudo: {
                    type: 'boolean',
                    description: 'Whether to run the command with sudo (default: true)'
                }
            },
            required: ['connectionId', 'action']
        }
    }
};
/**
 * Add Ubuntu website management tools to the MCP SSH server
 */
export function addUbuntuTools(server, connections) {
    // Store connection map for tool handlers to use
    connectionMap = connections;
    // We can't retrieve existing handlers, so we need to work with the server object directly
    // Override the ListToolsRequestSchema handler to include Ubuntu tools
    // Note: This completely replaces the existing handler, so we need to include all tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        // Create array of Ubuntu tools
        const ubuntuTools = Object.entries(ubuntuToolSchemas).map(([name, schema]) => ({
            name,
            description: schema.description,
            inputSchema: schema.inputSchema
        }));
        // Return both core SSH tools and Ubuntu tools
        // Note: In a real implementation, we should coordinate with the main server to avoid duplicating tool definitions
        return {
            tools: [
                // Core SSH tools - keep in sync with the list in index.ts
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
                },
                // Add Ubuntu tools
                ...ubuntuTools
            ]
        };
    });
    console.log("Ubuntu website management tools loaded");
}
//# sourceMappingURL=ubuntu-website-tools.js.map