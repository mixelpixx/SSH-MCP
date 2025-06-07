/**
 * Ubuntu Website Management Tools for MCP SSH Server
 *
 * Extended tools specifically for managing Ubuntu web servers
 * and website deployments.
 *
 * This file contains stub implementations that can be expanded later.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from "ssh2";
export declare function addUbuntuTools(server: Server, connections: Map<string, {
    conn: Client;
    config: any;
}>): void;
