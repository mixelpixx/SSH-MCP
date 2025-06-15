/**
 * Ubuntu Website Management Tools for MCP SSH Server
 *
 * Extended tools specifically for managing Ubuntu web servers
 * and website deployments. This module provides specialized tools for managing
 * Nginx, system packages, SSL certificates, website deployments, and firewalls
 * on Ubuntu servers.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from "ssh2";
type ToolHandler = (params: any) => Promise<any>;
export declare const ubuntuToolHandlers: Record<string, ToolHandler>;
/**
 * Add Ubuntu website management tools to the MCP SSH server
 */
export declare function addUbuntuTools(server: Server, connections: Map<string, {
    conn: Client;
    config: any;
}>): void;
export {};
