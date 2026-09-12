export type LocalCustomSourceKind =
  | 'openapi'
  | 'discovery'
  | 'graphql'
  | 'grpc'
  | 'mcp'
  | 'cli'

export type LocalCustomSourceEntry = {
  id: string
  name: string
  kind: LocalCustomSourceKind
  addedAt: string
  url?: string
  cachePath?: string
  graphqlEndpoint?: string
  grpcEndpoint?: string
  protoPath?: string
  grpcInsecure?: boolean
  mcpUrl?: string
  mcpCommand?: string
  mcpArgs?: string[]
  cliCommand?: string
  cliArgs?: string[]
  cliDescription?: string
}

export type LocalCustomSourcesFile = {
  version: 1
  sources: LocalCustomSourceEntry[]
}
