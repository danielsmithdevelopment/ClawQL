export type TrivyFinding = {
  cveId: string
  severity: string
  package: string
  fixedVersion: string | null
}

export type OsvFinding = {
  osvId: string
  severity: string
  package: string
  fixedVersion: string | null
}

export type SecurityScanRunRecord = {
  runId: string
  timestamp: string
  commit: string
  branch: string
  scanners: {
    trivy: { result: 'pass' | 'fail'; findings?: TrivyFinding[] }
    osv: { result: 'pass' | 'fail'; findings?: OsvFinding[] }
  }
  sbom: {
    generated: boolean
    format: 'cyclonedx-json'
    artifactUrl: string
    artifactName?: string
  }
  signing: {
    signed: boolean
    imageDigest: string | null
  }
  overallResult: 'merged' | 'blocked'
  ciRunUrl: string
}

export type SecurityStatusHistory = {
  schemaVersion: 1
  updatedAt: string
  latestRelease: {
    version: string
    published: string | null
    commit: string | null
    sbomFormat: string
    sbomArtifactName: string
    image: {
      repository: string
      digest: string | null
      cosignVerifyCommand: string
    }
  }
  runs: SecurityScanRunRecord[]
}
