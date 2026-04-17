import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { installProtobufClientLogging } from "./mcp-protobuf-logging.js";
import { createLinkedMcpTransports } from "./linked-mcp-transport.js";

/**
 * Serialize access to an in-process MCP {@link Client} ↔ {@link McpServer} pair.
 * Protobuf unary/stream handlers share one SDK server; JSON-RPC is used in-process via a linked transport.
 */
export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(() => fn());
    this.tail = run.then(
      () => {},
      () => {}
    );
    return run;
  }
}

/**
 * One shared {@link McpServer} instance with a lazily connected SDK {@link Client} over {@link createLinkedMcpTransports}.
 */
export class McpProtobufBridge {
  private readonly mutex = new AsyncMutex();
  private readonly mcpServer: McpServer;
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;

  constructor(mcpServer: McpServer) {
    this.mcpServer = mcpServer;
  }

  /** Run `fn` with mutual exclusion when concurrent unary/stream RPCs overlap on the event loop. */
  async run<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      await this.ensureConnected();
      return fn(this.client!);
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.client) {
      return;
    }
    if (this.connecting) {
      return this.connecting;
    }
    this.connecting = this.doConnect();
    try {
      await this.connecting;
    } catch (e) {
      this.connecting = null;
      this.client = null;
      throw e;
    }
  }

  private async doConnect(): Promise<void> {
    const { clientTransport, serverTransport } = createLinkedMcpTransports();
    const client = new Client(
      { name: "mcp-grpc-protobuf-bridge", version: "0.0.0" },
      {
        capabilities: {
          sampling: {},
          roots: {},
          elicitation: {},
        },
      }
    );
    await this.mcpServer.connect(serverTransport);
    await client.connect(clientTransport);
    installProtobufClientLogging(client);
    this.client = client;
  }

  /** Server instructions from initialize (after connect). */
  getInstructions(): string | undefined {
    return this.client?.getInstructions();
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } finally {
      this.client = null;
      this.connecting = null;
    }
    await this.mcpServer.close();
  }
}
