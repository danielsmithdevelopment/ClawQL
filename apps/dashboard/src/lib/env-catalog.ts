export type EnvKeyEntry = {
  key: string
  sensitive: boolean
}

export type EnvCatalogSection = {
  title: string
  keys: EnvKeyEntry[]
}

export type EnvCatalog = {
  sections: EnvCatalogSection[]
  source?: string
}
